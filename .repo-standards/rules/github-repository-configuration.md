# GitHub repository configuration rules

These rules cover the repository's GitHub settings, the workflows Repo Canon
installs, the optional pull request reviewer file, and the GitHub side of
issue and pull request work. They apply to all work in the repository,
including tracker work that changes no file. The contribution guide holds the
general issue, implementation contract, readiness, check, review thread,
findings, delivery and credential requirements, and the `comments` rules hold
what agents post on issues and pull requests.

## Labels

Apart from `wontfix`, each label belongs to a family named by its prefix. The
repository carries these canonical issue labels, with these colors and
descriptions:

| Label                 | Color    | Description                                                |
| --------------------- | -------- | ---------------------------------------------------------- |
| `state:triage`        | `fbca04` | Waits on triage to review it, or review it again           |
| `state:reporter`      | `d4c5f9` | Waits on its outside reporter for a fact only they hold    |
| `state:grill`         | `d876e3` | Waits on a grilling session for the owner's intent         |
| `state:owner`         | `1d76db` | Waits on the owner's answer or work only the owner can do  |
| `state:ready`         | `0e8a16` | Reviewed; waits on an agent to implement it                |
| `type:bug`            | `d73a4a` | Something isn't working                                    |
| `type:enhancement`    | `a2eeef` | New feature or request                                     |
| `priority:high`       | `d93f0b` | Picked up before normal and low priority work              |
| `priority:normal`     | `bfdadc` | Picked up in the usual order; no priority label means this |
| `priority:low`        | `c2e0c6` | Picked up after high and normal priority work              |
| `wontfix`             | `ffffff` | Will not be actioned                                       |
| `wayfinder:map`       | `5319e7` | Planning map for related work                              |
| `wayfinder:research`  | `bfd4f2` | Research question in a planning map                        |
| `wayfinder:prototype` | `bfd4f2` | Prototype question in a planning map                       |
| `wayfinder:grilling`  | `bfd4f2` | Design decision requiring discussion                       |
| `wayfinder:task`      | `bfd4f2` | Task in a planning map                                     |

An open issue carries exactly one `state:` label naming whom it waits on;
the contribution guide's Readiness section governs its maintenance.
`state:reporter` is only for a fact the outside reporter holds. Facts the
owner or filing agent lacks wait in `state:owner`, or `state:grill` for the
owner's intent. Follow the guide's Triage section for question routing and
inference. The repository owns `state:ready` readiness; `wontfix` marks an
issue closed as will not be actioned.

A triaged request carries one `type:` label, its category.

Triage sets pickup priority: a broken workflow, data loss or security problem
is `priority:high`; most work is `priority:normal`; cleanup with no user effect
is `priority:low`. No priority label means normal. Triage never replaces a
person's priority; the owner may change it at any time.

`docs/agents/triage-labels.md` maps the triage skills' roles to these labels.

These rules name no `gate:` or `factory:` label. Where factory workflow rules
are installed, follow them for those families and for `model:` labels.

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

## Pull request asset branches

Keep `pr-assets/*` branches permanently so pull request screenshots remain
available. Preserve them during branch cleanup, including after the associated
pull request merges. Ordinary implementation branches remain eligible for
cleanup.

## Required-check freshness

Every adopter requires GitHub's “Require branches to be up to date before
merging” setting on its default branch wherever required-check enforcement is
available: `strict: true` in classic protection, or
`strict_required_status_checks_policy: true` in an active applicable ruleset
with at least one required check. Checks must pass against the current default
branch. Extra validation after concurrent merges is expected.

Before unattended merging, confirm this platform enforcement through current
GitHub policy reads. A local ancestry check alone cannot protect against a
base advance between inspection and the merge request. Bypassable enforcement
alone cannot provide that final guard: babysit confirms either a strict
ruleset whose matching detail explicitly reports `current_user_can_bypass: "never"`
for the same credential that performs the merge, or strict classic
checks enforced for admins. The ruleset evidence concerns the merging credential:
a hidden bypass list or a list containing other actors does not disqualify it,
and an empty list alone does not qualify it. Other or missing caller-bypass
values cannot confirm that ruleset's enforcement.
Setup preserves existing bypass configuration; resolve insufficient enforcement
with the owner rather than changing bypass policy during delivery.

Only recognized plan-limit 403 responses for both classic protection and
rulesets on a private repository permit merging-agent freshness verification.
After slow gates, immediately before the expected-head merge, verify the live
default destination, unchanged validated/reviewed head, successful applicable
validation on that exact head, and current default-tip ancestry. Missing or
unreadable evidence, ordinary permission refusals, missing workflow and deferred
setup grant no exception. Another writer can advance the base after this final
check and the merge can succeed: the owner accepts this residual concurrent-base
race only on this proven plan-limited path. Immediate checks narrow the window;
they do not provide GitHub's atomic protection. Strict non-bypassable GitHub
enforcement remains required wherever available.
Otherwise unconfirmed freshness requires the contribution guide's owner handoff;
no alternate credential is permitted.

A stale PR returns to branch update and validation. Preserve its work, rebase
or replay only its changes onto the refreshed default branch, and repeat
required checks and applicable internal and external review on the replacement
head. Checks from the old head never qualify the replacement. GitHub remains
the final guard wherever enforcement is available; the plan-limited path repeats
its final verification with the accepted race.

Each delivery attempt, such as one `babysit` invocation, gets one branch
update. Never merge the default branch into the PR branch, and never use
GitHub's update-branch. A failed branch update, or a stale base again after it,
leaves the PR unmerged and requires the contribution guide's owner handoff with
its reason; it never starts another update.

## Designated owner review

Read both the authoritative implementation contract, resolved under the
contribution guide's Implementation contracts section, and the worker's
handoff. Either can require owner review; an omission in one cancels no
designation in the other. Carry the designation and its source into the PR
handoff and a delivery record under the `comments` rules, even when no worker
handoff is required.

Before merging a designated PR, the merging agent verifies the owner's explicit
approval of the current head. Record the approval's source and head SHA as a
delivery record under the `comments` rules. Any head change requires renewed
owner approval; approval of an earlier head does not authorize the new one.
Passing checks, a configured external review, its absence or timeout, and an
app-author review-policy skip never substitute for owner approval. When approval
is missing, follow the contribution guide's owner-question handoff and leave the
PR unmerged.

Verify designation and current-head approval from these records, including
after handoff or resumption. Both profiles enforce this gate without changing
merge ownership. In standard, the otherwise authorized merging agent,
ordinarily the implementer, enforces it without factory labels, pickup or
recovery. Follow installed factory workflow rules for merge ownership and
approval-pause continuation. Without a designation, ordinary merge conditions hold.

## Required-check authority and merge gate

The repository owns `.github/required-checks.json`. It is a JSON object with
required `version: 1` and a required nonempty `checks` array of nonempty
strings. Each name matches a GitHub check run or commit status exactly,
including case, spaces and punctuation. Repo Canon supplies its schema,
read-only `required-checks` check and shared interpretation, never repository
names. The declaration is neither an exact standard file nor adoption output.

Wait and merge read it from the same pinned destination default-branch commit
as trusted reviewer configuration. Each merge invocation selects current trusted
configuration independently; prior waits, local edits, proposed PR configuration,
GitHub rulesets and observed checks cannot replace this authority. A missing,
invalid or unreadable declaration fails closed, naming its path, problem and
trusted revision when available. Correct it on the trusted default branch
through the applicable owner correction and merge procedure, then invoke again
to select the current revision. A proposed file alone cannot repair an invocation;
there is no bootstrap bypass and no automatic selection of required names.

At every check location (`github`, `runner` and `self-reported`), merge itself
requires positive success for every declared name on the exact current head.
A completed successful check run or successful commit status qualifies. Missing,
pending, failed, cancelled, timed-out, skipped and neutral results do not.
Older-head success and earlier attempts cannot satisfy later pending or failed
attempts. Incomplete, unreadable or ambiguous evidence refuses merging. Wait
uses this same authority and interpretation: absence of checks never turns
into success after a timeout. Worker handoff and location/factory integrations
consume this declaration rather than maintaining separate required-name lists.
Existing waits on observed checks and workflow attempts still apply.

Before merging, independently read all review threads, including outdated
threads and later pages. Any unresolved thread opened by the configured
reviewer's account blocks merging, even after a reply, acknowledgement or
completed review. Only platform resolution clears it. Unreadable or incomplete
thread evidence refuses merging. Without a configured reviewer, this thread
gate adds no reviewer requirement. App-author policy does not waive it.

After slow gates, immediately before the expected-head merge, verify the
unchanged head, live default destination and ancestry containing its current
tip. A new head needs new evidence; a stale base requires branch update and
validation. Existing authorization, review, holds and refusal handling remain.
Strict GitHub enforcement stays an additional guard wherever available; the
Required-check freshness section retains the proven private-plan exception
and its accepted concurrent-base race.

## Preserved settings

The GitHub configuration changes only the labels, merge settings, required check,
and freshness these rules name. Unrelated labels, rules, checks, and repository
settings stay as the repository has them.

## Installed workflow runners

Every installed job reads `vars.REPO_CANON_RUNS_ON`. Unset or empty selects
`ubuntu-latest`; public repositories normally leave it unset. Private
repositories needing their own runners can use a non-empty JSON array of
non-empty runner label strings, such as `["self-hosted", "homelab"]`. Set it
only with matching runners, each carrying every listed label. Repository-owned
workflows may read it too.

Repository-level values override an organization-level variable of the same
name; installed jobs use no environments. Malformed JSON or unusable `runs-on`
values fail every installed job during GitHub evaluation, before any steps.
The expression does not validate the schema: parsed falsy JSON (`false`, `0`,
`null`, `""`) selects the hosted default but remains invalid. Never rely on
invalid-value fallback.

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

For unavailable self-hosted runners, delete the variable or set
`["ubuntu-latest"]` without editing installed files. Deletion exposes any
inherited organization value; `["ubuntu-latest"]` overrides it. Another machine
with the same runner labels needs no change. Variable changes affect new jobs;
cancel and rerun jobs already queued on unavailable labels.

## Automated standards updates

Standard and factory install `.github/workflows/standards-update.yml`. Its daily
schedule and manual `workflow_dispatch` run only when
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

The action moves both pins together to the newest CLI and standards release,
maintaining one rolling PR on `repo-standards/update` on headless completion,
or one rolling issue with open questions on a stop or refused push. A newer
target refreshes the item; the same target leaves it untouched. Remote setup
waits for the next local `adopt`. The installed caller never sets
`agent-command`; that input needs a repository-owned caller workflow.

## Trusted review configuration

For each `babysit` request, wait or merge invocation, resolve the destination
repository's default branch to one immutable full commit SHA. Read both
optional repository-owned files, `.github/factory-review-policy.json` and
`.github/pull-request-reviewer.json`, from that same commit before applying
policy or requesting review. Request and wait report the destination repository,
default branch and selected SHA with their outcome; merge includes them in its
missing-outcome diagnostic. A wait keeps the snapshot across
all polls and head changes; each new invocation resolves the current default
tip again, including after fixes, rebases, retries and resumed runs.

Only configuration landed on the destination default branch takes effect,
including deletions. PR heads, source forks, chosen bases or retargeting, local
branches and dirty or untracked files never select or override it.

Only verified absence at the selected commit invokes optional-file behavior.
Repository, default-branch, commit or file-read failures and invalid trusted
configuration error before any review-request mutation, authorizing neither
skip nor fallback to local files, the head or another revision.

Invalid JSON or a schema-invalid declaration requires an owner handoff naming
the destination repository, selected default-branch revision, file, validation
problem and needed correction. Record the owner question under the `comments`
and installed continuation rules; leave the PR open and stop babysitting,
without retrying unchanged invalid configuration or proceeding to merge.

Land the correction on the destination default branch through the applicable
owner-handoff and merge procedure; proposed configuration cannot govern its
correcting PR's delivery or grant a merge exception. Once landed and
continuation authorized, a fresh invocation resolves the current default
branch and uses the correction. Invocation errors, permission refusals,
platform failures and verified optional-file absence retain their handling.

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
  request. When true, ready-for-review transitions also supply request timing
  and push freshness as defined under [review requests](#review-requests).
  A push never counts.
- `finished`: optional object with a nonempty `commentMarker` and a nonempty
  `line`, a valid regular expression interpreted with the Unicode flag that
  has named `sha` and `at` groups.
- `unavailable`: array of nonempty reply texts; an empty array is valid.
- `bounds.responseMinutes` and `bounds.reviewMinutes`: positive finite numbers
  measured from the effective request time defined under review requests.
- `bounds.reviewRequests`: optional positive integer or the exact string
  `"unbounded"`; omission defaults to **4**. The total request bound is defined
  under [review requests](#review-requests).

A review of the pull request's head is complete when either holds:

- a GitHub review by `account` on the exact head approves, requests changes,
  has a nonempty body, or has an inline comment that starts a new thread. A
  pending review never completes one, and neither does a `COMMENTED` review
  with an empty body and only replies to existing threads;
- with `finished`, a comment by `account` containing `commentMarker` has a line
  matching `line` whose `sha` prefixes the head and whose `at` parses as a time
  at or after the latest opening request or exact request comment. A later
  ready transition does not replace this completion-evidence cutoff.

A comment by `account` at or after the latest opening request or exact request
comment that contains one of the `unavailable` texts marks the reviewer
unavailable. Ready transitions never discard a current-head completion or
unavailability reply these rules already recognize, including evidence recorded
during draft. Native review evidence remains head-specific as above.

Any comment by `account` at or after the effective request time counts as a
response, except a request comment, which is never a response. The reviewer did
not respond when no response arrives within `bounds.responseMinutes` of that
time, and did not review when no completed review arrives within
`bounds.reviewMinutes` of it. With `request.onOpen: false`, all these cutoffs
retain the existing explicit-request time unchanged across ready transitions.

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

## Internal Standards and Spec reviews

When an applicable workflow calls for internal review, use the installed
`code-review` workflow: Standards checks the change against the repository's
documented standards; Spec checks it against its originating implementation
contract, including the workflow's handling of a missing specification.
Review the current head and post the actual outcomes of both axes as the review
the `comments` rules' Reviews section describes. These reviews are distinct
from the configured external reviewer.

Policy-skipped pull requests require both reviews before merge. Nonmatching
and absent-policy pull requests retain their existing applicable internal-review
workflow and optionality in both profiles; this definition adds no blanket
review requirement. A policy skip supplies neither internal nor external approval.

## Review of an implemented pull request

An agent that wrote none of the change reviews an implemented PR through merge
with the installed `review` skill. Each round uses the
[internal reviews](#internal-standards-and-spec-reviews) on one head, checks the
implementation contract against its issue on the Spec axis, and leaves exactly
one review of that head under the `comments` rules' Reviews section. Without
an issue, review against the PR's decision-bearing body.

Fix small findings and revalidate. Larger findings (wrong approach, missing
acceptance criterion or large rework) return to implementation on the same PR
with that round's review as input; whoever ran the review relaunches it. A later
round still carrying a larger finding stops without converging, reports why
and leaves the PR draft. Wrong or ambiguous contracts move the issue to
`state:grill` under the guide's Triage section.

A round with no open finding holds: mark the PR ready and deliver under the
guide's Merging section. List only open findings in the round's review, fixes
under `Fixed`, and answer declines in their threads. Only the reviewing
account's undismissed standing reviews submitted on the head they name count
as its rounds. Resume delivery, including after interruption, only while that
account's latest review holds on the current head. Installed factory workflow
rules govern owner-gate stops.

## Factory app-author review policy

The optional repository-owned `.github/factory-review-policy.json` exempts its
declared app author from agent-issued external review requests and external
reviewer response/review waits. Repo Canon ships no policy declaration or
default exemption. Deliberate repository configuration is a separate post-run
commit outside the adoption commit and adoption PR, using the app identity
named by that repository; adoption never writes or changes the policy file.
The factory host remains independent of repository reviewer
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
A plain human login `<slug>` remains distinct from that app; different or
missing PR authors are not exempt. Invalid declarations never authorize a skip.

Apply this policy before the review request rules and reviewer wait
classification, on every head, including fixes, rebases, retries and resumed
runs. For a matching author, issue no external review request and impose no
external response/review wait, regardless of opening-request settings or
request bounds. Classify this outcome as a policy skip, separately from
external approval, reviewer unavailability or a timeout. Complete the shared
[internal reviews](#internal-standards-and-spec-reviews) and post their review
of the current head before merge. Exit `6` from wait prints that review's
template for the full current head; an unfilled template is not completed
evidence.

At every invocation, merge independently checks the platform PR author and the
trusted destination policy, including without a prior wait. A caller's wait
result or PR-branch policy never authorizes a skip. For a matching author, it
requires a complete pull request review of the current head in the shape the
`comments` rules' Reviews section gives; an issue comment or an earlier record
shape does not count. Missing, incomplete or stale evidence returns merge exit
`5` without a merge write: post the completed current-head review, then rerun.
That retry is distinct from owner handoff (`3`), head changed (`2`) and stale
base (`4`); every other merge condition still applies.

Required checks and their waits, internal Standards and Spec reviews, merge
authorization, and handling of findings that actually arrive remain enforced.
Use only supplied credentials under the contribution guide's credential rules.
Absent policy is supported: apply configured reviewer behavior without asking
the owner for a missing policy. A nonmatching author also keeps that behavior.
Without a reviewer configuration, checks-only behavior remains supported.

## Review requests

Before requesting review or accepting a reviewer-policy skip, check PR-body
file links into the PR's own repository at its head branch, including encoded
and slash-containing refs. Report offending links for the author to replace
with commit-SHA links, then rerun the check before proceeding. Preserve the
body; external links and other branches, including asset branches, are outside
this check. This applies with or without a configured reviewer.

Adoption PRs exempt only the complete, byte-preserved tool-generated summary
prefix verified by rebuilding the head's pre-commit state; appended sections
remain subject to the check even when they repeat generated headings. Missing,
failed or mismatching evidence grants no exemption: explain why and check the
whole body. The `babysit` request command supplies this verification method.

Apply the [app-author policy](#factory-app-author-review-policy) first; the
request rules below govern authors it does not exempt.

With a reviewer file, a review request is the pull request's opening when
`request.onOpen` is true, or a later comment whose whole trimmed body equals
`request.comment`; a push is never one. The `comments` rules say how to write
the review request comment.

When `request.onOpen` is true, the effective request time for response/review
bounds and push freshness is the latest of opening, exact request comments and
ready-for-review transitions. The latest transition restarts both bounds; a
later exact request comment takes precedence. Use the actual transition history
on every poll and resumed invocation, regardless of the PR's current draft
state. With no transition, opening and explicit-request behavior is unchanged.
A head pushed during draft before ready is covered by the ready-triggered
request: neither normal request nor a request for review fixes posts an extra
request for that covered head, subject to the existing request-bound reporting.
A push after the effective request time follows the fresh-request rule below.

When `request.onOpen` is false, ready transitions create no request, move no
explicit request time and add no request trigger. Existing draft-period requests
retain their request, freshness, completion and wait behavior.

When `request.onOpen` is false and no request exists, an agent must post the
review request comment for the head before first waiting. The request bound
cannot stop this first request.

After that first request, an agent must post the review request comment for a
new head when its push fixes, fully or partly, a review finding the
contribution guide does not let it decline, and the request bound has not been
reached. No other push gets a request: a push that only follows declines,
changes only tests, documentation or wording, or only fixes a failing check
gets none.

`bounds.reviewRequests` limits total requests, defaulting to **4** when omitted
from a reviewer file. A positive integer overrides the default; exact JSON
`"unbounded"` removes the count bound. Count opening when `request.onOpen` is
true and every comment whose whole trimmed body equals `request.comment`,
whoever posted it. At the bound, no agent requests another review. Without a
reviewer file there is no reviewer, request or reviewer wait; the default
creates none.

Ready transitions do not count toward, reset or replenish this budget.

The bound creates no reason to decline a real finding and no grouped follow-up
issue. After the bound is reached, fix every finding the contribution guide
does not let the agent decline and push without another request, and answer
any review that arrives anyway.

## Merging with a configured reviewer

Apply the [app-author policy](#factory-app-author-review-policy) first; the
reviewer waits below govern authors it does not exempt.

With a reviewer file, a pull request also waits for the configured reviewer's
review of its latest head before it merges. When the configured reviewer does
not review the latest head, because it is unavailable, no review was requested
after the head's push, it did not respond within `bounds.responseMinutes` of
the effective request time above, or no review arrived within `bounds.reviewMinutes`
of it, the pull request merges once the contribution guide's other merge
conditions hold. The merging agent then records the absent review as a delivery
record under the `comments` rules. Without the file, no reviewer wait or record
of an absent review is required.

## Readiness roles

Applying `state:ready` needs the repository `admin`, `maintain`, or `triage`
role. The `triage` role is the explicit authorization for a triaging agent. A
`write` role, an author association, a bot identity, or a passing structure
check supplies no authority, and the issue-contract workflow removes readiness
that an actor without one of these roles applied.

The factory's own triage run is the one exception. Where `.scriptorium/config.json`
names the factory's triage result under `triageResult`, readiness its `author`
account applies counts without a role when the current Agent Brief is the
triage result that account posted, naming its run, and that run did not write
the issue. Without that configuration, readiness comes only from the roles
above.

An orchestrating agent that accepts an Agent Brief applies its readiness only
when the credentials it was given hold one of these roles, and only after the
issue-contract workflow's revision notice for the brief revision it reviewed.
With other credentials, or without that notice, it applies no readiness and
leaves readiness to the owner. A research run that wrote the brief never
applies its readiness; only the factory's triage run accepts a brief it wrote.
Readiness it applies is bound to that revision like any other, so an edit to
the brief removes it until the new revision is reviewed.

These roles authorize an orchestrating agent whose account is a person, bot or
App alike. It applies readiness through triage's bundled `ready.mjs`, which
reports the validator's verdict on that same account's event for the reviewed
revision; its account's eligibility never authorizes manual labels that bypass
this command or the validator. A failed identity read authorizes no readiness
writes.

## Native blockers

Parent/sub-issue links and blocker/dependency links must use GitHub's native
relationships. Task lists and `Part of`, `Parent`, or `Blocked by` body
references do not establish those links, even when a native link cannot be
created or the feature is unavailable. Required named sections retain their
content requirements.

GitHub's native issue dependencies are the canonical blocking relationship.
When adding a native blocker, pass the blocking issue's numeric database ID as
`issue_id`, not its issue number or `node_id`.

## Agent Brief

The issue-contract workflow enforces this shape for a triaged request's Agent
Brief; the `triage` skill is a method for writing one. Prepared mode retains
comment publication and the v1 base decision; Seams exemptions use v3. Explicit body-mode activation requires a
trusted complete cutoff, a compatible result reader and dual-route poster, and
frozen publication during capture. Body mode, v2 results and refusal of new
comment contracts start together; downloading a release never activates them.
Only an exact unchanged inventoried legacy comment remains eligible, without
expiry, until its next revision moves to the body. Follow the validator's
selected source rather than selecting a competing comment.

The selected source starts with the `comments` rules' triage disclaimer, then a blank
line, then the `## Agent Brief` heading.

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
- Seams

The writer fills Seams from `codebase-design`'s Ownership check: `No trigger`
or its triggered read and selected default or accepted override. Independent
brief review assesses honesty, Value owner, consumers, reversibility and cost;
the validator checks non-placeholder content only. The fixed first-shipping
release boundary preserves an exact revision with trusted pre-release approval
evidence, until its next revision; it never grants or restores readiness.
The validator reports that exemption in its versioned result.

Category is `bug` or `enhancement`, and the issue's one `type:` label names
the same category. Empty content, template comments, empty task list items,
GitHub's `_No response_`, `TBD`, `TODO` and bracketed prompts such as
`[describe the bug]` are placeholders. Heading level, heading style and the
casing of the heading and field names do not matter, and the workflow also
accepts the disclaimer emphasized with `_` or without the blank line before
the heading. Contract syntax inside code or HTML comments is example content,
not part of the brief.

In body mode, place `## Original request` at the end, preserving the reporter's
original text verbatim exactly once through every revision. Reuse a correctly
preserved original; missing or ambiguous original input holds body conversion. Capture
intake author/writer proof before overwriting the body. A factory's configured
author posts a separate exact-revision attestation; app authorship or a copied
marker alone never authorizes readiness. The validator verifies durable
publication proof, the matching notice and the current ready event; authorized
person review remains available. Retain cutoff, selection and retirement facts
outside replaceable issue text/feedback across deletion, reopen and upgrades.

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
