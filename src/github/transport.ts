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
  /** The URL the request went to. */
  url: URL;
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
    const followed = new Set<string>();
    let target: string | URL | null = path;
    let query: RestOptions["query"] = { per_page: 100, ...options.query };
    while (target) {
      const response = await this.#send(target, { query });
      query = undefined;
      followed.add(response.url.href);
      target = await scope(response, () => {
        const page = options.items ? (response.data as Json | null)?.[options.items] : response.data;
        if (!Array.isArray(page)) throw invalid(`GitHub returned no list for ${path}.`);
        for (const item of page) results.push(read(item));
        const next = nextPage(response.headers.get("link"));
        if (next && followed.has(next.href)) throw invalid("GitHub returned a next page it already served.");
        return next;
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
      if (result.errors !== undefined && !(Array.isArray(result.errors) && result.errors.every(isGraphqlError))) {
        throw invalid("GitHub returned unreadable GraphQL errors.");
      }
      if (result.errors && result.errors.length > 0) {
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
    const followed = new Set<string>();
    let after: string | null = null;
    do {
      after = await this.graphql(query, { ...variables, after }, async (data) => {
        const page = connectionPage(connection(data));
        for (const node of page.nodes) results.push(await read(node));
        if (page.after !== null && followed.has(page.after)) throw invalid("GitHub returned a cursor it already followed.");
        return page.after;
      });
      if (after !== null) followed.add(after);
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
    // Header names are case-insensitive. A caller's own header wins over
    // Postern's defaults; the connection's credential always wins.
    if (options.body !== undefined) headers["content-type"] = "application/json";
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      const key = name.toLowerCase();
      if (key !== "authorization") headers[key] = value;
    }
    if (token) headers.authorization = `Bearer ${token}`;
    const method = (options.method ?? "GET").toUpperCase();
    const request = `${method} ${url.pathname}`;
    // A failure to reach GitHub, or to receive the whole answer, is
    // `unavailable`, with the status once GitHub has stated one.
    const unreachable = (error: unknown, status?: number) =>
      new PlatformError(
        "unavailable",
        timedOut(error)
          ? `GitHub did not answer ${request} within ${this.#context.timeoutMs} ms.`
          : `GitHub could not be reached for ${request}.`,
        { cause: error, ...(status === undefined ? {} : { status }) },
      );
    // What `fetch` returns is read once: its status, headers and body. From
    // the status on, every failure carries it.
    let response: Response;
    try {
      response = await this.#context.fetch(url, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(this.#context.timeoutMs),
      });
    } catch (error) {
      throw unreachable(error);
    }
    let status: unknown;
    try {
      status = response.status;
    } catch (error) {
      throw invalid(`GitHub answered ${request} without a readable status.`, undefined, error);
    }
    if (typeof status !== "number" || !Number.isInteger(status) || status < 200 || status > 599) {
      throw invalid(`GitHub answered ${request} without a readable status.`);
    }
    let responseHeaders: Headers;
    try {
      responseHeaders = new Headers(response.headers);
    } catch (error) {
      throw invalid(`GitHub answered ${request} with unreadable headers.`, status, error);
    }
    let text: unknown;
    try {
      text = await response.text();
    } catch (error) {
      throw unreachable(error, status);
    }
    if (typeof text !== "string") throw invalid(`GitHub answered ${request} with an unreadable body.`, status);
    const data = parseBody(text, status);
    if (status >= 400) throw statusError(status, responseHeaders, data, request);
    if (data === undefined) throw invalid(`GitHub returned unreadable JSON for ${request}.`, status);
    return { url, status, headers: responseHeaders, data };
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

// A URL keeps a string with an unpaired surrogate only by replacing it, so
// such a path or query fails before any request instead of reaching another
// resource.
function apiUrl(path: string, query?: RestOptions["query"]): URL {
  const pairs = Object.entries(query ?? {}).map(([key, value]) => [key, String(value)] as const);
  if (![path, ...pairs.flat()].every((part) => part.isWellFormed())) {
    throw new PlatformError("rejected", "A request path or query holds text that cannot be encoded.");
  }
  const url = URL.canParse(path, apiOrigin) ? new URL(path, apiOrigin) : null;
  if (url?.origin !== apiOrigin) {
    throw new PlatformError("rejected", "A request path must stay on GitHub's API.");
  }
  // A URL that would change the path, or a query given twice, would send another request than the one asked for.
  if (url.pathname + url.search !== path || (url.search !== "" && pairs.length > 0)) {
    throw new PlatformError("rejected", "A request path must be sent as written.");
  }
  for (const [key, value] of pairs) url.searchParams.set(key, value);
  return url;
}

/**
 * The cursor after one page, or `null` on the last page: the one reading of
 * page metadata every list uses, GraphQL connections and REST Link headers
 * alike. Only a page that says exactly yes, with its cursor, continues, and
 * only one that says exactly no ends the list; any other page is unreadable,
 * since reading it either way would truncate the list or follow nothing.
 */
function pageAfter<Cursor>(hasNextPage: unknown, cursor: () => Cursor | undefined): Cursor | null {
  if (hasNextPage === false) return null;
  if (hasNextPage !== true) throw invalid("GitHub returned a page that does not say whether another follows.");
  const next = cursor();
  if (next === undefined) throw invalid("GitHub returned a page without its cursor.");
  return next;
}

/** One page of a GraphQL connection: its nodes, and the cursor after it, or `null` on its last page. */
export function connectionPage(value: unknown): { nodes: unknown[]; after: string | null } {
  const page = value as { nodes?: unknown; pageInfo?: unknown } | null | undefined;
  if (!page || typeof page !== "object" || !Array.isArray(page.nodes)) throw invalid("GitHub returned an unreadable page.");
  const info = page.pageInfo as { hasNextPage?: unknown; endCursor?: unknown } | null | undefined;
  if (!info || typeof info !== "object") throw invalid("GitHub returned a page without its page information.");
  const after = pageAfter(info.hasNextPage, () =>
    typeof info.endCursor === "string" && info.endCursor !== "" ? info.endCursor : undefined,
  );
  return { nodes: page.nodes, after };
}

// The next page's URL, from a REST Link header. Without the header, the page
// is the last.
function nextPage(header: string | null): URL | null {
  const relations = header === null ? new Map<string, string>() : links(header);
  return pageAfter(relations?.has("next"), () => {
    const target = relations?.get("next");
    if (target === undefined || !URL.canParse(target)) return undefined;
    const url = new URL(target);
    // A next link that leaves GitHub's API would carry the credential elsewhere.
    if (url.origin !== apiOrigin) throw invalid("GitHub returned a next page on another origin.");
    return url;
  });
}

// One link-value of a Link header (RFC 8288): its target, then its parameters.
const linkValue = /^\s*<([^>]*)>((?:\s*;\s*[\w!#$%&'*+.^`|~-]+\s*(?:=\s*(?:"[^"]*"|[^\s;,"]+))?)*)\s*$/;
const linkParameter = /;\s*([\w!#$%&'*+.^`|~-]+)\s*(?:=\s*(?:"([^"]*)"|([^\s;,"]+)))?/g;

// Each relation a Link header states, with its target; `undefined` for a
// header that is not a list of links each with one relation, or that states
// one relation twice. Empty list elements are ignored, as HTTP lists allow.
function links(header: string): Map<string, string> | undefined {
  const relations = new Map<string, string>();
  for (const element of splitLinks(header)) {
    if (element.trim() === "") continue;
    const match = linkValue.exec(element);
    if (!match) return undefined;
    const rels = [...match[2]!.matchAll(linkParameter)].filter(([, name]) => name!.toLowerCase() === "rel");
    if (rels.length !== 1) return undefined;
    const names = (rels[0]![2] ?? rels[0]![3] ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    if (names.length === 0) return undefined;
    for (const name of names) {
      if (relations.has(name)) return undefined;
      relations.set(name, match[1]!);
    }
  }
  return relations;
}

// The elements of a Link header, split at the commas outside a target and a
// quoted string.
function splitLinks(header: string): string[] {
  const elements: string[] = [];
  let current = "";
  let inside: ">" | '"' | null = null;
  for (const character of header) {
    if (inside === null && character === ",") {
      elements.push(current);
      current = "";
      continue;
    }
    if (inside === null && character === "<") inside = ">";
    else if (inside === null && character === '"') inside = '"';
    else if (character === inside) inside = null;
    current += character;
  }
  if (inside !== null) return ["<"];
  elements.push(current);
  return elements;
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
  return limitError(reason, `GitHub answered ${request} with ${status}${detail}`, status, headers);
}

// What a failing status says, read against the error reasons. A request the
// platform could answer later, such as one that timed out (408), reached the
// wrong server (421) or came too early (425), is `unavailable` like a server
// error. A resource withheld for legal reasons (451) is invisible, so
// `notFound`, and a failed precondition (412) is a write that lost a race. Any
// other client error is a request refused as invalid.
function statusReason(status: number, headers: Headers, message: string): PlatformErrorReason {
  switch (status) {
    case 401:
      return "unauthenticated";
    case 403:
      return rateLimited(headers, [message]) ? "rateLimited" : "forbidden";
    case 404:
    case 410:
    case 451:
      return "notFound";
    case 409:
    case 412:
      return "conflict";
    case 429:
      return "rateLimited";
    case 408:
    case 421:
    case 425:
      return "unavailable";
    default:
      return status >= 500 ? "unavailable" : "rejected";
  }
}

// Whether a response says a rate limit stopped it: an exhausted quota, a
// stated retry delay, or a message naming a rate limit. REST and GraphQL
// limits say it the same ways.
function rateLimited(headers: Headers, messages: string[]): boolean {
  return (
    headers.get("x-ratelimit-remaining") === "0" ||
    headers.has("retry-after") ||
    messages.some((message) => /rate limit/i.test(message))
  );
}

// A platform error, with `retryAt` when it is `rateLimited` and GitHub states
// when to retry.
function limitError(reason: PlatformErrorReason, message: string, status: number, headers: Headers): PlatformError {
  const retryAt = reason === "rateLimited" ? retryTime(headers) : undefined;
  return new PlatformError(reason, message, {
    status,
    ...(retryAt === undefined ? {} : { retryAt }),
  });
}

// The latest time a Date can hold, in milliseconds.
const latestTime = 8.64e15;

// When GitHub says to retry, following its documented handling of rate-limit
// errors: Retry-After when it is stated, otherwise the quota reset when
// `x-ratelimit-remaining` is `0`. Without either, as for a secondary limit
// with quota left, GitHub states no time and advises waiting at least a
// minute, so there is none. A time a Date cannot hold is not stated, nor is a
// date that does not exist, which `Date.parse` would move to another day.
function retryTime(headers: Headers): string | undefined {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter !== undefined) {
    const at = /^\d+$/.test(retryAfter) ? Date.now() + Number(retryAfter) * 1000 : httpDate(retryAfter);
    if (readableTime(at)) return new Date(at).toISOString();
  }
  const reset = headers.get("x-ratelimit-reset");
  if (headers.get("x-ratelimit-remaining") === "0" && reset !== null && /^\d+$/.test(reset.trim())) {
    const at = Number(reset) * 1000;
    if (readableTime(at)) return new Date(at).toISOString();
  }
  return undefined;
}

// An HTTP date in its preferred form, which a Date writes back unchanged only if the date exists.
function httpDate(value: string): number {
  const at = Date.parse(value);
  return readableTime(at) && new Date(at).toUTCString() === value ? at : Number.NaN;
}

function readableTime(at: number): boolean {
  return Number.isFinite(at) && Math.abs(at) <= latestTime;
}

const graphqlReasons: Record<string, PlatformErrorReason> = {
  NOT_FOUND: "notFound",
  FORBIDDEN: "forbidden",
  INSUFFICIENT_SCOPES: "forbidden",
  RATE_LIMITED: "rateLimited",
  RATE_LIMIT: "rateLimited",
};

interface GraphqlError {
  message: string;
  type?: string;
}

// A GraphQL error as the GraphQL specification requires it, an object with
// its message, and with GitHub's type, when it names one, as a string.
function isGraphqlError(value: unknown): value is GraphqlError {
  if (value === null || typeof value !== "object") return false;
  const { message, type } = value as { message?: unknown; type?: unknown };
  return typeof message === "string" && (type === undefined || typeof type === "string");
}

// A GraphQL error's reason: its first error's type when GitHub names one,
// otherwise a rate limit when the response says one stopped it, as GitHub's
// GraphQL limits may arrive without a type, and otherwise `rejected`.
function graphqlError(errors: GraphqlError[], status: number, headers: Headers): PlatformError {
  const [first] = errors as [GraphqlError, ...GraphqlError[]];
  const messages = errors.map((error) => error.message);
  const reason = graphqlReasons[first.type ?? ""] ?? (rateLimited(headers, messages) ? "rateLimited" : "rejected");
  return limitError(reason, `GitHub's GraphQL API answered: ${first.message}`, status, headers);
}

/** An unreadable response. Within a scope, the scope supplies the status. */
export function invalid(message: string, status?: number, cause?: unknown): PlatformError {
  return new PlatformError("invalidResponse", message, {
    ...(status === undefined ? {} : { status }),
    ...(cause === undefined ? {} : { cause }),
  });
}
