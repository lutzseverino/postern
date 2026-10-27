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

| Label                 | Color    | Description                                                                |
| --------------------- | -------- | -------------------------------------------------------------------------- |
| `needs-triage`        | `fbca04` | Requires review or renewed review                                          |
| `needs-info`          | `d4c5f9` | Missing information; the orchestrating agent answers or routes it          |
| `ready-for-agent`     | `0e8a16` | Reviewed and sufficiently specified for agent implementation               |
| `ready-for-human`     | `1d76db` | Reviewed; needs the owner's accounts, credentials or a reserved taste call |
| `wontfix`             | `ffffff` | Will not be actioned                                                       |
| `bug`                 | `d73a4a` | Something isn't working                                                    |
| `enhancement`         | `a2eeef` | New feature or request                                                     |
| `wayfinder:map`       | `5319e7` | Planning map for related work                                              |
| `wayfinder:research`  | `bfd4f2` | Research question in a planning map                                        |
| `wayfinder:prototype` | `bfd4f2` | Prototype question in a planning map                                       |
| `wayfinder:grilling`  | `bfd4f2` | Design decision requiring discussion                                       |
| `wayfinder:task`      | `bfd4f2` | Task in a planning map                                                     |

`docs/agents/triage-labels.md` maps canonical roles to tracker label strings;
use the configured string for each role. Role meanings in these rules and the
contribution guide take precedence over its upstream Meaning column, including
the conflicting `needs-info` and `ready-for-human` entries.

For `needs-info`, follow the contribution guide's Triage section for question
routing and its inference test. Agent work follows the agent path; where
factory workflow rules are installed, follow them for factory pickup exclusions.

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

## Automated standards updates

Both profiles install `.github/workflows/standards-update.yml`. Its daily
schedule and manual `workflow_dispatch` run the job only when
`REPO_CANON_UPDATES` is `true`; installing the file opts nobody in. The job
reads `vars.REPO_CANON_RUNS_ON`, checks out the default branch, and serializes
runs through one concurrency group. Workflow-level permissions are empty; its
job's workflow token has only
`contents: write`, `pull-requests: write`, and `issues: write` permissions.

A GitHub App installation token is recommended. Install the App on the
repository with repository permissions Contents, Pull requests, Issues and
Workflows set to read and write. Workflows permission lets it push changes to
workflow files. Set the repository variable `REPO_CANON_UPDATE_APP_CLIENT_ID` to
the Client ID shown on the App's settings page, reached through the owning
account's or organization's **Settings > Developer settings > GitHub Apps > Edit**.
Set the secret `REPO_CANON_UPDATE_APP_PRIVATE_KEY` to its private key.
When both are present, the workflow creates an installation token for this
repository, explicitly limited to those four write permissions, and passes it
to checkout and the Repository Standards action.
Otherwise it passes `github.token` (`GITHUB_TOKEN`). Pull requests opened with
that fallback trigger no CI, and it cannot push workflow-file changes. The
repository must allow GitHub Actions to create pull requests for that fallback
to open one.

This job puts the App private key and a write token on the
`REPO_CANON_RUNS_ON` runners, so the warning above about persistent runners
running untrusted pull request code applies to it too.

The action moves both pins together to the newest CLI and standards release.
It maintains one rolling pull request on `repo-standards/update` when the
headless update completes, or one rolling issue carrying the open questions
when it stops or a push is refused. A newer target refreshes the rolling item;
the same target leaves it untouched. Remote setup is deferred until the next
local `adopt`. The installed caller never sets `agent-command`; an adopter
wanting that input writes a repository-owned caller workflow.

## Trusted review configuration

For each `babysit` request or wait invocation, resolve the destination
repository's default branch to one immutable full commit SHA. Read both
optional repository-owned files, `.github/factory-review-policy.json` and
`.github/pull-request-reviewer.json`, from that same commit before applying
policy or requesting review. Report the destination repository, default branch
and selected SHA with the command's outcome. A wait keeps the snapshot across
all polls and head changes; each new invocation resolves the current default
tip again, including after fixes, rebases, retries and resumed runs.

Configuration additions, edits and deletions take effect only after they land
on the destination default branch. The PR's head, source fork, chosen base
branch or retargeting, local branch and dirty or untracked files never select
or override this configuration.

Only verified absence at the selected commit invokes the optional-file
behavior below. A repository, default-branch, commit or file-read failure, or
invalid trusted configuration, is an explicit error before any review-request
mutation. It authorizes no skip and permits no fallback to local files, the
head or another revision.

Invalid JSON or a schema-invalid declaration requires an owner handoff:
identify the destination repository, selected default-branch revision, affected
file and validation problem, and name the correction needed. Record the owner
question under the contribution guide's comment rules and applicable installed
continuation rules, leave the PR open, and stop babysitting. Do not retry the
unchanged invalid configuration or proceed to merge.

The correction must land on the destination default branch through the
applicable owner-handoff and merge procedure. A correcting PR's proposed
configuration cannot govern its own delivery before it lands; this repair
grants no new merge exception. After the correction lands and continuation is
authorized, a fresh request or wait invocation resolves the current default
branch and uses the corrected configuration. Invocation errors, permission
refusals, platform failures and verified optional-file absence retain their
existing handling.

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

## Factory app-author review policy

The optional repository-owned `.github/factory-review-policy.json` exempts its
declared app author from agent-issued external review requests and external
reviewer response/review waits. Repo Canon installs no policy declaration or
default exemption. The factory host remains independent of repository reviewer
configuration; the installed `babysit` request and wait commands apply it
from the [trusted review configuration](#trusted-review-configuration).

The file is valid JSON holding exactly this object shape:

```json
{ "version": 1, "author": "example-factory[bot]" }
```

Both fields are required; unknown fields, unsupported versions, and malformed
JSON are errors. `author` is a nonempty, trimmed app identity in REST
`<slug>[bot]` or CLI `app/<slug>` form, with a nonempty slug. A plain human
login is an invalid declaration, regardless of the PR author or whether a
reviewer is configured; fail with a configuration error before any review
request or policy skip. No remote account-type lookup is required. Compare
authors case-insensitively, treating those REST and CLI forms as the same app.
A plain human login `<slug>` remains distinct from that app.
A different or missing PR author is not exempt. Invalid declarations
fail explicitly and never authorize a skip.

For a policy-skipped pull request, complete internal Standards and Spec reviews
before merge. Standards checks the change against the repository's documented
standards; Spec checks it against its originating implementation contract. The
installed `code-review` workflow provides both axes, including its handling of
a missing specification. These internal reviews are distinct from the configured
external reviewer. A policy skip supplies neither internal nor external approval.
For nonmatching and absent-policy pull requests, keep the existing applicable
internal-review workflow.

Apply this policy before the review request rules and reviewer wait
classification, on every head, including fixes, rebases, retries and resumed
runs. For a matching author, issue no external review request and impose no
external response/review wait, regardless of opening-request settings or
request bounds. Classify this outcome as a policy skip, separately from
external approval, reviewer unavailability or a timeout. At merge, record the
actual internal Standards and Spec review outcomes and state: "No external
reviewer runs on app-authored PRs." Follow the contribution guide's comment
rules for that outcome comment.

Required checks and their waits, internal Standards and Spec reviews, merge
authorization, and handling of findings that actually arrive remain enforced.
Use only supplied credentials under the contribution guide's credential rules.
Absent policy is supported: apply configured reviewer behavior without asking
the owner for a missing policy. A nonmatching author also keeps that behavior.
Without a reviewer configuration, checks-only behavior remains supported.

## Review requests

Apply the [app-author policy](#factory-app-author-review-policy) first; the
request rules below govern authors it does not exempt.

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

Apply the [app-author policy](#factory-app-author-review-policy) first; the
reviewer waits below govern authors it does not exempt.

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

Repo Canon's native GitHub relationship rules take precedence over the
fallback instructions in the upstream tracker guide installed at
`docs/agents/issue-tracker.md`. Parent/sub-issue links and blocker/dependency
links must use GitHub's native relationships. Task lists and `Part of`,
`Parent`, or `Blocked by` body references do not establish those links, even
when a native link cannot be created or the feature is unavailable. Required
named sections retain their content requirements.

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
on GitHub only the native parent relationship counts. A `Parent` section
retains its content requirements but a body-only reference does not link a
child. A failed relationship read fails validation before any mutation.

Maps and children carry no readiness and no workflow state label. Their
eligibility uses open state, assignment and native blockers, and the workflow
rejects readiness labels on them and never gives them a workflow state.
