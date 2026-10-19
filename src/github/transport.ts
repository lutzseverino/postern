// Requests to GitHub's REST and GraphQL APIs, with pagination and the mapping
// of every failure onto a platform error reason.

import type { AdapterContext } from "../connection.ts";
import { PlatformError } from "../errors.ts";
import type { PlatformErrorReason } from "../errors.ts";

export const apiOrigin = "https://api.github.com";
const apiVersion = "2022-11-28";
const userAgent = "@lutzseverino/postern";

export interface RestOptions {
  method?: string;
  query?: Record<string, string | number | boolean> | undefined;
  body?: unknown;
  headers?: Record<string, string> | undefined;
}

export interface RawResponse {
  status: number;
  headers: Headers;
  data: unknown;
}

type Json = Record<string, unknown>;

export class GitHubTransport {
  readonly #context: AdapterContext;

  constructor(context: AdapterContext) {
    this.#context = context;
  }

  /** One REST request; a failing status rejects with its platform error. */
  async rest(path: string, options: RestOptions = {}): Promise<RawResponse> {
    return this.#send(apiUrl(path, options.query), options);
  }

  /** Every item across the pages of a REST list, following `Link: rel="next"`. */
  async restPages<T>(path: string, options: { query?: RestOptions["query"]; items?: string } = {}): Promise<T[]> {
    const items: T[] = [];
    let url: URL | null = apiUrl(path, { per_page: 100, ...options.query });
    while (url) {
      const response = await this.#send(url, {});
      const page = options.items ? (response.data as Json | null)?.[options.items] : response.data;
      if (!Array.isArray(page)) throw invalid(`GitHub returned no list for ${url.pathname}.`);
      items.push(...(page as T[]));
      url = nextPage(response.headers.get("link"));
    }
    return items;
  }

  /** One GraphQL query; GraphQL errors reject with their platform error. */
  async graphql<T = Json>(query: string, variables: Json): Promise<T> {
    const response = await this.#send(apiUrl("/graphql"), { method: "POST", body: { query, variables } });
    const result = response.data as { data?: unknown; errors?: unknown } | null;
    if (!result || typeof result !== "object") throw invalid("GitHub returned no GraphQL result.");
    if (Array.isArray(result.errors) && result.errors.length > 0) {
      throw graphqlError(result.errors, response.headers);
    }
    if (!result.data || typeof result.data !== "object") throw invalid("GitHub returned no GraphQL data.");
    return result.data as T;
  }

  /** Every node across the pages of a GraphQL connection. */
  async graphqlPages<T>(
    query: string,
    variables: Json,
    connection: (data: Json) => { nodes?: unknown; pageInfo?: { hasNextPage?: unknown; endCursor?: unknown } } | null | undefined,
  ): Promise<T[]> {
    const nodes: T[] = [];
    let after: string | null = null;
    for (;;) {
      const page = connection(await this.graphql<Json>(query, { ...variables, after }));
      if (!page || !Array.isArray(page.nodes) || !page.pageInfo) throw invalid("GitHub returned an unreadable page.");
      nodes.push(...(page.nodes as T[]));
      if (page.pageInfo.hasNextPage !== true) return nodes;
      if (typeof page.pageInfo.endCursor !== "string") throw invalid("GitHub returned a page without its cursor.");
      after = page.pageInfo.endCursor;
    }
  }

  async #send(url: URL, options: RestOptions): Promise<RawResponse> {
    const token = await this.#context.credentials.token();
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "user-agent": userAgent,
      "x-github-api-version": apiVersion,
    };
    // Header names are case-insensitive; the connection's credential always wins.
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      const key = name.toLowerCase();
      if (key !== "authorization") headers[key] = value;
    }
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const method = (options.method ?? "GET").toUpperCase();
    let response: Response;
    let text: string;
    try {
      response = await this.#context.fetch(url, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(this.#context.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new PlatformError(
        "unavailable",
        timedOut
          ? `GitHub did not answer ${method} ${url.pathname} within ${this.#context.timeoutMs} ms.`
          : `GitHub could not be reached for ${method} ${url.pathname}.`,
        { cause: error },
      );
    }
    const data = parseBody(text, response);
    if (response.status >= 400) throw statusError(response, data, `${method} ${url.pathname}`);
    if (data === undefined) throw invalid(`GitHub returned unreadable JSON for ${method} ${url.pathname}.`, response.status);
    return { status: response.status, headers: response.headers, data };
  }
}

function apiUrl(path: string, query?: RestOptions["query"]): URL {
  const url = new URL(path, apiOrigin);
  if (url.origin !== apiOrigin) {
    throw new PlatformError("rejected", "A request path must stay on GitHub's API.");
  }
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
  return url;
}

function nextPage(link: string | null): URL | null {
  for (const part of link?.split(",") ?? []) {
    const match = /<([^>]+)>\s*;\s*rel="?next"?/.exec(part);
    if (!match) continue;
    const url = new URL(match[1]!);
    // A next link that leaves GitHub's API would carry the credential elsewhere.
    if (url.origin !== apiOrigin) throw invalid("GitHub returned a next page on another origin.");
    return url;
  }
  return null;
}

// `null` for an empty body, `undefined` for one that is not JSON.
function parseBody(text: string, response: Response): unknown {
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return response.status >= 400 ? null : undefined;
  }
}

function statusError(response: Response, data: unknown, request: string): PlatformError {
  const status = response.status;
  const message = (data as { message?: unknown } | null)?.message;
  const detail = typeof message === "string" && message ? `: ${message}` : "";
  const reason = statusReason(status, response.headers, typeof message === "string" ? message : "");
  const retryAt = reason === "rateLimited" ? retryTime(response.headers) : undefined;
  return new PlatformError(reason, `GitHub answered ${request} with ${status}${detail}`, {
    status,
    ...(retryAt === undefined ? {} : { retryAt }),
  });
}

function statusReason(status: number, headers: Headers, message: string): PlatformErrorReason {
  if (status === 401) return "unauthenticated";
  if (status === 429) return "rateLimited";
  if (status === 403) {
    const exhausted =
      headers.get("x-ratelimit-remaining") === "0" ||
      headers.has("retry-after") ||
      /rate limit/i.test(message);
    return exhausted ? "rateLimited" : "forbidden";
  }
  if (status === 404 || status === 410) return "notFound";
  if (status === 409) return "conflict";
  if (status >= 500) return "unavailable";
  return "rejected";
}

// The later of the stated retry delay and the quota reset, when either is stated.
function retryTime(headers: Headers): string | undefined {
  const candidates: number[] = [];
  const retryAfter = headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    const at = /^\d+$/.test(retryAfter.trim()) ? Date.now() + seconds * 1000 : Date.parse(retryAfter);
    if (Number.isFinite(at)) candidates.push(at);
  }
  const reset = headers.get("x-ratelimit-reset");
  if (reset !== null && /^\d+$/.test(reset.trim())) candidates.push(Number(reset) * 1000);
  return candidates.length ? new Date(Math.max(...candidates)).toISOString() : undefined;
}

const graphqlReasons: Record<string, PlatformErrorReason> = {
  NOT_FOUND: "notFound",
  FORBIDDEN: "forbidden",
  INSUFFICIENT_SCOPES: "forbidden",
  RATE_LIMITED: "rateLimited",
  RATE_LIMIT: "rateLimited",
};

function graphqlError(errors: unknown[], headers: Headers): PlatformError {
  const first = errors[0] as { type?: unknown; message?: unknown } | null;
  const type = typeof first?.type === "string" ? first.type : "";
  const reason = graphqlReasons[type] ?? "rejected";
  const message = typeof first?.message === "string" ? first.message : "GraphQL query failed";
  const retryAt = reason === "rateLimited" ? retryTime(headers) : undefined;
  return new PlatformError(reason, `GitHub's GraphQL API answered: ${message}`, {
    ...(retryAt === undefined ? {} : { retryAt }),
  });
}

export function invalid(message: string, status?: number): PlatformError {
  return new PlatformError("invalidResponse", message, status === undefined ? {} : { status });
}
