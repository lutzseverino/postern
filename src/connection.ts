// Opening a connection: option validation, platform selection, and the shared
// layer every adapter's ports pass through. That layer checks arguments,
// enforces capability flags, and keeps credentials out of errors and results.

import { detectPlatform, githubHost, isGitHubRepositoryPath } from "./detect.ts";
import type { PlatformName, RepositoryIdentity } from "./detect.ts";
import { PlatformError } from "./errors.ts";
import { githubAdapter } from "./github/adapter.ts";
import type {
  Access,
  Account,
  Issue,
  IssueFilter,
  IssueTracker,
  Label,
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
  const guard = <T>(operation: () => Promise<T>): Promise<T> => shielded(secrets, operation);
  return Object.freeze({
    repository: Object.freeze({ ...repository }),
    issueTracker: guardIssueTracker(ports.issueTracker, context, guard),
    pullRequests: guardPullRequests(ports.pullRequests, guard),
    releaseSource: guardReleaseSource(ports.releaseSource, guard),
    access: guardAccess(ports.access, guard),
  });
}

type Guard = <T>(operation: () => Promise<T>) => Promise<T>;

async function shielded<T>(secrets: Secrets, operation: () => Promise<T>): Promise<T> {
  try {
    return secrets.redact(await operation());
  } catch (error) {
    throw secrets.sanitize(error);
  }
}

function guardIssueTracker(port: IssueTracker, context: AdapterContext, guard: Guard): IssueTracker {
  const capabilities = Object.freeze({ ...port.capabilities });
  const sections = context.relationshipSections !== null;
  const account = (value: Account | null) => withBotMarking(value, capabilities.botMarking === true);
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
      guard(async () => {
        checkIssueFilter(filter);
        return (await port.issues({ ...filter })).map(issueFacts);
      }),
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
        if (!Array.isArray(labels) || labels.length === 0) reject("Name at least one label to add.");
        for (const label of labels) checkText(label, "label");
        await port.addLabels(number, [...labels]);
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
        checkText(label.name, "label name");
        if (typeof label.color !== "string" || !/^[0-9a-fA-F]{6}$/.test(label.color)) {
          reject("A label color is six hexadecimal digits without '#'.");
        }
        if (typeof label.description !== "string") reject("A label description is a string.");
        return port.createLabel({ name: label.name, color: label.color, description: label.description });
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

function guardPullRequests(port: PullRequests, guard: Guard): PullRequests {
  const capabilities = Object.freeze({ ...port.capabilities });
  return Object.freeze({
    capabilities,
    byHeadBranch: (branch: string) =>
      guard(async () => {
        checkText(branch, "head branch");
        return port.byHeadBranch(branch);
      }),
    closing: (issueNumber: number) =>
      guard(async () => {
        checkNumber(issueNumber, "issue number");
        if (!capabilities.closingReferences) unsupported("closingReferences");
        return port.closing(issueNumber);
      }),
    pullRequest: (number: number) =>
      guard(async () => {
        checkNumber(number, "pull request number");
        return port.pullRequest(number);
      }),
    reviews: (number: number) =>
      guard(async () => {
        checkNumber(number, "pull request number");
        const reviews = await port.reviews(number);
        return capabilities.reviewCommits ? reviews : reviews.map((review) => ({ ...review, commit: null }));
      }),
    reviewThreads: (number: number) =>
      guard(async () => {
        checkNumber(number, "pull request number");
        return port.reviewThreads(number);
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
        return port.comment(number, body);
      }),
    squashMerge: (number: number, merge: SquashMerge) =>
      guard(async () => {
        checkNumber(number, "pull request number");
        if (!merge || typeof merge !== "object") reject("A squash merge needs its expected head, title and body.");
        checkText(merge.expectedHead, "expected head commit");
        checkText(merge.title, "merge title");
        if (typeof merge.body !== "string") reject("A merge body is a string.");
        return port.squashMerge(number, { expectedHead: merge.expectedHead, title: merge.title, body: merge.body });
      }),
  });
}

function guardReleaseSource(port: ReleaseSource, guard: Guard): ReleaseSource {
  const capabilities = Object.freeze({ ...port.capabilities });
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

function guardAccess(port: Access, guard: Guard): Access {
  return Object.freeze({
    capabilities: Object.freeze({ ...port.capabilities }),
    viewer: () => guard(() => port.viewer()),
    role: (login: string) =>
      guard(async () => {
        checkText(login, "login");
        return port.role(login);
      }),
    request: (request: TransportRequest) => guard(async () => port.request(checkTransportRequest(request))),
  });
}

function withBotMarking(account: Account | null, marked: boolean): Account | null {
  return account && !marked ? { ...account, bot: null } : account;
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
// send as given: every field is checked here, so no malformed value reaches
// `fetch` and fails as a retryable `unavailable`.
function checkTransportRequest(request: TransportRequest): TransportRequest {
  if (!request || typeof request !== "object") reject("A request needs a path.");
  const { path, method = "GET", query, body, headers } = request;
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    reject("A request path starts with a single '/' and stays on the platform's API.");
  }
  const verb = typeof method === "string" ? method.toUpperCase() : "";
  if (!transportMethods.has(verb)) reject(`A request method is one of ${[...transportMethods].join(", ")}.`);
  if (query !== undefined) {
    if (!isRecord(query)) reject("A request query is an object.");
    for (const value of Object.values(query)) {
      const scalar = typeof value === "string" || typeof value === "boolean" || Number.isFinite(value);
      if (!scalar) reject("A request query value is a string, a finite number or a boolean.");
    }
  }
  if (headers !== undefined) {
    if (!isRecord(headers)) reject("Request headers are an object.");
    for (const value of Object.values(headers)) {
      if (typeof value !== "string") reject("A request header value is a string.");
    }
    try {
      new Headers(Object.entries(headers));
    } catch {
      reject("A request header has an invalid name or value.");
    }
  }
  if (body !== undefined) {
    if (verb === "GET" || verb === "HEAD") reject(`A ${verb} request has no body.`);
    let json: string | undefined;
    try {
      json = JSON.stringify(body);
    } catch {
      reject("A request body is a JSON value.");
    }
    if (json === undefined) reject("A request body is a JSON value.");
  }
  return {
    path,
    method: verb,
    ...(query === undefined ? {} : { query: { ...query } }),
    ...(body === undefined ? {} : { body }),
    ...(headers === undefined ? {} : { headers: { ...headers } }),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function checkIssueFilter(filter: IssueFilter): void {
  if (!filter || typeof filter !== "object") reject("An issue filter is an object.");
  if (filter.state !== undefined && filter.state !== "open" && filter.state !== "closed") {
    reject("An issue filter's state is open or closed.");
  }
  if (filter.label !== undefined) checkText(filter.label, "label");
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
