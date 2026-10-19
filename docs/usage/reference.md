# API reference

This reference describes `@lutzseverino/postern` 1.x. The TypeScript
declarations shipped with the package carry the same shapes.

## Detection and connection

`detectPlatform(remote)` takes a Git remote URL in HTTPS or SSH form and
returns `{ platform, host, path }`, such as
`{ platform: "github", host: "github.com", path: "octo/hello" }`. A repository
is identified by its platform and full path, never an owner and name, because
some platforms nest groups. Any remote no adapter serves fails with
`PlatformError` reason `unsupported`; the error names the host only, never
credentials embedded in the URL.

`connect(repository, options)` takes a remote URL or a repository identity,
such as a `detectPlatform` result, and returns a connection with `repository`
and the four ports `issueTracker`, `pullRequests`, `releaseSource` and
`access`. An identity follows the same rules as detection: a GitHub identity
names the host `github.com` and a path of exactly an owner and a name. An
identity on a host no adapter serves fails with `unsupported`, and one with
any other path fails with `rejected`. Its options are:

| Option                 | Meaning                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `credential`           | A non-empty token, or a function returning one (or a promise of one). Called each time a request needs a token.                       |
| `relationshipSections` | `{ parent, blockedBy }`: non-empty body section names for platforms without native links. No default.                                 |
| `fetch`                | A `fetch`-compatible function. Defaults to the global `fetch`.                                                                        |
| `timeoutMs`            | The time one request may take before it fails with `unavailable`: whole milliseconds from 1 to 2147483647. Defaults to 30000.         |

Invalid options and arguments fail with `rejected` before any request. On
GitHub, a label, login, commit or tag path segment of `.` or `..` is also
`rejected`, because GitHub's API cannot address it in a request path.

### Credentials

Without `credential` the connection is anonymous. A credential function that
throws, or returns nothing, fails the operation with `unauthenticated`; its
own error is not kept, because it may describe the credential. Postern never
reads environment variables, files or command-line tools for credentials.

Every error message, cause and result is cleaned of every token the
connection has used: a response that echoes a token, such as an issue body
that contains one, reports `<REDACTED>` in its place. When the tokens overlap,
as after a rotation to a token that extends the previous one, each overlapping
run is one `<REDACTED>`, so no part of either token remains.

## Capability flags

Each port's `capabilities` object holds its offered flags, each `true`. An
absent flag means the platform does not offer the feature: an operation that
needs it fails with `unsupported`, and a field that needs it is `null`. The
exported `capabilityFlags` lists every flag per port.

| Port            | Flag                | When offered                                                                 |
| --------------- | ------------------- | ---------------------------------------------------------------------------- |
| `issueTracker`  | `nativeParent`      | `parent` and `subIssues` come from native links.                             |
| `issueTracker`  | `nativeBlockers`    | `blockedBy` comes from native links.                                         |
| `issueTracker`  | `bodyEditTime`      | Issues report `bodyEditTime`.                                                |
| `issueTracker`  | `linkTime`          | Issues report `linkTime`.                                                    |
| `issueTracker`  | `botMarking`        | Accounts report `bot` as `true` or `false`; otherwise `bot` is `null`.       |
| `pullRequests`  | `closingReferences` | `closing` lists the pull requests that close an issue.                       |
| `pullRequests`  | `reviewCommits`     | Reviews report the commit they reviewed; otherwise `commit` is `null`.       |
| `releaseSource` | `drafts`            | Releases report `draft`; otherwise it is `null`.                             |
| `releaseSource` | `prereleases`       | Releases report `prerelease`; otherwise it is `null`.                        |

### Relationships

Where `nativeParent` or `nativeBlockers` is offered, that relationship comes
from native links only, and body sections are never read for it. Where it is
not, it comes from the body sections named in `relationshipSections`; without
the option, such a platform reports `parent: null`, `subIssues: []` and
`blockedBy: []`.

## Ports

Times are ISO 8601 strings. An `Account` is `{ login, bot }`. An issue
reference is `{ repository, number, state }`, where `repository` is a path on
the same host, so links may cross repositories.

### `issueTracker`

| Operation                          | Result                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `issues({ state?, label? })`       | Issues in the state (default `open`), with the label when given, oldest first. |
| `issue(number)`                    | One issue in any state.                                                   |
| `labelChanges(number)`             | `{ id, action: "added" \| "removed", label, actor, time }`, in platform order. |
| `comments(number)`                 | The complete comment list.                                                |
| `addLabels(number, labels)`        | Adds the labels.                                                          |
| `removeLabel(number, label)`       | Removes the label; `notFound` when the issue lacks it.                    |
| `createLabel({ name, color, description })` | The created label; `color` is six hexadecimal digits without `#`. |
| `createComment(number, body)`      | The created comment.                                                      |
| `updateComment(id, body)`          | The updated comment.                                                      |
| `closeIssue(number)`               | Closes the issue.                                                         |

An issue is `{ number, id, nodeId, url, state, title, body, author, labels,
createdAt, parent, subIssues, blockedBy, bodyEditTime, linkTime }`. `id` is
the platform's stable numeric identifier and `nodeId` its global API
identifier where it has one. `bodyEditTime` is when the body was last edited
and `linkTime` when the latest sub-issue was linked; each is `null` when that
never happened. A comment is `{ id, nodeId, url, author, body, createdAt,
updatedAt }`.

### `pullRequests`

| Operation                          | Result                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `byHeadBranch(branch)`             | Pull requests in any state with that head branch name, from any repository. |
| `closing(issueNumber)`             | Pull requests in any state that close the issue when merged.              |
| `pullRequest(number)`              | One pull request.                                                         |
| `reviews(number)`                  | `{ id, author, state, body, commit, submittedAt }`.                       |
| `reviewThreads(number)`            | `{ id, resolved, outdated, path, author }`.                               |
| `checks(commit)`                   | `{ name, status, conclusion, completedAt }`, the latest of each check and status. |
| `mergesThroughQueue(number)`       | Whether merging goes through a merge queue.                               |
| `comment(number, body)`            | The created comment.                                                      |
| `squashMerge(number, { expectedHead, title, body })` | The merge commit's SHA; `conflict` when the head is no longer `expectedHead`. |

A pull request is `{ repository, number, id, nodeId, url, state, title, body,
author, createdAt, headBranch, headCommit, baseBranch, crossRepository }`,
with `state` `open`, `closed` or `merged`. Review states, check statuses and
conclusions are the platform's own words.

### `releaseSource`

| Operation          | Result                                                                  |
| ------------------ | ----------------------------------------------------------------------- |
| `releases()`       | `{ id, tag, name, draft, prerelease, publishedAt }` across every page.  |
| `tagCommit(tag)`   | The commit SHA the tag points to, peeling annotated tags.               |

### `access`

| Operation                                       | Result                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `viewer()`                                      | The authenticated account, or `null` when the connection is anonymous. |
| `role(login)`                                   | The account's repository role as the platform names it, or `null`.     |
| `request({ method?, path, query?, body?, headers? })` | `{ status, headers, data }` from the platform's API.              |

`request` sends the connection's credential, so its `path` must stay on the
platform's API: it starts with a single `/`. Its `method` is `GET` (the
default), `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` or `OPTIONS`, in any case.
Its `query` values are strings, finite numbers or booleans; its `headers` are
valid header names with string values; and its `body` is a JSON value, sent
only with a method other than `GET` or `HEAD`. A request that breaks any of
these fails with `rejected` before it is sent. A failing status rejects with
`PlatformError`, mapped like any other operation.

## Errors

| Reason            | Meaning                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `unauthenticated` | A missing, rejected or expired credential.                           |
| `forbidden`       | An authenticated account without permission.                        |
| `notFound`        | An absent or invisible resource.                                     |
| `conflict`        | A write that lost a race, such as a merge whose head has moved.      |
| `rejected`        | A request the platform, or Postern before sending it, refused as invalid. |
| `rateLimited`     | An exhausted quota, with `retryAt` when the platform states one.     |
| `unavailable`     | A transport failure, timeout or server error.                        |
| `invalidResponse` | A response the adapter cannot read.                                  |
| `unsupported`     | A platform or capability that is not offered.                        |

`platformErrorReasons` lists them. An error also carries the platform's HTTP
`status` when a response caused it.

## GitHub adapter

The GitHub adapter serves `github.com` repositories and offers every flag.

- Issue reads, `byHeadBranch`, `closing`, `pullRequest`, `reviewThreads` and
  `mergesThroughQueue` use GitHub's GraphQL API, which GitHub serves only to
  authenticated callers, so on an anonymous connection they fail with
  `unauthenticated`. Label changes, comments, reviews, checks, releases, tags,
  roles and `viewer` use the REST API and work anonymously where GitHub
  allows it.
- Bot accounts carry GitHub's REST login, such as `dependabot[bot]`, from both
  APIs.
- `role` reports GitHub's role name, such as `admin`, `maintain`, `write`,
  `triage`, `read` or a custom role, and `null` when GitHub reports no
  permission. GitHub reports `read` for any account on a public repository.
- `viewer` reads GitHub's `/user`, which GitHub does not serve to GitHub App
  installation tokens, so for those it fails with `forbidden`.
- `checks` reports check runs with their status and conclusion, and commit
  statuses with their state as `status` and no conclusion.
- Requests use REST API version `2022-11-28`.
