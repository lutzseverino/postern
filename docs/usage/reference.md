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

`connect()` returns `ConnectionWithLabels`, whose issue tracker is an
`IssueTrackerWithLabels`: an extension of `IssueTracker` with the required
`labels()` and `updateLabel()` methods. These additive types are exported for
consumers and adapter contract harnesses. The existing `Connection` and
`IssueTracker` types retain their earlier structural requirements, so objects
and test doubles implementing them do not need either new method. A concrete
connection and its tracker remain assignable to those earlier types.

Keep the inferred `connect()` result or use the additive types when calling
the new operations. An explicit `Connection` or `IssueTracker` annotation
exposes the earlier surface:

```ts
import { connect, type IssueTrackerWithLabels } from "@lutzseverino/postern";

const tracker: IssueTrackerWithLabels = connect("https://github.com/octo/hello").issueTracker;
const labels = await tracker.labels();
```

Invalid options and arguments fail with `rejected` before any request. So
does any string Postern would send, in a path, query, header or body, that
holds an unpaired surrogate, such as `"\uD800"`, because it has no UTF-8
encoding. On GitHub, a label, login, commit or tag path segment of `.` or `..`
is also `rejected`, because GitHub's API cannot address it in a request path.

Postern reads each field of every object passed in once, whether an
identity, the options, an argument or a request, and checks and uses only
what it read. A getter or `Proxy` therefore cannot pass a check and then
give another value, and one that throws when read fails with `rejected`.

### Credentials

Without `credential` the connection is anonymous. A credential function that
throws, or returns nothing, fails the operation with `unauthenticated`; its
own error is not kept, because it may describe the credential. A token that
cannot be sent in a request header, such as one with a line break or an
unpaired surrogate, fails with `rejected`: when `connect` is given it, or when
a credential function returns it. Postern never
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
| `issueTracker`  | `botMarking`        | Accounts on every port report `bot` as a boolean; otherwise it is `null`.    |
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
| `issueEvent({ name, payload })`    | An `IssueEvent`, or `null` for an unsupported event or action; sends no request. |
| `issues({ state?, label? })`       | Issues in the state (default `open`), with the label when given, oldest first. |
| `issue(number)`                    | One issue in any state.                                                   |
| `labelChanges(number)`             | `{ id, action: "added" \| "removed", label, actor, time }`, in platform order. |
| `comments(number)`                 | The complete comment list.                                                |
| `addLabels(number, labels)`        | Adds the labels.                                                          |
| `removeLabel(number, label)`       | Removes the label; `notFound` when the issue lacks it.                    |
| `createLabel({ name, color, description })` | The created label; `color` is six hexadecimal digits without `#`. |
| `labels()`                        | Every repository label in platform order, across all pages; `[]` when there are none. |
| `updateLabel(name, { name, color, description })` | The updated repository label, selected by its current name. |
| `createComment(number, body)`      | The created comment.                                                      |
| `updateComment(id, body)`          | The updated comment.                                                      |
| `closeIssue(number)`               | Closes the issue.                                                         |

`labels()` and `updateLabel()` are available from 1.1.0 through the refined
connection and tracker types. Each label is `{ name, color, description }`;
GitHub's null description becomes an empty string. `updateLabel` sets the
complete desired name, color and description, so it can rename a label or
clear its description with `""`. Names are non-empty, well-formed strings;
colors are six hexadecimal digits without `#`, and descriptions are
well-formed strings, empty included. Invalid arguments fail with `rejected`
before a request. On GitHub the selected name is encoded as one path segment.

An update of a missing label fails with `notFound`; a platform validation
failure, including GitHub's 422, fails with `rejected`. Other failures keep
the usual error mapping, response status and redacted platform message. An
update never creates a missing label or retries as creation, and creating an
existing label still fails with `rejected`. Listing never returns a partial
list: an unreadable label or pagination, even on a later page, fails with
`invalidResponse` and that page's HTTP status. Ownership and the decision to
create or update a label stay with the caller.

A number names an issue. Where pull requests share the issue number space,
as on GitHub, `issue` and `closeIssue` fail with `notFound` for a pull
request's number, and `closeIssue` fails before it writes anything. Label,
label-change and comment operations act on whatever the platform records under
the number, which there includes a pull request's labels and conversation
comments; a caller that needs only issues passes only issue numbers.

An issue is `{ number, id, nodeId, url, state, title, body, author, labels,
createdAt, parent, subIssues, blockedBy, bodyEditTime, linkTime }`. `id` is
the platform's stable numeric identifier and `nodeId` its global API
identifier where it has one. Every numeric `id` is a safe integer; a read that
meets a larger one fails with `invalidResponse`. `bodyEditTime` is when the body was last edited
and `linkTime` when the latest sub-issue was linked; each is `null` when that
never happened. A comment is `{ id, nodeId, url, author, body, createdAt,
updatedAt }`.

#### Issue events

Available from 1.1.0. Pass the platform event name and parsed webhook payload
as a `PlatformEvent`: `{ name: string, payload: unknown }`. `issueEvent`
returns an `IssueEvent` with every field below present:

| Field           | Meaning |
| --------------- | ------- |
| `platform`      | The connection's `PlatformName`, currently `"github"`. |
| `repository`    | The connection's `RepositoryIdentity.path`. |
| `issue`         | The issue number, a positive safe integer. |
| `kind`          | An `IssueEventKind`, listed below. |
| `actor`         | The triggering `Account`, `{ login, bot }`; `bot` is `null` without `botMarking`. |
| `label`         | The label name for `labeled` and `unlabeled`; otherwise `null`. |
| `openingLabels` | The labels the issue was created with for `opened`; otherwise `null`. |
| `bodyChanged`   | Whether an `edited` event changed the body; otherwise `null`. |
| `comment`       | `{ id, body }` for comment events, including the deleted body for `commentDeleted`; otherwise `null`. |

`IssueEventKind` is `opened`, `reopened`, `closed`, `edited`, `labeled`,
`unlabeled`, `commentCreated`, `commentEdited` or `commentDeleted`.

```js
const event = await repository.issueTracker.issueEvent({
  name: webhookEventName,
  payload: parsedWebhookPayload,
});
if (event?.kind === "commentDeleted") console.log(event.comment.body);
```

These are triggering-event facts. Read current labels, body, comments,
timeline, roles, relationships and times through the other port operations;
a stale or replayed payload never supplies current state. Postern applies no
readiness or authorization policy. The caller obtains the payload and verifies
any webhook signature.

An invalid argument, including a non-string name or a payload that is not a
plain object, fails with `rejected`. A payload for another repository also
fails with `rejected`. Missing or unreadable fields needed for a supported
kind, including an unsafe numeric identifier, fail with `invalidResponse`
without an HTTP `status`. Each event field is read once, and every token the
connection has used is redacted from the result, as on other operations.

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

Where pull requests share the issue number space, as on GitHub, `comment`
posts on whatever item has the number, an issue included, without a request
to check which; a caller that means a pull request passes only pull request
numbers.

A pull request is `{ repository, number, id, nodeId, url, state, title, body,
author, createdAt, headBranch, headCommit, baseBranch, crossRepository }`,
with `state` `open`, `closed` or `merged`. Review states, check statuses and
conclusions are the platform's own words.

### `releaseSource`

| Operation          | Result                                                                  |
| ------------------ | ----------------------------------------------------------------------- |
| `releases()`       | `{ id, tag, name, draft, prerelease, publishedAt }` across every page.  |
| `tagCommit(tag)`   | The commit SHA the tag points to, peeling annotated tags; `invalidResponse` for a chain that leads back to a tag object it passed. |

### `access`

| Operation                                       | Result                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `viewer()`                                      | The authenticated account, or `null` when the connection is anonymous. |
| `role(login)`                                   | The account's repository role as the platform names it, or `null`.     |
| `request({ method?, path, query?, body?, headers? })` | `{ status, headers, data }` from the platform's API.              |
| `requestPages({ method?, path, query?, headers? })` | An ordered array of `{ status, headers, data }`, one per page. |

`request` sends the connection's credential, so its `path` must stay on the
platform's API: it starts with a single `/`. The path is sent as written, so
it holds nothing a URL would change: no fragment, backslash, whitespace,
control or non-ASCII character, dot segment (even percent-encoded) or empty
query string. Percent-encode such characters instead. A query goes either in
the path or in `query`, not both. Its `method` is `GET` (the default), `HEAD`,
`POST`, `PUT`, `PATCH`, `DELETE` or `OPTIONS`, in any case. Its `query` is a
plain object of strings, finite numbers or booleans. Its `headers` are a plain
object of valid header names, each named once in any case, with string values
that have no outer whitespace or control characters. They are sent as given,
over Postern's own `accept`, `content-type` and other defaults, except that
`authorization` is not accepted, since the request always carries the
connection's credential, and neither are the headers `fetch` sets itself:
`connection`, `content-length`, `expect`, `host`, `keep-alive`,
`transfer-encoding` and `upgrade`. Its `body`, sent only with a method other
than `GET` or `HEAD`, holds only plain objects, arrays, strings, finite
numbers, booleans and `null`, without cycles. A value JSON would drop or
coerce, such as `undefined`, `NaN`, `-0` (which JSON writes as `0`), a function
or a `Date`, is not accepted, and neither is an array with a hole or any field
besides its items, such as a named or symbol-keyed one, or an object with an
enumerable symbol key. A
request that breaks any of these fails with `rejected` before it is sent. Postern sends a copy it makes while
checking, so a later change to the objects passed in never reaches the
platform. A failing status rejects with
`PlatformError`, mapped like any other operation.

`requestPages` takes the same `TransportRequest` and applies the same checks
as `request`, but accepts only `GET` (the default, in any case), with no body.
Any other method fails with `rejected` before a request. It follows the
platform's pagination, preserving each page's status, headers and parsed data
without interpreting or joining its items. A response with no next link ends
the list and returns one page even when its data is empty. On GitHub it follows
`Link: rel="next"`; an unreadable link, a next link on another origin, or a
link back to a page already read fails with `invalidResponse` and that page's
status. Every page sends the connection's credential and the supplied headers;
`query` applies to the first request, then pagination supplies the next URL.
A failing page rejects the whole read with its own `PlatformError`. Credentials
are removed from every returned page. This operation paginates REST responses,
not GraphQL connections.

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

`platformErrorReasons` lists them. Every error raised once a response has
stated its HTTP status carries that `status`: a failing status, a GraphQL
error, a body that fails to arrive (`unavailable`), and any part of the
response the adapter cannot read, such as unreadable headers, a missing
field, an unreadable identifier, a time that is not ISO 8601 in the
platform's shape or that does not exist, such as February 30, or a page
without its cursor, on every page of a list.

`PlatformError.platformMessage`, also accepted by `PlatformErrorOptions`, is
the platform's own failure message with credentials removed. It is absent
when the response states no message. GitHub supplies the failing REST
response's `message`, or the first GraphQL error's `message`, on every
operation, including `access.request` and `access.requestPages`. Use it with
`status` and `reason` to distinguish, for example, two `notFound` 404s whose
messages are `Branch not protected` and `Not Found`. The error's `message`
remains a description of the failed operation; `platformMessage` provides
the platform's message separately.

A list continues only while a page says, exactly, that another page follows
and gives its cursor, and ends only on a page that says, exactly, that none
does. A page that does not say either way, or that leads back to a page
already read, fails with `invalidResponse`, so a list is never cut short or
read twice. This applies to every list, and to the lists an issue holds.

## GitHub adapter

The GitHub adapter serves `github.com` repositories and offers every flag.

- Issue reads, `byHeadBranch`, `closing`, `pullRequest`, `reviewThreads` and
  `mergesThroughQueue` use GitHub's GraphQL API, which GitHub serves only to
  authenticated callers, so on an anonymous connection they fail with
  `unauthenticated`. Label changes, comments, reviews, checks, releases, tags,
  roles and `viewer` use the REST API and work anonymously where GitHub
  allows it.
- `issueEvent` maps GitHub's [webhook payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads):
  `issues` actions `opened`, `reopened`, `closed`, `edited`, `labeled` and
  `unlabeled` keep those kinds; `issue_comment` actions `created`, `edited`
  and `deleted` become `commentCreated`, `commentEdited` and `commentDeleted`.
  Pull-request comments, other names and other actions return `null`.
  The actor comes from `sender`, opening labels from `issue.labels`, the
  changed label from `label.name`, and the comment from `comment.id` and
  `comment.body`. An issue edit changes the body when `changes.body` is
  present; a title-only edit reports `false`. Repository names are compared
  without regard to case. No API request or credential lookup is needed,
  including on anonymous connections.
- Bot accounts carry GitHub's REST login, such as `dependabot[bot]`, from both
  APIs.
- `role` reports GitHub's role name, such as `admin`, `maintain`, `write`,
  `triage`, `read` or a custom role, and `null` when GitHub reports no
  permission. GitHub reports `read` for any account on a public repository.
- With a GitHub App installation token, `viewer` fails with `forbidden`.
  It reads GitHub's `/user`, which isn't available to installation tokens,
  and Postern reports that failure rather than inventing an account.
- `checks` reports check runs with their status and conclusion, and commit
  statuses with their state as `status` and no conclusion.
- A failing status maps to a reason as follows. A rate limit shows as
  `x-ratelimit-remaining: 0`, a Retry-After header, or a message naming a
  rate limit.

  | Status                                          | Reason            |
  | ----------------------------------------------- | ----------------- |
  | 401                                             | `unauthenticated` |
  | 403 with a rate limit, 429                      | `rateLimited`     |
  | 403 otherwise                                   | `forbidden`       |
  | 404, 410, 451                                   | `notFound`        |
  | 409, 412                                        | `conflict`        |
  | 408, 421, 425, 5xx                              | `unavailable`     |
  | Any other 4xx                                   | `rejected`        |

- GraphQL errors, which GitHub may send with status 200, map by their type
  (`NOT_FOUND`, `FORBIDDEN`, `INSUFFICIENT_SCOPES`, `RATE_LIMITED`). An
  error without a known type is `rateLimited` when the response shows a rate
  limit, as above, and `rejected` otherwise.
- `retryAt` follows GitHub's
  [rate-limit handling](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#handle-rate-limit-errors-appropriately):
  the Retry-After time when the response states one, otherwise the
  `x-ratelimit-reset` time when `x-ratelimit-remaining` is `0`. Otherwise,
  as for a secondary rate limit with quota left, `retryAt` is unset, and
  GitHub advises waiting at least a minute before retrying.

- `closeIssue` reads the number's issue object before closing it, because
  GitHub's Issues API would close a pull request; GitHub offers no issue write
  conditional on what the number names, so an issue converted into a pull
  request between the read and the write is still closed.
- `tagCommit` follows at most 1,000 tag objects in one chain, one request each,
  and fails with `invalidResponse` past that.
- Requests use REST API version `2022-11-28`.
