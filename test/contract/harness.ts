// What an adapter supplies to run the contract suite: a fresh local fake of
// its platform API per test, seeded and inspected in platform-neutral terms.
// Values the platform names itself, such as roles and review states, come
// from the harness's `words`.

import type { Account, ConnectOptions, Connection, Label, PlatformErrorReason } from "../../src/index.ts";

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
  connect(options?: Omit<ConnectOptions, "fetch" | "credential"> & { anonymous?: boolean; tokenFunction?: boolean }): Connection;
  /** Makes the fake serve at most this many items per page. */
  pageSize(size: number): void;

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
}

export interface AdapterHarness {
  readonly name: string;
  /** A fresh fake platform. */
  start(): ContractPlatform;
}
