# Contributing

## Issues

Use an issue for behavior changes and substantive work unless the maintainer
requests the change in a thread. Work without a ticket is a Direct change; see
[pull requests](#pull-requests). Agree on the scope and acceptance criteria
before implementation. Open issues with the repository's issue
templates. Specifications and implementation tickets live in the issue tracker;
repository documents keep durable domain language, decisions, usage guidance,
and development knowledge.

Use short, descriptive issue titles in sentence case and the project's
terminology. Name the observed failure for bugs, the desired capability for
features, the action for implementation tickets, and the capability being
specified for specifications. Avoid redundant type prefixes, issue numbers,
and trailing periods; aim for roughly 72 characters without a hard limit.

## Implementation contracts

A directly authored specification or implementation ticket carries its
implementation contract in its issue body and needs no intake triage, Agent
Brief, or category label. A triaged request uses the validator's body Agent Brief after explicit
activation. Preparation retains latest-comment contracts; cutoff preserves exact unchanged
inventoried comments until revision into the body. Preserve one verbatim `Original request` at the body's end.
See [the protocol](docs/development/issue-contract-v2.md).

Before implementing, read the whole issue, its discussion, its parent
specification, and its blockers, and clarify contradictions. Start a ticket
only after its blockers are closed.

Every ticket's change merges into its base branch on its own, with its checks
passing. An issue closes when its own acceptance criteria hold. After
readiness, nobody edits an implementation contract to record progress: progress
lives in linked pull requests, sub-issue states and comments.

Work that must be shown on a live system splits into a source ticket, which
closes when its pull request merges, and a live-acceptance ticket, blocked by
the source ticket, which closes only on its recorded live acceptance.

## Triage

Triage routes an intake request by where its uncertainty lies, not by its
category label. A request is code-bound when its expected result is clear and
code, logs, or a reproduction can answer the rest. It is intent-bound when an
open question needs the owner's intent, a policy, a trade-off they choose, or
their taste in copy, UI or look, as when its brief would otherwise leave an owner question, offer options, or
set a value nobody chose, including for a bug. Missing evidence or access never
licenses inventing policy.

The orchestrating agent runs triage and starts a research run, a separate
agent, for each request. For a code-bound request, the research run verifies
the claim and posts the Agent Brief. For an intent-bound request, it first
gathers the facts from the code. Where a factory runs triage itself, the
factory workflow rules' Triage run section sets that run's limits.

Under the inference test, whoever answers for the maintainer may settle a
question that would otherwise go to the owner only when all three hold: it can
cite the answer's source, the owner's approved goal for the work, a recorded
owner decision or wish, or the owner's
quoted words, each with its date; the choice is reversible within that work, so
no value or policy outlives it, and it adds no public name and no breaking
change; and it changes neither the goal nor the scope. A default, limit,
timeout, or fallback that persists in the product is never inferred. The brief
states each inferred answer as behavior, and its triage notes list it with its
citation under **Inferred intent**. A veto is an owner decision, and the brief
is revised from it.

Owner ideas take conversation and a grill unless the owner approves a shorter
path for that idea; filed requests take triage. Grills reuse answers and ask
only about one-way doors or unchosen values. List other answers passing the
inference test under **Inferred, listed for the owner**, with dated sources
and veto. Grill answers and plan approval remain gates.

The grill writer invokes `to-spec`, then `to-tickets`, publishing direct body
contracts for independent review, without intake triage, redundant Agent
Briefs or category labels. One specification lives in the repository
containing most work; tickets in their responsible repositories are its native
sub-issues with blockers. Copy relied-on decisions, dates and quotes into
every contract. A failed native edge stops progression: report the exact
missing relationship and platform failure.

The orchestrating agent decides the final split, merging, splitting, dropping
or setting aside drafts, and never accepts its own contract. Substantial split
changes return to the writer; missing code facts go to independent research.
Review checks evidence, scope, granularity, dependencies, acceptance criteria,
test seams and open questions without an owner quiz or settled-seam
confirmation. Reject unresolved or disguised owner intent; correct settled
questions. Structure and publication grant no readiness. Apply Readiness to
each exact contract, parent readiness after tickets under installed later-link
rules, and closed blockers before implementation. Without notice or authority,
leave readiness to the owner, reporting links under comment rules.

Changes to a plan's goal, Done means or row scope require an amendment grill,
possibly one round: revise the specification, then run `to-tickets` on the
delta, updating affected contracts and native links. Edited accepted contracts
lose readiness; require new notice, independent review and renewed readiness.
Findings, follow-ups passing the inference test and reorderings already
permitted by blockers need no amendment. Progress never edits ready contracts.

Grills edit domain documents on their own branch and checkout, never a shared
default-branch checkout. Open one draft PR per repository with domain changes,
delivered by separate `review`, run by the orchestrating agent unless a
factory reviews it. Return contracts for acceptance. Authoritative contracts
stay in repository issues.

A fact only an outside reporter holds goes to the reporter, with the issue in
`state:reporter`. A question only the owner can answer goes to the owner with
its recommendation, with the issue in `state:owner`, or in `state:grill` when
a grill must settle the owner's intent.

## Readiness

Applying `state:ready` is the review action, and the
`github-repository-configuration` rules name the roles it needs, the factory
triage run's exception to them, and the labels. After revising a contract or
posting an Agent Brief, wait for the issue-contract workflow's revision notice
before applying readiness. Editing a contract removes its readiness. The workflow keeps one workflow state label on
an issue, a `state:` label or the closing `wontfix` in its place: authorized
readiness or a newly applied state replaces the previous one, and an issue left with none gets
`state:triage` on every run, even if it has never carried a state. This applies
to open intake requests, specifications, tickets, and unrecognized issues;
Wayfinder maps and children stay outside workflow states. The validator's own
`state:triage` is a fallback and never supersedes authorized readiness bound to
the current revision, even when applied after its review. A person's later
workflow state still supersedes readiness. A closed issue loses every
`state:`, `gate:` and `factory:` label, preserving `wontfix`, `type:`,
`priority:`, `model:`, unrelated labels and feedback. Reopening restores no
removed labels; normal validation applies.
A specification or ticket can be ready while its blockers are open.

## Development setup

See the [development guide](docs/development/README.md) for prerequisites,
local setup, and development commands.

## Validation

Add or update tests for changed behavior where applicable. Run the required
checks documented in the development guide before requesting review.

## Findings

Every agent run records findings: implementation, release, review, and adoption or update. A
finding is a defect, gap, or stale instruction the run observed outside the
work it is responsible for. Fix defects inside the change's responsibility in
the change. An adoption run's own contextual work in the adopting repository
is not a finding.

A factory run cites its filing run in each finding it files, and never opens a
separate unticketed pull request: out-of-scope work, however small, is a
finding.

Before filing, check for an open issue that already reports the finding and
link it instead of creating a duplicate. Otherwise, open one issue per finding
through the target repository's issue forms, labelled `state:triage`. File it
in the repository responsible for the affected material or tooling. Each issue
cites the run's pull request or issue and distinguishes what the run observed
from what it only read in code. Leave the issues to triage.

Link every filed or existing issue in this order:

1. A run with a pull request links them from a comment on that pull request.
   For adoption, use its check-outcomes comment.
2. A run without a pull request links them from the issue it was working on,
   if there is one, such as a release run's planning issue.
3. Only a run with neither a pull request nor an issue lists them in its final
   message.

If filing fails, list each unfiled finding in the same place the links would
go, name its target repository, and state that it was not filed. Findings never
block or delay the run's pull request or other work.

## Titles and commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
for pull request titles and final commits on the default branch:

```text
fix(cli): reject incompatible standards versions
feat!: remove the legacy configuration format
```

Use lowercase types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`,
`ci`, `style`, `chore`, or `revert`. An optional scope names a stable component
or project. Write a concise action without a trailing period, preserving
proper names and identifiers. Use `style` for formatting changes.

Mark breaking changes with `!` and explain their impact and migration in the
message body. Prefer Conventional Commits during development; temporary
work-in-progress commits are allowed.

For attribution, follow [Agents on the maintainer's account](#agents-on-the-maintainers-account).

## Agents on the maintainer's account

An agent working on the maintainer's account may comment, file issues, open and
merge pull requests, and apply labels as the installed
[GitHub repository configuration rules](rules/github-repository-configuration.md)
and, where applicable, [factory workflow rules](rules/factory-workflow.md) allow;
the [readiness](#readiness), [credential](#credentials), and [merge](#merging)
gates still apply. What it posts on issues and pull requests follows the
[comment rules](rules/comments.md), as for any account.

The attribution ban forbids crediting an agent, model or tool in commits and
pull request titles and bodies, and never applies to comments. Under it, omit
every `Co-authored-by:` trailer, for any co-author, including people and bots;
any "Generated with …" or "Generated by …" attribution line; and agent session
links. The merging account already records who did the work.

## Pull requests

Use `implement`, then separate `review` through merge; factories without review
use `babysit` instead. Address review hand-backs on the same draft PR.

Keep each pull request focused. Describe the problem and resulting change,
report the checks you ran and their outcomes, and link the relevant issue.
A pull request that finishes its issue links it with a closing reference, such
as `Closes #123`, so merging it closes the issue. A pull request that does only
part of an issue's work links it without a closing reference, such as
`Part of #123`. A source pull request links its live-acceptance ticket this
way, because a merge never closes one. A closing reference closes the issue
only when the pull request merges into the default branch; with another base
branch, whoever merges closes the issue after the merge. If the work finished
the issue, close it.

A Direct change is work without a ticket, requested by the maintainer in a
thread or making a minor correction, such as a typo, broken link, or formatting
fix. Write `Direct change:` and a meaningful reason instead of the issue link.

Keep the pull request template's sections in order: Summary, Evidence, Merge
Danger, and Related issue. Include checks and outcomes in Evidence, and
relevant limits in Merge Danger. Put any other material, such as scope, impact,
or migration, in a subsection of the section it belongs to.

### Opening a pull request

Open the pull request against the base branch that `docs/agents/project.md`
names, else the default branch. Its branch holds only the work: branch from the
up-to-date base, and leave unrelated changes out of its commits. Title it as
[titles and commits](#titles-and-commits) describe.

Before opening, run the required checks on the final commit. When the checkout
holds unrelated uncommitted edits, run them in a clean checkout of that commit,
such as a temporary Git worktree. Run a check that reads a diff, such as
`git diff --check`, over the whole change against the base.

For an ordinary pull request, write the body with the `pr` skill. For an
adoption pull request, use the adoption record as described below.

### Worker handoff

Before worker handoff, every required check must pass on the latest pushed PR
head. Required names come from the pinned trusted default-branch
`.github/required-checks.json` under the `github-repository-configuration`
rules. Every configured location runs the same required command:

- `github`: use required hosted check results on that head.
- `runner`: use required commit statuses from the repository's named runner.
- `self-reported`: run and report the required local command on that head.

A head change invalidates earlier evidence. Pending, missing, failing,
unavailable or unrun required results cannot qualify. Unavailable Actions cannot
substitute a local pass for configured runner results. Fix and revalidate, or
follow existing blocked/failure delivery rules, naming checks and reasons.
Add no timeout, fallback or bypass.

Record the full head SHA, trusted declaration revision, location, required command,
names and outcomes. Draft-to-separate-review and no-review handoffs both retain
review/merge ownership and gates.

Self-reported success requires the independent review run, another agent and
sandbox, to rerun the same command on the current head before merging. The
worker report cannot replace that rerun or clear designated owner review.

### Adoption pull requests

An adoption pull request holds only one completed Repository Standards adoption or
update run. Record the pinned
`.repo-standards/runtime/node_modules/.bin/repo-standards status` ready-to-commit
verdict before committing. Otherwise finish or recover with `repo-standards adopt`,
using the pinned runtime once a run starts. An empty recorded change set can
remain ready after committing; later readiness never replaces pre-commit evidence.

Title it `chore: adopt <source> <version> with CLI <version>`, using the
source URL's repository name and versions from the record's Selection table.
An adoption is not breaking unless the maintainer judges it so.

Start its body with the complete `status --summary` output, byte for byte,
including its `# Repository Standards adoption record` heading and optional
sections. For a breaking (`!`) title, append Impact and Migration sections
if absent. Then optionally append one `## Related issue` section outside the
byte-preserved record, using the ordinary closing or partial-work reference.
Squash with the complete PR body, including that relationship.
Post one check-outcomes comment with the repository's own
validation outcomes, confirmation of the recorded ready-to-commit verdict, and findings
links or unfiled findings under the
[findings rule](#findings).
Write the check-outcomes comment under the [comment rules](rules/comments.md).

The Repository Standards update action uses `chore!:` titles and includes
Impact and Migration sections for major advances and breaking `0.x` minor
advances of either pin.

For adoption or update findings, use these target repositories:

- For the standards source's guidance, discovery, checks, fixes, installed
  files, or drafter, use the source repository identified by the source URL in
  the adoption record's Selection.
- For the Repository Standards CLI and its `adopt` command, use
  `lutzseverino/repo-standards`.

### Merging

Before delivery, read applicable installed rules for merge ownership and
owner review. When they assign the merge to another agent, the worker records
the prescribed PR handoff and stops without merging. The designated merging
agent resumes delivery from that handoff, enforcing those rules on the current
head alongside the conditions below.

Merge a pull request once every required check passes on its latest head and
every review thread is answered with its fix or a reasoned decline under the
[comment rules](rules/comments.md). Checks must include the current default branch
under GitHub enforcement wherever available; proven private-plan limitations
require immediate merging-agent verification with the accepted concurrent-base race. The
`github-repository-configuration` rules define freshness, passing checks and
reviewer policy.
Squash-merge pull requests into their base branch, passing the subject
`<title> (#<number>)` and the current PR body explicitly, with the body passed
byte for byte through a file or stdin. GitHub's default squash message must
never apply, because it can add co-author trailers. Preserve issue references
and breaking-change explanations in the final message.

Fix a review finding about a defect in what the change is responsible for.
Decline a finding that does not hold. A real finding may also be declined when
it is outside the change's ticket or scope; when it guards a rule another layer
owns, such as by duplicating that layer's validation; or when it guards against
the owner misconfiguring files only the owner writes, or a component corrupting
state it owns itself, which lie outside the threat model. Answer a decline with
its reason in its review thread under the [comment rules](rules/comments.md). Record real findings declined because they
are outside the change's ticket or scope, or because another layer owns the
rule they guard, under the [findings rule](#findings). Do not file findings
declined because they do not hold or lie outside the threat model.

## Credentials

An agent run uses only the credentials it was given. It never looks for, tests,
or uses another identity, whether a token, a CLI login, an environment variable,
a connector, or an app, including one reached through the agent provider's own
login. Searching for one, such as listing credential environment variables or
probing other `gh` configurations, counts as looking. When a push, merge, or API
call is refused for permission, the refusal stands: the agent stops and asks
the owner, as for any answer only the owner can give, and never retries under
another identity.

## Owner questions

When an agent needs an answer only the owner can give, it posts the question as
the [comment rules](rules/comments.md#owner-questions) say, and stops without a
pull request if none is open, or leaving the open pull request unmerged and
linked from the question. This owner handoff ends the agent's babysitting of
the pull request. The agent neither closes the pull request nor waits for the
answer. Subsequent continuation follows applicable installed rules.

If the answer changes the implementation contract, have a separate writer edit
it; await its validator notice, independent review and renewed readiness before
continuation.

## Comments

Every rule about what agents post on issues and pull requests, on any account,
lives in the installed [comment rules](rules/comments.md).
