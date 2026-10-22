// What an adapter supplies to run the contract suite: a fresh local fake of
// its platform API per test, seeded and inspected in platform-neutral terms.
// Values the platform names itself, such as roles and review states, come
// from the harness's `words`.

import type { Account, ConnectOptions, ConnectionWithLabels, Label, PlatformErrorReason } from "../../src/index.ts";

/** An issue in another repository on the same platform, or a number in the connected one. */
export type SeedReference = number | { repository: string; number: number };

export interface IssueSeed {
  /** Another repository on the platform; defaults to the connected one. */
  repository?: string;
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  author?: Account;
  createdAt?: string;
  /** A native parent link; only for platforms offering `nativeParent`. */
  parent?: SeedReference;
  /** When the native parent link was made. */
  linkedAt?: string;
  /** Native blockers; only for platforms offering `nativeBlockers`. */
  blockedBy?: SeedReference[];
  bodyEditTime?: string | null;
}

export interface PullRequestSeed {
  title?: string;
  body?: string;
  state?: "open" | "closed" | "merged";
  author?: Account;
  createdAt?: string;
  headBranch: string;
  headCommit: string;
  baseBranch?: string;
  crossRepository?: boolean;
  /** Issue numbers in the connected repository the pull request closes when merged. */
  closes?: number[];
  mergeQueue?: boolean;
}

export interface Failure {
  reason: Exclude<PlatformErrorReason, "unsupported">;
  /** For `rateLimited`: the reset time the platform's response states. */
  retryAt?: string;
  /** Text the failing response echoes back, such as the credential. */
  echo?: string;
}

/** A way a successful response can be malformed, so the adapter cannot read it. */
export type Malformation =
  /** Every field the operation reads is missing. */
  | "missingFields"
  /** Every field the operation reads has the wrong type, such as an identifier that is not one. */
  | "wrongTypes"
  /** Every list in the response is something else. */
  | "brokenLists"
  /** The response claims another page but gives no way to reach it. */
  | "pageWithoutCursor"
  /** Every page in the response, nested ones included, omits whether another page follows. */
  | "pageFlagMissing"
  /** Every page in the response, nested ones included, states null for whether another page follows. */
  | "pageFlagNull"
  /** Every page in the response, nested ones included, states whether another page follows as something other than yes or no. */
  | "pageFlagWrongType";

/** One response in a transport fixture, using the platform's pagination metadata. */
export interface TransportPage {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
  /** The next page's zero-based index, an unreadable cursor, or another origin; absent on the last page. */
  next?: number | "unreadable" | "foreign";
}

/** Event facts the harness encodes in its platform's webhook shape. */
export interface IssueEventSeed {
  kind: "opened" | "reopened" | "closed" | "edited" | "labeled" | "unlabeled"
    | "commentCreated" | "commentEdited" | "commentDeleted";
  issue: number;
  actor: Account;
  repository?: string;
  label?: string;
  openingLabels?: string[];
  bodyChanged?: boolean;
  comment?: { id: number; body: string };
}

export type IssueEventVariation = "pullRequest" | "unsupportedAction" | "unsupportedEvent" | "malformed";

export interface ContractPlatform {
  /** The connected repository's Git remote URL. */
  readonly remote: string;
  /** Its repository path. */
  readonly path: string;
  /** A credential the fake accepts. */
  readonly token: string;
  /** The account the credential authenticates. */
  readonly viewer: Account;
  /** The platform's own words the suite seeds and expects. */
  readonly words: {
    /** A repository role name. */
    role: string;
    /** A review state meaning approval. */
    approvedReview: string;
    /** A finished check's status and conclusion. */
    finishedCheck: { status: string; conclusion: string };
  };
  /**
   * Opens a connection to the fake, authenticated with `token` unless
   * anonymous, passed as a function returning it with `tokenFunction`.
   */
  connect(options?: Omit<ConnectOptions, "fetch" | "credential"> & { anonymous?: boolean; tokenFunction?: boolean }): ConnectionWithLabels;
  /** Makes the fake serve at most this many items per page. */
  pageSize(size: number): void;
  /** Serves these authenticated transport pages and returns the first page's request path. */
  serveTransportPages(pages: TransportPage[]): string;

  /** A platform event with these facts; independent of the fake's current state. */
  issueEvent(seed: IssueEventSeed, variation?: IssueEventVariation): { name: string; payload: unknown };
  addIssue(seed?: IssueSeed): number;
  /** An issue body holding these named sections, each referencing issues in the platform's syntax. */
  sectionBody(sections: Record<string, SeedReference[]>): string;
  addLabelChange(issue: number, change: { action: "added" | "removed"; label: string; actor: Account; time: string }): void;
  addComment(issue: number, comment: { author: Account; body: string; createdAt: string; updatedAt?: string }): void;
  defineLabel(label: Label): void;
  addPullRequest(seed: PullRequestSeed): number;
  addReview(pullRequest: number, review: { author: Account; state: string; commit: string; submittedAt: string; body?: string }): void;
  addReviewThread(pullRequest: number, thread: { resolved: boolean; outdated: boolean; path: string; author: Account }): void;
  addCheck(commit: string, check: { name: string; status: string; conclusion: string | null; completedAt: string | null }): void;
  addRelease(release: { tag: string; name: string; draft: boolean; prerelease: boolean; publishedAt: string | null }): void;
  addTag(name: string, commit: string, options?: { annotated?: boolean }): void;
  /** Gives an account the role, or no role at all. */
  setRole(login: string, role: string | null): void;

  issueLabels(issue: number): string[];
  issueState(issue: number): "open" | "closed";
  commentBodies(issueOrPullRequest: number): string[];
  label(name: string): Label | undefined;
  pullRequestState(pullRequest: number): "open" | "closed" | "merged";
  /** The squash merge's title and body, or `null` when it is unmerged. */
  mergeOf(pullRequest: number): { title: string; body: string } | null;

  /** Makes the next request fail the way the platform fails for this reason. */
  failNext(failure: Failure): void;
  /**
   * Makes the next request succeed with its response malformed this way.
   * Returns the HTTP status the malformed response carries.
   */
  malformNext(malformation: Malformation): number;
}

export interface AdapterHarness {
  readonly name: string;
  /** A fresh fake platform. */
  start(): ContractPlatform;
}
