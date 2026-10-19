# Facts-only ports with platform adapters

Tools that automate work on a code hosting platform usually call one
platform's API directly and cannot reach another platform without rewriting
every call. Postern instead reports a platform's facts through four stable
ports, one per concept, with each platform behind its own adapter. It reports
facts and decides nothing, it has no runtime dependencies and builds to one
file, and every adapter passes one contract-test suite. GitHub is the only
adapter; Forgejo shaped the ports, and GitLab Free checked them.

## Decisions

- **Four ports, one per concept.** `IssueTracker`, `PullRequests`,
  `ReleaseSource` and `Access`. Each reports capability flags; an absent flag
  means the feature is not offered, so an operation that needs it fails with
  `unsupported` and a field that needs it is `null`, instead of reporting an
  invented value. A feature Forgejo or GitLab Free lacks gets a flag rather
  than a guaranteed operation. There is no repository-settings port, because
  merge rules differ too much across platforms to share an interface;
  `Access.request` gives authenticated transport for such platform-specific
  work. No port method is named `release`, which reads as a verb.
  `IssueTracker` numbers name issues: where pull requests share the issue
  number space, reading or closing a pull request's number as an issue fails
  with `notFound`, so no issue operation changes a pull request's state.
  Labels and comments there belong to the shared number and stay reachable.
- **A repository is a platform plus a path.** Detection works from the Git
  remote, and the path is never split into an owner and a name, because
  GitLab nests groups.
- **Consumer-supplied section names.** `parent` and `blockedBy` come from
  native links where the platform has them (`nativeParent`,
  `nativeBlockers`). Elsewhere they come from body sections the consumer names
  in `relationshipSections`, which has no default: a section convention
  belongs to the consumer, and a default would make one consumer's convention
  everybody's. Without the option, such a platform reports no relationships.
- **Facts only.** Postern reports what the platform records: label changes
  with their actor and time, edit and link times, roles, reviews and checks.
  Readiness, ordering, authorization and the meaning of labels stay with
  consumers. Roles, review states and check results keep the platform's own
  words, because a neutral vocabulary would be a decision about what they
  mean. Bots are marked only where the platform can (`botMarking`).
- **Scope.** The ports cover what Postern's consumers need, not every
  platform feature, and every user gets that scope under the same SemVer
  promise. Versions start at `1.0.0`; consumers pin a major version, and a
  breaking port change is a new major.
- **Closed error reasons.** Every failure is a `PlatformError` with one of
  nine reasons, so consumers handle failures without knowing the platform.
  Invalid arguments are `rejected` before any request. No error or result
  holds a credential.
- **Zero runtime dependencies and a single-file build.** The published
  runtime is one self-contained ESM file that imports only Node.js built-ins,
  with type declarations beside it, so a consumer can copy that one file at an
  exact version and run scripts without an install step. Development tools
  stay development dependencies.
- **One contract-test suite.** `test/contract/` holds the suite every adapter
  runs through `runAdapterContract`, against a local fake of its platform API
  with no network access. Cases that depend on a flag run only where the
  adapter's flags call for them, including the section-reading and no-option
  cases for adapters without native links. The suite lives in this repository
  rather than the package, because adapters live here and the published
  runtime stays one file.

## Design check

Each port has a workable Forgejo and GitLab Free implementation. Flags the
GitHub adapter offers that these adapters would leave absent are named.

### `IssueTracker`

- **Forgejo:** issues, label filters and comments from the issues API, and
  label changes from the issue timeline. Native issue dependencies give
  `nativeBlockers`. There is no native parent, so `parent` and sub-issues come
  from the named sections, and `nativeParent` and `linkTime` are absent. Only
  `updated_at` is recorded, so `bodyEditTime` is absent. Accounts have no bot
  marking, so `botMarking` is absent, though `forgejo-actions` is always
  reported as a bot. Writes resolve label names to IDs.
- **GitLab Free:** issues, label filters and notes from the REST API, and
  label changes from resource label events. Issue parents need epics and
  blocking links need a paid tier, so `nativeParent`, `nativeBlockers` and
  `linkTime` are absent and both relationships come from the named sections.
  Users carry a `bot` attribute, so `botMarking` is offered. `bodyEditTime` is
  offered only if `last_edited_at` proves to track description edits alone;
  otherwise it is absent. The GraphQL global ID is the `nodeId`.

### `PullRequests`

- **Forgejo:** pull requests by head branch, with merged state and fork
  heads. Reviews carry their commit, so `reviewCommits` is offered. Resolved
  review conversations, commit statuses for checks, and squash merges with a
  title, message and expected head commit are available. There are no closing
  references, so `closingReferences` is absent, and no merge queue, so
  `mergesThroughQueue` reports `false`.
- **GitLab Free:** merge requests by source branch, with cross-project
  sources. `closed_by` lists the merge requests that close an issue, so
  `closingReferences` is offered. Reviewer states and approvals carry no
  commit, so `reviewCommits` is absent. Resolvable discussions give threads
  and commit statuses give checks. Merge trains need a paid tier, so
  `mergesThroughQueue` reports `false`. Squash merges check the expected head
  `sha`, joining title and body into the one squash message.

### `ReleaseSource`

- **Forgejo:** releases with draft and prerelease flags across pages; the
  tags API resolves a tag to its commit.
- **GitLab Free:** releases across pages, with no drafts or prereleases, so
  `drafts` and `prereleases` are absent; the tags API resolves a tag to its
  commit.

### `Access`

- **Forgejo:** the authenticated user; collaborator permission names as
  roles, which needs a token with admin rights on the repository;
  authenticated transport to `/api/v1`.
- **GitLab Free:** the authenticated user; project membership access levels,
  reported by GitLab's role names such as `Developer` and `Maintainer`;
  authenticated transport to `/api/v4`.

## Consequences

- Where a platform lacks edit or link times, consumers that depend on them
  must react to events instead, with a weaker guarantee when an event is
  missed.
- On a platform without bot marking, consumers need their own list of
  accounts that never act as people.
- The GitHub adapter reads some facts only GitHub's GraphQL API has, which
  GitHub serves only to authenticated callers, so those reads need a
  credential.
