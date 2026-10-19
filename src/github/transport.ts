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

/**
 * GitHub's REST and GraphQL APIs. Each method hands the caller's `read` a
 * response to map, and runs it in that response's scope: every failure the
 * mapping raises, such as a missing field, an unreadable ID or a page without
 * its cursor, is a `PlatformError` carrying the response's HTTP status. No
 * response leaves the transport except through a scope.
 */
export class GitHubTransport {
  readonly #context: AdapterContext;

  constructor(context: AdapterContext) {
    this.#context = context;
  }

  /** One REST request; a failing status rejects with its platform error. */
  async rest<T>(path: string, options: RestOptions, read: (response: RawResponse) => T | Promise<T>): Promise<T> {
    const response = await this.#send(path, options);
    return scope(response, () => read(response));
  }

  /** Every item across the pages of a REST list, following `Link: rel="next"`, each read in its page's scope. */
  async restPages<T>(
    path: string,
    options: { query?: RestOptions["query"]; items?: string },
    read: (item: unknown) => T,
  ): Promise<T[]> {
    const results: T[] = [];
    let target: string | URL | null = path;
    let query: RestOptions["query"] = { per_page: 100, ...options.query };
    while (target) {
      const response = await this.#send(target, { query });
      query = undefined;
      target = await scope(response, () => {
        const page = options.items ? (response.data as Json | null)?.[options.items] : response.data;
        if (!Array.isArray(page)) throw invalid(`GitHub returned no list for ${path}.`);
        for (const item of page) results.push(read(item));
        return nextPage(response.headers.get("link"));
      });
    }
    return results;
  }

  /** One GraphQL query, its data read in the response's scope; GraphQL errors reject with their platform error. */
  async graphql<T>(query: string, variables: Json, read: (data: Json) => T | Promise<T>): Promise<T> {
    const response = await this.#send("/graphql", { method: "POST", body: { query, variables } });
    return scope(response, () => {
      const result = response.data as { data?: unknown; errors?: unknown } | null;
      if (!result || typeof result !== "object") throw invalid("GitHub returned no GraphQL result.");
      if (Array.isArray(result.errors) && result.errors.length > 0) {
        throw graphqlError(result.errors, response.status, response.headers);
      }
      if (!result.data || typeof result.data !== "object") throw invalid("GitHub returned no GraphQL data.");
      return read(result.data as Json);
    });
  }

  /** Every node across the pages of a GraphQL connection, each read in its page's scope. */
  async graphqlPages<T>(
    query: string,
    variables: Json,
    connection: (data: Json) => unknown,
    read: (node: unknown) => T | Promise<T>,
  ): Promise<T[]> {
    const results: T[] = [];
    let after: string | null = null;
    do {
      after = await this.graphql(query, { ...variables, after }, async (data) => {
        const page = connection(data) as { nodes?: unknown; pageInfo?: { hasNextPage?: unknown; endCursor?: unknown } } | null;
        if (!page || !Array.isArray(page.nodes) || !page.pageInfo || typeof page.pageInfo !== "object") {
          throw invalid("GitHub returned an unreadable page.");
        }
        for (const node of page.nodes) results.push(await read(node));
        if (page.pageInfo.hasNextPage !== true) return null;
        if (typeof page.pageInfo.endCursor !== "string") throw invalid("GitHub returned a page without its cursor.");
        return page.pageInfo.endCursor;
      });
    } while (after !== null);
    return results;
  }

  // A failure here is the request's own, so an enclosing scope leaves it as it is.
  async #send(target: string | URL, options: RestOptions): Promise<RawResponse> {
    try {
      return await this.#exchange(target, options);
    } catch (error) {
      if (error instanceof PlatformError) settled.add(error);
      throw error;
    }
  }

  async #exchange(target: string | URL, options: RestOptions): Promise<RawResponse> {
    const url = typeof target === "string" ? apiUrl(target, options.query) : target;
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
    // What `fetch` returns is read once: its status, headers and body.
    let status: unknown;
    let responseHeaders: Headers;
    let text: string;
    try {
      const response = await this.#context.fetch(url, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(this.#context.timeoutMs),
      });
      status = response.status;
      responseHeaders = new Headers(response.headers);
      text = String(await response.text());
    } catch (error) {
      throw new PlatformError(
        "unavailable",
        timedOut(error)
          ? `GitHub did not answer ${method} ${url.pathname} within ${this.#context.timeoutMs} ms.`
          : `GitHub could not be reached for ${method} ${url.pathname}.`,
        { cause: error },
      );
    }
    if (typeof status !== "number" || !Number.isInteger(status) || status < 200 || status > 599) {
      throw invalid(`GitHub answered ${method} ${url.pathname} without a readable status.`);
    }
    const data = parseBody(text, status);
    if (status >= 400) throw statusError(status, responseHeaders, data, `${method} ${url.pathname}`);
    if (data === undefined) throw invalid(`GitHub returned unreadable JSON for ${method} ${url.pathname}.`, status);
    return { status, headers: responseHeaders, data };
  }
}

// Failures tied to their own request: raised before it had a response, or
// already carrying the status of the response that caused them.
const settled = new WeakSet<PlatformError>();

// Runs `read` over one response. A failure it raises that no inner request
// settled gets the response's status, and any other error becomes
// `invalidResponse` with that status.
async function scope<T>(response: RawResponse, read: () => T | Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    let failure: PlatformError;
    if (!(error instanceof PlatformError)) {
      failure = invalid("GitHub returned a response the adapter could not read.", response.status, error);
    } else if (settled.has(error) || error.status !== undefined) {
      failure = error;
    } else {
      failure = new PlatformError(error.reason, error.message, {
        status: response.status,
        ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }),
        ...(error.cause === undefined ? {} : { cause: error.cause }),
      });
    }
    settled.add(failure);
    throw failure;
  }
}

function timedOut(error: unknown): boolean {
  try {
    const name = error instanceof Error ? error.name : undefined;
    return name === "TimeoutError" || name === "AbortError";
  } catch {
    return false;
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

// The next page's URL. A next link without one would end the list early.
function nextPage(link: string | null): URL | null {
  for (const part of link?.split(",") ?? []) {
    if (!/;\s*rel="?next"?\s*(;|$)/.test(part)) continue;
    const target = /^\s*<([^>]+)>/.exec(part)?.[1];
    if (target === undefined || !URL.canParse(target)) throw invalid("GitHub returned a next page link without its URL.");
    const url = new URL(target);
    // A next link that leaves GitHub's API would carry the credential elsewhere.
    if (url.origin !== apiOrigin) throw invalid("GitHub returned a next page on another origin.");
    return url;
  }
  return null;
}

// `null` for an empty body, `undefined` for one that is not JSON.
function parseBody(text: string, status: number): unknown {
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return status >= 400 ? null : undefined;
  }
}

function statusError(status: number, headers: Headers, data: unknown, request: string): PlatformError {
  const message = (data as { message?: unknown } | null)?.message;
  const detail = typeof message === "string" && message ? `: ${message}` : "";
  const reason = statusReason(status, headers, typeof message === "string" ? message : "");
  const retryAt = reason === "rateLimited" ? retryTime(headers) : undefined;
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

function graphqlError(errors: unknown[], status: number, headers: Headers): PlatformError {
  const first = errors[0] as { type?: unknown; message?: unknown } | null;
  const type = typeof first?.type === "string" ? first.type : "";
  const reason = graphqlReasons[type] ?? "rejected";
  const message = typeof first?.message === "string" ? first.message : "GraphQL query failed";
  const retryAt = reason === "rateLimited" ? retryTime(headers) : undefined;
  return new PlatformError(reason, `GitHub's GraphQL API answered: ${message}`, {
    status,
    ...(retryAt === undefined ? {} : { retryAt }),
  });
}

/** An unreadable response. Within a scope, the scope supplies the status. */
export function invalid(message: string, status?: number, cause?: unknown): PlatformError {
  return new PlatformError("invalidResponse", message, {
    ...(status === undefined ? {} : { status }),
    ...(cause === undefined ? {} : { cause }),
  });
}
