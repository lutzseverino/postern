export { connect } from "./connection.ts";
export type { ConnectOptions, Connection, RelationshipSections } from "./connection.ts";
export { detectPlatform } from "./detect.ts";
export type { PlatformName, RepositoryIdentity } from "./detect.ts";
export { PlatformError, platformErrorReasons } from "./errors.ts";
export type { PlatformErrorOptions, PlatformErrorReason } from "./errors.ts";
export { capabilityFlags } from "./ports.ts";
export type {
  Access,
  AccessCapabilities,
  Account,
  CheckResult,
  Comment,
  Issue,
  IssueFilter,
  IssueReference,
  IssueState,
  IssueTracker,
  IssueTrackerCapabilities,
  Label,
  LabelChange,
  PullRequest,
  PullRequestState,
  PullRequests,
  PullRequestsCapabilities,
  Release,
  ReleaseSource,
  ReleaseSourceCapabilities,
  Review,
  ReviewThread,
  SquashMerge,
  TransportRequest,
  TransportResponse,
} from "./ports.ts";
export type { CredentialSource } from "./secrets.ts";
