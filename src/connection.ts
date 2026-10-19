// Opening a connection: option validation, platform selection, and the shared
// layer every adapter's ports pass through. That layer checks arguments,
// enforces capability flags, and keeps credentials out of errors and results.

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
import { Secrets, credentialsFrom } from "./secrets.ts";
import type { CredentialSource, Credentials } from "./secrets.ts";

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
    relationshipSections: checked.relationshipSections ? { ...checked.relationshipSections } : null,
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
        const names: string[] = Array.isArray(labels) ? [...labels] : [];
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
        if (!label || typeof label !== "object") reject("A label needs a name, color and description.");
        const { name, color, description } = label;
        checkText(name, "label name");
        if (typeof color !== "string" || !/^[0-9a-fA-F]{6}$/.test(color)) {
          reject("A label color is six hexadecimal digits without '#'.");
        }
        if (typeof description !== "string") reject("A label description is a string.");
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
        if (!merge || typeof merge !== "object") reject("A squash merge needs its expected head, title and body.");
        const { expectedHead, title, body } = merge;
        checkText(expectedHead, "expected head commit");
        checkText(title, "merge title");
        if (typeof body !== "string") reject("A merge body is a string.");
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

function checkIdentity(identity: RepositoryIdentity): RepositoryIdentity {
  if (!identity || typeof identity !== "object" || !Object.hasOwn(identityChecks, identity.platform)) {
    throw new PlatformError("unsupported", "No platform adapter serves this repository identity.");
  }
  checkOption(typeof identity.host === "string" && identity.host !== "", "A repository identity needs its host.");
  checkOption(
    typeof identity.path === "string" && /^[^/\s]+(\/[^/\s]+)+$/.test(identity.path),
    "A repository identity needs its full path, such as owner/name.",
  );
  return identityChecks[identity.platform](identity.host, identity.path);
}

function checkOptions(options: ConnectOptions): ConnectOptions {
  checkOption(options !== null && typeof options === "object", "Connection options are an object.");
  const { credential, relationshipSections, fetch, timeoutMs } = options;
  checkOption(
    credential === undefined || (typeof credential === "string" && credential !== "") || typeof credential === "function",
    "A credential is a non-empty token or a function returning one.",
  );
  if (relationshipSections !== undefined) {
    const sections = relationshipSections as Partial<Record<keyof RelationshipSections, unknown>> | null;
    checkOption(
      sections !== null &&
        typeof sections === "object" &&
        isName(sections.parent) &&
        isName(sections.blockedBy),
      "relationshipSections needs non-empty parent and blockedBy section names.",
    );
  }
  checkOption(fetch === undefined || typeof fetch === "function", "fetch is a function.");
  checkOption(
    timeoutMs === undefined || (Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= maxTimeoutMs),
    `timeoutMs is a whole number of milliseconds from 1 to ${maxTimeoutMs}.`,
  );
  return options;
}

const isName = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

function checkOption(condition: boolean, message: string): asserts condition {
  if (!condition) reject(message);
}

// A copy of the request, with its method in upper case, that the transport can
// send as given: every field is read once into the copy and checked there, so
// no malformed value reaches `fetch` and fails as a retryable `unavailable`,
// and what is sent is exactly what was checked.
function checkTransportRequest(request: TransportRequest): TransportRequest {
  if (!request || typeof request !== "object") reject("A request needs a path.");
  const { path, method = "GET", query, body, headers } = request;
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    reject("A request path starts with a single '/' and stays on the platform's API.");
  }
  const verb = typeof method === "string" ? method.toUpperCase() : "";
  if (!transportMethods.has(verb)) reject(`A request method is one of ${[...transportMethods].join(", ")}.`);
  let queryCopy: Record<string, string | number | boolean> | undefined;
  if (query !== undefined) {
    if (!isPlainObject(query)) reject("A request query is a plain object.");
    queryCopy = Object.fromEntries(Object.entries(query)) as Record<string, string | number | boolean>;
    for (const value of Object.values(queryCopy)) {
      const scalar = typeof value === "string" || typeof value === "boolean" || Number.isFinite(value);
      if (!scalar) reject("A request query value is a string, a finite number or a boolean.");
    }
  }
  let headersCopy: Record<string, string> | undefined;
  if (headers !== undefined) {
    if (!isPlainObject(headers)) reject("Request headers are a plain object.");
    headersCopy = Object.fromEntries(Object.entries(headers)) as Record<string, string>;
    for (const value of Object.values(headersCopy)) {
      if (typeof value !== "string") reject("A request header value is a string.");
    }
    try {
      new Headers(Object.entries(headersCopy));
    } catch {
      reject("A request header has an invalid name or value.");
    }
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

const jsonRule = "A request body holds only plain objects, arrays, strings, finite numbers, booleans and null.";

// A copy of a JSON value that serializes exactly as the value read here.
// Anything `JSON.stringify` would drop, coerce or refuse fails instead:
// undefined, non-finite numbers, functions, symbols, BigInt, array holes,
// objects other than plain ones, such as a Date or a Map, and cycles.
// `ancestors` holds the objects enclosing `value`, so shared references pass.
function jsonCopy(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reject(jsonRule);
    return value;
  }
  if (typeof value !== "object") reject(jsonRule);
  if (ancestors.has(value)) reject("A request body has no cycles.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || Object.keys(value).length !== value.length) {
        reject(jsonRule);
      }
      return Array.from(value, (item) => jsonCopy(item, ancestors));
    }
    if (!isPlainObject(value)) reject(jsonRule);
    if (Object.getOwnPropertySymbols(value).some((key) => Object.prototype.propertyIsEnumerable.call(value, key))) {
      reject(jsonRule);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonCopy(item, ancestors)]));
  } finally {
    ancestors.delete(value);
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

// The filter's known fields, each read once and checked.
function checkIssueFilter(filter: IssueFilter): IssueFilter {
  if (!filter || typeof filter !== "object") reject("An issue filter is an object.");
  const { state, label } = filter;
  if (state !== undefined && state !== "open" && state !== "closed") {
    reject("An issue filter's state is open or closed.");
  }
  if (label !== undefined) checkText(label, "label");
  return { ...(state === undefined ? {} : { state }), ...(label === undefined ? {} : { label }) };
}

function checkNumber(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 1) reject(`The ${what} is a positive integer.`);
}

function checkText(value: string, what: string): void {
  if (typeof value !== "string" || value === "") reject(`The ${what} is a non-empty string.`);
}

function reject(message: string): never {
  throw new PlatformError("rejected", message);
}

function unsupported(flag: string): never {
  throw new PlatformError("unsupported", `This platform does not offer ${flag}.`);
}
