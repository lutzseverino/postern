export { connect } from "./connection.ts";
export type { ConnectOptions, Connection, ConnectionWithLabels, RelationshipSections } from "./connection.ts";
export { detectPlatform } from "./detect.ts";
export type { PlatformName, RepositoryIdentity } from "./detect.ts";
export { PlatformError, platformErrorReasons } from "./errors.ts";
export type { PlatformErrorOptions, PlatformErrorReason } from "./errors.ts";
export { capabilityFlags } from "./ports.ts";
export type {
  Access,
  AccessWithPages,
  AccessCapabilities,
  Account,
  CheckResult,
  Comment,
  Issue,
  IssueEvent,
  IssueEventKind,
  IssueFilter,
  IssueReference,
  IssueState,
  IssueTracker,
  IssueTrackerWithLabels,
  IssueTrackerCapabilities,
  Label,
  LabelChange,
  PlatformEvent,
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
