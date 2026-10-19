// The four facts-only ports a connection exposes, with the facts they report.
// Times are ISO 8601 strings as the platform reports them. A field that
// depends on a capability flag the port does not offer is `null`.

/** An account as the platform reports it. */
export interface Account {
  login: string;
  /** Whether the platform marks the account as a bot; `null` where it cannot tell. */
  bot: boolean | null;
}

export type IssueState = "open" | "closed";

/** An issue another issue links to, possibly in another repository. */
export interface IssueReference {
  /** The linked issue's repository path on the same host. */
  repository: string;
  number: number;
  state: IssueState;
}

export interface Issue {
  number: number;
  /**
   * The platform's stable numeric identifier. Like every numeric `id`, a safe
   * integer: a read that meets a larger one fails with `invalidResponse`.
   */
  id: number;
  /** The platform's global API identifier, such as GitHub's node ID, where it has one. */
  nodeId: string | null;
  url: string;
  state: IssueState;
  title: string;
  body: string;
  author: Account | null;
  labels: string[];
  createdAt: string;
  /** The parent issue, from native links or the consumer's named body section. */
  parent: IssueReference | null;
  subIssues: IssueReference[];
  /** The issues blocking this one, open or closed. */
  blockedBy: IssueReference[];
  /** When the body was last edited; `null` if never, or without `bodyEditTime`. */
  bodyEditTime: string | null;
  /** When the latest sub-issue was linked; `null` if never, or without `linkTime`. */
  linkTime: string | null;
}

export interface LabelChange {
  /** The platform's event identifier. */
  id: number;
  action: "added" | "removed";
  label: string;
  actor: Account | null;
  time: string;
}

export interface Comment {
  id: number;
  nodeId: string | null;
  url: string;
  author: Account | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Label {
  name: string;
  /** Six hexadecimal digits without `#`. */
  color: string;
  description: string;
}

export interface IssueFilter {
  /** Defaults to `open`. */
  state?: IssueState;
  label?: string;
}

/** Capability flags of an issue tracker. An absent flag means the feature is not offered. */
export interface IssueTrackerCapabilities {
  /** `parent` and `subIssues` come from native links. */
  readonly nativeParent?: true;
  /** `blockedBy` comes from native links. */
  readonly nativeBlockers?: true;
  /** Issues report `bodyEditTime`. */
  readonly bodyEditTime?: true;
  /** Issues report `linkTime`. */
  readonly linkTime?: true;
  /** Every account a connection reports, from any port, carries the platform's bot marking. */
  readonly botMarking?: true;
}

/**
 * An issue tracker. A number names an issue: where pull requests share the
 * issue number space, as on GitHub, `issue` and `closeIssue` fail with
 * `notFound` for a pull request's number, and `closeIssue` fails before
 * writing. Label, label-change and comment operations act on whatever the
 * platform records under the number, which on such a platform includes a pull
 * request's labels and conversation comments.
 */
export interface IssueTracker {
  readonly capabilities: IssueTrackerCapabilities;
  /** Issues in a state, by default open, optionally only those with a label. */
  issues(filter?: IssueFilter): Promise<Issue[]>;
  /** One issue in any state. */
  issue(number: number): Promise<Issue>;
  /** The issue's label additions and removals, in platform order. */
  labelChanges(number: number): Promise<LabelChange[]>;
  /** The issue's complete comment list. */
  comments(number: number): Promise<Comment[]>;
  addLabels(number: number, labels: readonly string[]): Promise<void>;
  removeLabel(number: number, label: string): Promise<void>;
  createLabel(label: Label): Promise<Label>;
  createComment(number: number, body: string): Promise<Comment>;
  updateComment(id: number, body: string): Promise<Comment>;
  closeIssue(number: number): Promise<void>;
}

export type PullRequestState = "open" | "closed" | "merged";

export interface PullRequest {
  /** The repository path the pull request belongs to. */
  repository: string;
  number: number;
  id: number;
  nodeId: string | null;
  url: string;
  state: PullRequestState;
  title: string;
  body: string;
  author: Account | null;
  createdAt: string;
  headBranch: string;
  /** The head commit's full SHA. */
  headCommit: string;
  baseBranch: string;
  /** Whether the head comes from another repository, such as a fork. */
  crossRepository: boolean;
}

export interface Review {
  id: number;
  author: Account | null;
  /** The platform's own review state name, such as GitHub's `APPROVED`. */
  state: string;
  body: string;
  /** The reviewed commit; `null` without `reviewCommits`. */
  commit: string | null;
  /** When the review was submitted; `null` while pending. */
  submittedAt: string | null;
}

export interface ReviewThread {
  id: string;
  resolved: boolean;
  /** Whether the code the thread comments on has since changed. */
  outdated: boolean;
  path: string;
  /** The account that started the thread. */
  author: Account | null;
}

export interface CheckResult {
  /** The check's name, or the status context. */
  name: string;
  /** The platform's own status word, such as `completed` or `pending`. */
  status: string;
  /** The platform's own conclusion word once finished, such as `success`; otherwise `null`. */
  conclusion: string | null;
  completedAt: string | null;
}

export interface SquashMerge {
  /** The commit the head must still be at; otherwise the merge fails with `conflict`. */
  expectedHead: string;
  title: string;
  body: string;
}

/** Capability flags of the pull request port. An absent flag means the feature is not offered. */
export interface PullRequestsCapabilities {
  /** `closing` lists the pull requests that close an issue. */
  readonly closingReferences?: true;
  /** Reviews report the commit they reviewed. */
  readonly reviewCommits?: true;
}

export interface PullRequests {
  readonly capabilities: PullRequestsCapabilities;
  /** Pull requests in any state whose head branch has this name, from any repository. */
  byHeadBranch(branch: string): Promise<PullRequest[]>;
  /** Pull requests in any state that close the issue when merged. Needs `closingReferences`. */
  closing(issueNumber: number): Promise<PullRequest[]>;
  pullRequest(number: number): Promise<PullRequest>;
  reviews(number: number): Promise<Review[]>;
  reviewThreads(number: number): Promise<ReviewThread[]>;
  /** The latest result of each check and status on a commit. */
  checks(commit: string): Promise<CheckResult[]>;
  /** Whether merging the pull request goes through a merge queue. */
  mergesThroughQueue(number: number): Promise<boolean>;
  /**
   * Comments on the pull request. Where pull requests share the issue number
   * space, as on GitHub, this posts on whatever item has the number, an
   * issue included; a caller passes only pull request numbers.
   */
  comment(number: number, body: string): Promise<Comment>;
  /** Squash-merges with an explicit title and body, returning the merge commit's SHA. */
  squashMerge(number: number, merge: SquashMerge): Promise<string>;
}

export interface Release {
  id: number;
  tag: string;
  name: string;
  /** `null` without `drafts`. */
  draft: boolean | null;
  /** `null` without `prereleases`. */
  prerelease: boolean | null;
  /** `null` while unpublished. */
  publishedAt: string | null;
}

/** Capability flags of the release source. An absent flag means the feature is not offered. */
export interface ReleaseSourceCapabilities {
  /** Releases report whether they are drafts. */
  readonly drafts?: true;
  /** Releases report whether they are prereleases. */
  readonly prereleases?: true;
}

export interface ReleaseSource {
  readonly capabilities: ReleaseSourceCapabilities;
  /** Every release the platform lists, across all pages. */
  releases(): Promise<Release[]>;
  /**
   * The commit SHA a tag points to, peeling annotated tags. A chain of tag
   * objects that leads back to one it passed fails with `invalidResponse`.
   */
  tagCommit(tag: string): Promise<string>;
}

export interface TransportRequest {
  /** `GET` (the default), `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` or `OPTIONS`, in any case. */
  method?: string;
  /**
   * A path on the platform's API, starting with `/`, optionally with a query
   * string, sent as written: without a fragment, backslash, whitespace,
   * control or non-ASCII character, dot segment or empty query string.
   */
  path: string;
  /** A plain object of strings, finite numbers and booleans, for a path without a query string. */
  query?: Record<string, string | number | boolean>;
  /**
   * Sent as JSON, with any method but `GET` and `HEAD`: plain objects, arrays,
   * strings, finite numbers, booleans and `null`, without cycles.
   */
  body?: unknown;
  /**
   * A plain object of header names, each once in any case, and string values
   * without outer whitespace or control characters. `authorization` and the
   * headers `fetch` sets itself, such as `host` and `content-length`, are refused.
   */
  headers?: Record<string, string>;
}

export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  /** The parsed JSON body, or `null` when the response has none. */
  data: unknown;
}

/** Capability flags of the access port. It has none yet. */
export type AccessCapabilities = Record<never, never>;

export interface Access {
  readonly capabilities: AccessCapabilities;
  /** The authenticated account, or `null` when the connection is anonymous. */
  viewer(): Promise<Account | null>;
  /** The account's repository role as the platform names it, or `null` when it has none. */
  role(login: string): Promise<string | null>;
  /**
   * Sends an authenticated request to the platform's API, for platform-specific
   * operations no port covers. A failing status rejects with `PlatformError`.
   */
  request(request: TransportRequest): Promise<TransportResponse>;
}

/** The names of every capability flag, per port. */
export const capabilityFlags = Object.freeze({
  issueTracker: Object.freeze(["nativeParent", "nativeBlockers", "bodyEditTime", "linkTime", "botMarking"] as const),
  pullRequests: Object.freeze(["closingReferences", "reviewCommits"] as const),
  releaseSource: Object.freeze(["drafts", "prereleases"] as const),
  access: Object.freeze([] as const),
});
