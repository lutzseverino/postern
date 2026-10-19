// Opening a connection: option validation, platform selection, and the shared
// layer every adapter's ports pass through. That layer checks arguments,
// enforces capability flags, and keeps credentials out of errors and results.
// Every object a caller passes in is read once through `snapshot.ts`, and only
// that copy is checked and used.

import { detectPlatform, githubHost, isGitHubRepositoryPath } from "./detect.ts";
import type { PlatformName, RepositoryIdentity } from "./detect.ts";
import { PlatformError } from "./errors.ts";
import { githubAdapter } from "./github/adapter.ts";
import { capabilityFlags } from "./ports.ts";
import type {
  Access,
  Account,
  Issue,
  IssueFilter,
  IssueTracker,
  Label,
  PullRequest,
  PullRequests,
  ReleaseSource,
  SquashMerge,
  TransportRequest,
} from "./ports.ts";
import { Secrets, credentialsFrom, isSendableToken } from "./secrets.ts";
import type { CredentialSource, Credentials } from "./secrets.ts";
import { entries, fields, items, shape } from "./snapshot.ts";

/** The body section names an adapter without native links reads relationships from. */
export interface RelationshipSections {
  parent: string;
  blockedBy: string;
}

export interface ConnectOptions {
  /** A token, or a function returning one. Without it the connection is anonymous. */
  credential?: CredentialSource;
  /** Section names for platforms without native links. There is no default. */
  relationshipSections?: RelationshipSections;
  /** The `fetch` implementation requests go through. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /**
   * How long one request may take before it fails with `unavailable`: a whole
   * number of milliseconds from 1 to 2147483647. Defaults to 30 seconds.
   */
  timeoutMs?: number;
}

/** One repository on its platform, reached through the four ports. */
export interface Connection {
  readonly repository: RepositoryIdentity;
  readonly issueTracker: IssueTracker;
  readonly pullRequests: PullRequests;
  readonly releaseSource: ReleaseSource;
  readonly access: Access;
}

/** What an adapter receives to build its ports. */
export interface AdapterContext {
  repository: RepositoryIdentity;
  credentials: Credentials;
  relationshipSections: RelationshipSections | null;
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
}

export interface AdapterPorts {
  issueTracker: IssueTracker;
  pullRequests: PullRequests;
  releaseSource: ReleaseSource;
  access: Access;
}

export type PlatformAdapter = (context: AdapterContext) => AdapterPorts;

const adapters: Record<PlatformName, PlatformAdapter> = {
  github: githubAdapter,
};

// Each platform's own rules for a repository identity given directly, matching
// what detection accepts from a remote.
const identityChecks: Record<PlatformName, (host: string, path: string) => RepositoryIdentity> = {
  github(host, path) {
    if (host.toLowerCase() !== githubHost) {
      throw new PlatformError("unsupported", "No platform adapter serves GitHub repositories on this host.");
    }
    checkOption(isGitHubRepositoryPath(path), "A GitHub repository path is exactly an owner and a name, such as owner/name.");
    return { platform: "github", host: githubHost, path };
  },
};

const defaultTimeoutMs = 30_000;
// The longest delay a Node.js timer keeps; a longer one silently fires after 1 ms.
const maxTimeoutMs = 2 ** 31 - 1;

// The methods `fetch` sends; it refuses CONNECT, TRACE and TRACK.
const transportMethods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

// Headers about the connection and the message's framing, which `fetch` sets
// itself: it replaces a caller's value or refuses the request when it sends it.
const transportHeaders = new Set(["connection", "content-length", "expect", "host", "keep-alive", "transfer-encoding", "upgrade"]);

// A header value `fetch` sends as written: visible ASCII, Latin-1 and inner
// spaces or tabs. It trims outer whitespace and refuses control characters.
const headerValue = /^(?:[\x21-\x7e\x80-\xff](?:[\t\x20-\x7e\x80-\xff]*[\x21-\x7e\x80-\xff])?)?$/;

/**
 * Opens a connection to one repository, given its Git remote URL or identity.
 * Fails with `unsupported` for a platform no adapter serves and with
 * `rejected` for invalid options.
 */
export function connect(repository: string | RepositoryIdentity, options: ConnectOptions = {}): Connection {
  const identity = typeof repository === "string" ? detectPlatform(repository) : checkIdentity(repository);
  const adapter = adapters[identity.platform];
  return createConnection(identity, adapter, options);
}

/** Wraps an adapter's ports in the shared layer. Exposed to tests, not to consumers. */
export function createConnection(
  repository: RepositoryIdentity,
  adapter: PlatformAdapter,
  options: ConnectOptions,
): Connection {
  const checked = checkOptions(options);
  const secrets = new Secrets();
  const context: AdapterContext = {
    repository: { ...repository },
    credentials: credentialsFrom(checked.credential, secrets),
    relationshipSections: checked.relationshipSections ?? null,
    fetch: checked.fetch ?? globalThis.fetch,
    timeoutMs: checked.timeoutMs ?? defaultTimeoutMs,
  };
  const ports = adapter(context);
  const issueCapabilities = offered(ports.issueTracker.capabilities, capabilityFlags.issueTracker);
  const marked = issueCapabilities.botMarking === true;
  const layer: Layer = {
    guard: (operation) => shielded(secrets, operation),
    account: (value) => (value && !marked ? { ...value, bot: null } : value),
  };
  return Object.freeze({
    repository: Object.freeze({ ...repository }),
    issueTracker: guardIssueTracker(ports.issueTracker, issueCapabilities, context, layer),
    pullRequests: guardPullRequests(ports.pullRequests, layer),
    releaseSource: guardReleaseSource(ports.releaseSource, layer),
    access: guardAccess(ports.access, layer),
  });
}

// What every port's guard shares: running an operation with credentials kept
// out of its errors and results, and reporting an account with `bot` behind
// the issue tracker's `botMarking`, whichever port returns it.
interface Layer {
  guard<T>(operation: () => Promise<T>): Promise<T>;
  account(value: Account | null): Account | null;
}

// The flags a port offers: only the known ones, and only where exactly true,
// so the reported flags and the ones the layer enforces never differ.
function offered<Name extends string>(
  capabilities: unknown,
  names: readonly Name[],
): Readonly<Partial<Record<Name, true>>> {
  const flags: Partial<Record<Name, true>> = {};
  if (capabilities !== null && typeof capabilities === "object") {
    for (const name of names) {
      if ((capabilities as Record<string, unknown>)[name] === true) flags[name] = true;
    }
  }
  return Object.freeze(flags);
}

async function shielded<T>(secrets: Secrets, operation: () => Promise<T>): Promise<T> {
  try {
    return secrets.redact(await operation());
  } catch (error) {
    throw secrets.sanitize(error);
  }
}

function guardIssueTracker(
  port: IssueTracker,
  capabilities: IssueTracker["capabilities"],
  context: AdapterContext,
  { guard, account }: Layer,
): IssueTracker {
  const sections = context.relationshipSections !== null;
  const issueFacts = (issue: Issue): Issue => ({
    ...issue,
    author: account(issue.author),
    parent: capabilities.nativeParent || sections ? issue.parent : null,
    subIssues: capabilities.nativeParent || sections ? issue.subIssues : [],
    blockedBy: capabilities.nativeBlockers || sections ? issue.blockedBy : [],
    bodyEditTime: capabilities.bodyEditTime ? issue.bodyEditTime : null,
    linkTime: capabilities.linkTime ? issue.linkTime : null,
  });
  return Object.freeze({
    capabilities,
    issues: (filter: IssueFilter = {}) =>
      guard(async () => (await port.issues(checkIssueFilter(filter))).map(issueFacts)),
    issue: (number: number) =>
      guard(async () => {
        checkNumber(number, "issue number");
        return issueFacts(await port.issue(number));
      }),
    labelChanges: (number: number) =>
      guard(async () => {
        checkNumber(number, "issue number");
        return (await port.labelChanges(number)).map((change) => ({ ...change, actor: account(change.actor) }));
      }),
    comments: (number: number) =>
      guard(async () => {
        checkNumber(number, "issue number");
        return (await port.comments(number)).map((comment) => ({ ...comment, author: account(comment.author) }));
      }),
    addLabels: (number: number, labels: readonly string[]) =>
      guard(async () => {
        checkNumber(number, "issue number");
        const names = items(labels, "Name at least one label to add.") as string[];
        if (names.length === 0) reject("Name at least one label to add.");
        for (const name of names) checkText(name, "label");
        await port.addLabels(number, names);
      }),
    removeLabel: (number: number, label: string) =>
      guard(async () => {
        checkNumber(number, "issue number");
        checkText(label, "label");
        await port.removeLabel(number, label);
      }),
    createLabel: (label: Label) =>
      guard(async () => {
        const { name, color, description } = fields(
          label,
          ["name", "color", "description"],
          "A label needs a name, color and description.",
        );
        checkText(name, "label name");
        if (typeof color !== "string" || !/^[0-9a-fA-F]{6}$/.test(color)) {
          reject("A label color is six hexadecimal digits without '#'.");
        }
        if (!isText(description)) reject("A label description is a string.");
        return port.createLabel({ name, color, description });
      }),
    createComment: (number: number, body: string) =>
      guard(async () => {
        checkNumber(number, "issue number");
        checkText(body, "comment body");
        const comment = await port.createComment(number, body);
        return { ...comment, author: account(comment.author) };
      }),
    updateComment: (id: number, body: string) =>
      guard(async () => {
        checkNumber(id, "comment ID");
        checkText(body, "comment body");
        const comment = await port.updateComment(id, body);
        return { ...comment, author: account(comment.author) };
      }),
    closeIssue: (number: number) =>
      guard(async () => {
        checkNumber(number, "issue number");
        await port.closeIssue(number);
      }),
  });
}

function guardPullRequests(port: PullRequests, { guard, account }: Layer): PullRequests {
  const capabilities = offered(port.capabilities, capabilityFlags.pullRequests);
  const pullFacts = (pull: PullRequest): PullRequest => ({ ...pull, author: account(pull.author) });
  return Object.freeze({
    capabilities,
    byHeadBranch: (branch: string) =>
      guard(async () => {
        checkText(branch, "head branch");
        return (await port.byHeadBranch(branch)).map(pullFacts);
      }),
    closing: (issueNumber: number) =>
      guard(async () => {
        checkNumber(issueNumber, "issue number");
        if (!capabilities.closingReferences) unsupported("closingReferences");
        return (await port.closing(issueNumber)).map(pullFacts);
      }),
    pullRequest: (number: number) =>
      guard(async () => {
        checkNumber(number, "pull request number");
        return pullFacts(await port.pullRequest(number));
      }),
    reviews: (number: number) =>
      guard(async () => {
        checkNumber(number, "pull request number");
        return (await port.reviews(number)).map((review) => ({
          ...review,
          author: account(review.author),
          commit: capabilities.reviewCommits ? review.commit : null,
        }));
      }),
    reviewThreads: (number: number) =>
      guard(async () => {
        checkNumber(number, "pull request number");
        return (await port.reviewThreads(number)).map((thread) => ({ ...thread, author: account(thread.author) }));
      }),
    checks: (commit: string) =>
      guard(async () => {
        checkText(commit, "commit");
        return port.checks(commit);
      }),
    mergesThroughQueue: (number: number) =>
      guard(async () => {
        checkNumber(number, "pull request number");
        return port.mergesThroughQueue(number);
      }),
    comment: (number: number, body: string) =>
      guard(async () => {
        checkNumber(number, "pull request number");
        checkText(body, "comment body");
        const comment = await port.comment(number, body);
        return { ...comment, author: account(comment.author) };
      }),
    squashMerge: (number: number, merge: SquashMerge) =>
      guard(async () => {
        checkNumber(number, "pull request number");
        const { expectedHead, title, body } = fields(
          merge,
          ["expectedHead", "title", "body"],
          "A squash merge needs its expected head, title and body.",
        );
        checkText(expectedHead, "expected head commit");
        checkText(title, "merge title");
        if (!isText(body)) reject("A merge body is a string.");
        return port.squashMerge(number, { expectedHead, title, body });
      }),
  });
}

function guardReleaseSource(port: ReleaseSource, { guard }: Layer): ReleaseSource {
  const capabilities = offered(port.capabilities, capabilityFlags.releaseSource);
  return Object.freeze({
    capabilities,
    releases: () =>
      guard(async () =>
        (await port.releases()).map((release) => ({
          ...release,
          draft: capabilities.drafts ? release.draft : null,
          prerelease: capabilities.prereleases ? release.prerelease : null,
        })),
      ),
    tagCommit: (tag: string) =>
      guard(async () => {
        checkText(tag, "tag");
        return port.tagCommit(tag);
      }),
  });
}

function guardAccess(port: Access, { guard, account }: Layer): Access {
  return Object.freeze({
    capabilities: offered(port.capabilities, capabilityFlags.access),
    viewer: () => guard(async () => account(await port.viewer())),
    role: (login: string) =>
      guard(async () => {
        checkText(login, "login");
        return port.role(login);
      }),
    request: (request: TransportRequest) => guard(async () => port.request(checkTransportRequest(request))),
  });
}

// The identity's fields, read once, checked by its platform's rules.
function checkIdentity(identity: RepositoryIdentity): RepositoryIdentity {
  if (identity === null || typeof identity !== "object") {
    throw new PlatformError("unsupported", "No platform adapter serves this repository identity.");
  }
  const { platform, host, path } = fields(identity, ["platform", "host", "path"], "A repository identity is an object.");
  if (typeof platform !== "string" || !Object.hasOwn(identityChecks, platform)) {
    throw new PlatformError("unsupported", "No platform adapter serves this repository identity.");
  }
  checkOption(typeof host === "string" && host !== "", "A repository identity needs its host.");
  checkOption(
    typeof path === "string" && /^[^/\s]+(\/[^/\s]+)+$/.test(path),
    "A repository identity needs its full path, such as owner/name.",
  );
  return identityChecks[platform as PlatformName](host, path);
}

// A copy of the options, with copied section names, checked as read.
function checkOptions(options: ConnectOptions): ConnectOptions {
  const { credential, relationshipSections, fetch, timeoutMs } = fields(
    options,
    ["credential", "relationshipSections", "fetch", "timeoutMs"],
    "Connection options are an object.",
  );
  checkOption(
    credential === undefined || (typeof credential === "string" && credential !== "") || typeof credential === "function",
    "A credential is a non-empty token or a function returning one.",
  );
  if (typeof credential === "string" && !isSendableToken(credential)) {
    reject("A credential holds text that cannot be sent in a request header.");
  }
  let sections: RelationshipSections | undefined;
  if (relationshipSections !== undefined) {
    const { parent, blockedBy } = fields(
      relationshipSections,
      ["parent", "blockedBy"],
      "relationshipSections needs non-empty parent and blockedBy section names.",
    );
    checkOption(
      isName(parent) && isName(blockedBy),
      "relationshipSections needs non-empty parent and blockedBy section names.",
    );
    sections = { parent, blockedBy };
  }
  checkOption(fetch === undefined || typeof fetch === "function", "fetch is a function.");
  checkOption(
    timeoutMs === undefined ||
      (typeof timeoutMs === "number" && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= maxTimeoutMs),
    `timeoutMs is a whole number of milliseconds from 1 to ${maxTimeoutMs}.`,
  );
  return {
    ...(credential === undefined ? {} : { credential: credential as CredentialSource }),
    ...(sections === undefined ? {} : { relationshipSections: sections }),
    ...(fetch === undefined ? {} : { fetch: fetch as typeof globalThis.fetch }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

const isName = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

function checkOption(condition: boolean, message: string): asserts condition {
  if (!condition) reject(message);
}

// A copy of the request, with its method in upper case, that the transport can
// send as given: every field is checked as read, so no malformed value reaches
// `fetch` and fails as a retryable `unavailable`, and what is sent is exactly
// what was checked.
function checkTransportRequest(request: TransportRequest): TransportRequest {
  const { path, method = "GET", query, body, headers } = fields(
    request,
    ["path", "method", "query", "body", "headers"],
    "A request needs a path.",
  );
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    reject("A request path starts with a single '/' and stays on the platform's API.");
  }
  if (!isText(path)) reject(unencodable);
  if (!isExactPath(path)) reject(inexactPath);
  if (query !== undefined && path.includes("?")) reject("A request gives its query either in its path or as query, not both.");
  const verb = typeof method === "string" ? method.toUpperCase() : "";
  if (!transportMethods.has(verb)) reject(`A request method is one of ${[...transportMethods].join(", ")}.`);
  let queryCopy: Record<string, string | number | boolean> | undefined;
  if (query !== undefined) {
    const pairs = entries(query, "A request query is a plain object.");
    for (const [key, value] of pairs) {
      const scalar = typeof value === "string" || typeof value === "boolean" || Number.isFinite(value);
      if (!scalar) reject("A request query value is a string, a finite number or a boolean.");
      if (!isText(key) || (typeof value === "string" && !isText(value))) reject(unencodable);
    }
    queryCopy = Object.fromEntries(pairs) as Record<string, string | number | boolean>;
  }
  let headersCopy: Record<string, string> | undefined;
  if (headers !== undefined) {
    const pairs = entries(headers, "Request headers are a plain object.");
    const names = new Set<string>();
    for (const [key, value] of pairs) {
      if (typeof value !== "string") reject("A request header value is a string.");
      if (!isText(key) || !isText(value)) reject(unencodable);
      const name = key.toLowerCase();
      if (names.has(name)) reject("A request names each header once, in any case.");
      names.add(name);
      if (name === "authorization") reject("A request is sent with the connection's credential, never its own.");
      if (transportHeaders.has(name)) reject(`A request leaves the ${name} header to the transport.`);
      if (!headerValue.test(value)) reject("A request header value is sent as written, with no outer whitespace or control character.");
    }
    try {
      new Headers(pairs as [string, string][]);
    } catch {
      reject("A request header has an invalid name or value.");
    }
    headersCopy = Object.fromEntries(pairs) as Record<string, string>;
  }
  let bodyCopy: unknown;
  if (body !== undefined) {
    if (verb === "GET" || verb === "HEAD") reject(`A ${verb} request has no body.`);
    bodyCopy = jsonCopy(body, new Set());
  }
  return {
    path,
    method: verb,
    ...(queryCopy === undefined ? {} : { query: queryCopy }),
    ...(body === undefined ? {} : { body: bodyCopy }),
    ...(headersCopy === undefined ? {} : { headers: headersCopy }),
  };
}

const inexactPath =
  "A request path is sent as written: it holds no fragment, backslash, whitespace, control or non-ASCII character, dot segment or empty query.";

// Whether a URL keeps a path as written. A URL parser drops a fragment and an
// empty query, reads a backslash as '/', strips tabs, line breaks and outer
// spaces, resolves dot segments, even percent-encoded, and percent-encodes
// other characters. A path it would change in any way, read as naming another
// host, or not read at all, is not sent.
function isExactPath(path: string): boolean {
  const origin = "https://platform.invalid";
  if (!URL.canParse(path, origin)) return false;
  const url = new URL(path, origin);
  return url.origin === origin && url.pathname + url.search === path;
}

const jsonRule = "A request body holds only plain objects, arrays, strings, finite numbers, booleans and null.";
const unencodable = "A request holds text with an unpaired surrogate, which has no UTF-8 encoding.";

// A copy of a JSON value that serializes exactly as the value read here.
// Anything `JSON.stringify` would drop, coerce or refuse fails instead:
// undefined, non-finite numbers, functions, symbols, BigInt, array holes,
// objects other than plain ones, such as a Date or a Map, and cycles.
// `ancestors` holds the objects enclosing `value`, so shared references pass.
function jsonCopy(value: unknown, ancestors: Set<object>): unknown {
  if (typeof value === "string" && !isText(value)) reject(unencodable);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reject(jsonRule);
    return value;
  }
  if (typeof value !== "object") reject(jsonRule);
  if (ancestors.has(value)) reject("A request body has no cycles.");
  ancestors.add(value);
  try {
    const kind = shape(value);
    if (kind === "array") return items(value, jsonRule).map((item) => jsonCopy(item, ancestors));
    if (kind === "object") {
      return Object.fromEntries(
        entries(value, jsonRule).map(([key, item]) => [isText(key) ? key : reject(unencodable), jsonCopy(item, ancestors)]),
      );
    }
    reject(jsonRule);
  } finally {
    ancestors.delete(value);
  }
}

// The filter's known fields, each read once and checked.
function checkIssueFilter(filter: IssueFilter): IssueFilter {
  const { state, label } = fields(filter, ["state", "label"], "An issue filter is an object.");
  if (state !== undefined && state !== "open" && state !== "closed") {
    reject("An issue filter's state is open or closed.");
  }
  if (label !== undefined) checkText(label, "label");
  return { ...(state === undefined ? {} : { state }), ...(label === undefined ? {} : { label }) };
}

function checkNumber(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 1) reject(`The ${what} is a positive integer.`);
}

function checkText(value: unknown, what: string): asserts value is string {
  if (typeof value !== "string" || value === "") reject(`The ${what} is a non-empty string.`);
  if (!isText(value)) reject(`The ${what} holds an unpaired surrogate, which has no UTF-8 encoding.`);
}

// A string every request can carry as it is: one with an unpaired surrogate
// has no UTF-8 encoding, so a URL, header or JSON body would change or refuse it.
function isText(value: unknown): value is string {
  return typeof value === "string" && value.isWellFormed();
}

function reject(message: string): never {
  throw new PlatformError("rejected", message);
}

function unsupported(flag: string): never {
  throw new PlatformError("unsupported", `This platform does not offer ${flag}.`);
}
