# GitHub repository configuration rules

These rules cover the repository's GitHub settings, the workflows Repo Canon
installs, the optional pull request reviewer file, and the GitHub side of
issue and pull request work. They apply to all work in the repository,
including tracker work that changes no file. The contribution guide holds the
general issue, implementation contract, readiness, check, review thread,
findings, delivery, credential and comment requirements.

## Labels

The repository carries these canonical issue labels, with these colors and
descriptions:

| Label                 | Color    | Description                                                  |
| --------------------- | -------- | ------------------------------------------------------------ |
| `needs-triage`        | `fbca04` | Requires review or renewed review                            |
| `needs-info`          | `d4c5f9` | Waiting for information needed to evaluate the request       |
| `ready-for-agent`     | `0e8a16` | Reviewed and sufficiently specified for agent implementation |
| `ready-for-human`     | `1d76db` | Reviewed and requires human implementation                   |
| `wontfix`             | `ffffff` | Will not be actioned                                         |
| `bug`                 | `d73a4a` | Something isn't working                                      |
| `enhancement`         | `a2eeef` | New feature or request                                       |
| `wayfinder:map`       | `5319e7` | Planning map for related work                                |
| `wayfinder:research`  | `bfd4f2` | Research question in a planning map                          |
| `wayfinder:prototype` | `bfd4f2` | Prototype question in a planning map                         |
| `wayfinder:grilling`  | `bfd4f2` | Design decision requiring discussion                         |
| `wayfinder:task`      | `bfd4f2` | Task in a planning map                                       |

These rules name no `factory:` label: a factory creates its own state labels
from the repository's factory configuration.

## Merge settings

Squash merging is the repository's only merge method: merge commits and rebase
merging are disabled. The squash commit's default subject is the pull request
title and its default message is the pull request body.

Requiring the stable `PR metadata` check is a plan-gated requirement: the
default branch requires it wherever GitHub offers branch protection or rulesets
for the repository. On a private repository whose plan offers neither, the
requirement is unavailable, not optional, and applies once GitHub offers
either. GitHub runs the PR metadata validation workflow only from the default
branch, so the check is required once the workflow is on the default branch.

## Preserved settings

The GitHub configuration changes only the labels, merge settings, and required
check these rules name. Unrelated labels, rules, checks, and repository
settings stay as the repository has them.

## Installed workflow runners

Every installed job reads `vars.REPO_CANON_RUNS_ON`. Unset or empty selects
`ubuntu-latest`; a public repository normally leaves it unset. A private
repository that needs its own runners can set it to a JSON array of runner
label strings, for example `["self-hosted", "homelab"]`. The array must be
non-empty and contain only non-empty strings. A runner must carry every listed
label. Set the variable only when the repository has matching runners.
A repository's own workflows may read the same variable too.

An organization-level variable of the same name also reaches these jobs, and
a repository-level value takes precedence. The installed jobs use no
environments. Never rely on invalid values falling back: malformed JSON or an
unusable `runs-on` value makes every installed job fail during GitHub's
evaluation, before any steps run. The expression does not validate the value's
schema: parsed falsy JSON such as `false`, `0`, `null`, or `""` also selects
the hosted default, but such a value is still invalid.

The runners need `git`, `bash`, and network access for Node.js setup through
`actions/setup-node`. The factory profile's sandbox-image job also needs a
`docker` CLI with a daemon that can run `docker build`. A job with no matching
online runner waits in the queue for up to 24 hours and then fails.
Issue-contract feedback, and therefore readiness review, waits for those
runners too.

The sandbox-image job executes pull request workflow and Dockerfile content,
including content from forks. For repositories accepting untrusted pull
requests, keep the hosted default or select isolated, ephemeral self-hosted
runners with no secrets or sensitive network access. This applies to private
and internal repository forks too. A read-only workflow token does not prevent
untrusted code from compromising a persistent runner and later jobs. Every
runner matching the variable's labels must be suitable for that workload;
runner isolation is a host provisioning responsibility. See GitHub's
[self-hosted runner security guidance](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners).

If the self-hosted runners are unavailable, return to GitHub-hosted runners by
deleting the variable or setting it to `["ubuntu-latest"]`, without editing
installed files. Deleting a repository-level variable exposes an inherited
organization-level value if one exists; set `["ubuntu-latest"]` to override
that value. A runner on another machine carrying the same labels takes the jobs
with no change at all. Changing the variable selects runners for new jobs;
cancel and rerun a job already queued on unavailable labels.

## Pull request reviewer file

The optional repository-owned `.github/pull-request-reviewer.json` names the
pull request reviewer and its wait bounds as data only. Repo Canon installs no
reviewer file or preset, and the factory does not read it. Without the file,
no reviewer is configured. When the file exists, it is valid JSON holding one
object with the fields below.

Every field is required except `finished` and `bounds.reviewRequests`. Unknown
fields are invalid, at every level.

- `version`: `1`.
- `account`: the reviewer's nonempty GitHub login, including `[bot]` when part
  of the login.
- `request.comment`: a nonempty, trimmed string. A request comment's whole
  trimmed body must equal it; a mention within other text never counts.
- `request.onOpen`: boolean; whether opening the pull request counts as a
  request. A push never counts.
- `finished`: optional object with a nonempty `commentMarker` and a nonempty
  `line`, a valid regular expression interpreted with the Unicode flag that
  has named `sha` and `at` groups.
- `unavailable`: array of nonempty reply texts; an empty array is valid.
- `bounds.responseMinutes` and `bounds.reviewMinutes`: positive finite numbers
  measured from the latest request.
- `bounds.reviewRequests`: optional positive integer; the total request bound
  defined under [review requests](#review-requests).

A review of the pull request's head is complete when either holds:

- a GitHub review by `account` on the exact head approves, requests changes,
  has a nonempty body, or has an inline comment that starts a new thread. A
  pending review never completes one, and neither does a `COMMENTED` review
  with an empty body and only replies to existing threads;
- with `finished`, a comment by `account` containing `commentMarker` has a line
  matching `line` whose `sha` prefixes the head and whose `at` parses as a time
  at or after the latest request.

A comment by `account` at or after the latest request that contains one of the
`unavailable` texts marks the reviewer unavailable. Any comment by `account` at
or after the request counts as a response, except a request comment, which is
never a response. The reviewer did not respond when no response arrives within
`bounds.responseMinutes` of the latest request, and did not review when no
completed review arrives within `bounds.reviewMinutes` of it.

For example, with placeholder values:

```json
{
  "version": 1,
  "account": "example-reviewer[bot]",
  "request": {
    "comment": "@example-reviewer review",
    "onOpen": true
  },
  "finished": {
    "commentMarker": "<!-- example-review-summary -->",
    "line": "Reviewed `(?<sha>[0-9a-f]{7,40})` at (?<at>\\S+)"
  },
  "unavailable": ["example-reviewer is not enabled for this repository"],
  "bounds": {
    "responseMinutes": 5,
    "reviewMinutes": 30,
    "reviewRequests": 4
  }
}
```

## Review requests

With a reviewer file, a review request is the pull request's opening when
`request.onOpen` is true, or a later comment whose whole trimmed body equals
`request.comment`; a push is never one.

When `request.onOpen` is false and the pull request has had no review request,
an agent must post the review request comment for its head before it first
waits on the pull request. The request bound cannot stop this first request,
since none has been counted yet.

After that first request, an agent must post the review request comment for a
new head when its push fixes, fully or partly, a review finding the
contribution guide does not let it decline, and the request bound has not been
reached. No other push gets a request: a push that only follows declines,
changes only tests, documentation or wording, or only fixes a failing check
gets none.

The optional `bounds.reviewRequests` limits the total review requests a pull
request gets. Count the opening when `request.onOpen` is true and every comment
whose whole trimmed body equals `request.comment`, whoever posted it. Once that
count reaches the bound, no agent requests another review. Without the field
there is no count bound.

The bound creates no reason to decline a real finding and no grouped follow-up
issue. After the bound is reached, fix every finding the contribution guide
does not let the agent decline and push without another request, and answer
any review that arrives anyway.

## Review request comments

Write the configured reviewer's request phrase only in a comment that requests
a review. That comment holds exactly `request.comment`, with no AI disclaimer:
it is exempt from the contribution guide's disclaimer rule. The phrase never
appears in prose, quotations, or code spans in any other comment, issue or pull
request title, or body. To mention the request, describe it as "the review
request comment".

## Merging with a configured reviewer

With a reviewer file, a pull request also waits for the configured reviewer's
review of its latest head before it merges. When the configured reviewer does
not review the latest head, because it is unavailable, no review was requested
after the head's push, it did not respond within `bounds.responseMinutes` of
the latest review request, or no review arrived within `bounds.reviewMinutes`
of it, the pull request merges once the contribution guide's other merge
conditions hold. The merging agent then comments on it that the configured
reviewer did not review that head and why, under the contribution guide's
comment rules. For a head with no request after its push, the comment says
whether the request rule required none or the bound was reached. Without the
file, no reviewer wait or comment about an absent review is required.

## Pull request head with no check

A pull request head that has no check counts as having its checks passed once
5 minutes have passed since the later of the pull request's opening and a push
of that head that GitHub recorded, and only while no workflow run for the head
is unfinished or counted as failed. A
workflow whose latest run failed with no check from that run or attempt counts
as a failed check. A head with no recorded push and no check or workflow run
never settles its checks: they neither pass nor fail. The `babysit` skill's
wait applies this rule.

## Readiness roles

Applying `ready-for-agent` or `ready-for-human` needs the repository `admin`,
`maintain`, or `triage` role. The `triage` role is the
explicit authorization for a triaging agent. A `write` role, an author
association, a bot identity, or a passing structure check supplies no
authority, and the issue-contract workflow removes readiness that an actor
without one of these roles applied.

An orchestrating agent that accepts an Agent Brief applies its readiness only
when the credentials it was given hold one of these roles, and only after the
issue-contract workflow's revision notice for the brief revision it reviewed.
With other credentials, or without that notice, it applies no readiness and
leaves readiness to the owner. The run that wrote the brief never applies its
readiness. Readiness it applies is bound to that revision like any other, so
an edit to the brief removes it until the new revision is reviewed.

## Native blockers

GitHub's native issue dependencies are the canonical blocking relationship.
When adding a native blocker, pass the blocking issue's numeric database ID as
`issue_id`, not its issue number or `node_id`.

## Agent Brief

The issue-contract workflow enforces this shape for a triaged request's Agent
Brief comment; the `triage` skill is a method for writing one.

The comment starts with the triage disclaimer, then a blank line, then the
`## Agent Brief` heading:

<!-- prettier-ignore -->
```markdown
> *This was generated by AI during triage.*

## Agent Brief
```

Nothing else comes between the disclaimer and the heading; other triage notes
follow the brief. Under the heading, each of these fields starts a line with
its name and a colon in bold, such as `**Category:**`, and holds content that
is not a placeholder:

- Category
- Summary
- Current behavior
- Desired behavior
- Key interfaces
- Acceptance criteria
- Out of scope

Category is `bug` or `enhancement`, and the issue's one category label is the
same. Empty content, template comments, empty task list items, GitHub's
`_No response_`, `TBD`, `TODO` and bracketed prompts such as
`[describe the bug]` are placeholders. Heading level, heading style and the
casing of the heading and field names do not matter, and the workflow also
accepts the disclaimer emphasized with `_` or without the blank line before
the heading. Contract syntax inside code or HTML comments is example content,
not part of the brief.

## Wayfinder maps and children

The issue-contract workflow enforces these labels, sections and parents for
Wayfinder planning issues; the `wayfinder` skill is a method for charting and
working a map.

A map carries `wayfinder:map` and no Wayfinder child label. Its body has the
sections Destination, Notes, Decisions so far, Not yet specified, and Out of
scope. Each needs content that is not a placeholder, except Decisions so far,
which may be empty. The map lists no open children: they are found by querying
its open sub-issues. Decisions so far indexes closed children, one line each,
by title and link. The workflow does not check these two index conventions.

A child carries exactly one of `wayfinder:research`, `wayfinder:prototype`,
`wayfinder:grilling`, and `wayfinder:task`, and never `wayfinder:map` with it.
Its body has a Question section that is not a placeholder, and its parent is an
issue labeled `wayfinder:map`. Make the child a native sub-issue of its map:
on GitHub the native parent relationship is canonical. For compatibility, the
workflow also accepts the first issue reference in the child's `Parent`
section when the native relationship is absent or GitHub's relationship
endpoint is unavailable; a `Part of` line alone does not link a child.

Maps and children carry no readiness and no workflow state label. Their
eligibility uses open state, assignment and native blockers, and the workflow
rejects readiness labels on them and never gives them a workflow state.
