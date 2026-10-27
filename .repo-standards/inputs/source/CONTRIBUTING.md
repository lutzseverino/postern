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
Brief, or category label. A triaged request's contract is its latest Agent
Brief comment; the intake body and discussion remain context.

Before implementing, read the whole issue, its discussion, its parent
specification, and its blockers, and clarify contradictions. Start a ticket
only after its blockers are closed.

Every ticket merges into its base branch on its own, with its checks passing.
Expand–contract batches that can't each stay green become a single ticket, not
tickets sharing an integration branch.

## Triage

Triage routes an intake request by where its uncertainty lies, not by its
category label. A request is code-bound when its expected result is clear and
code, logs, or a reproduction can answer the rest. It is intent-bound when an
open question needs the owner's intent, a policy, or a trade-off they choose,
as when its brief would otherwise leave an owner question, offer options, or
set a value nobody chose, including for a bug. Missing evidence or access never
licenses inventing policy.

The orchestrating agent runs triage and starts a research run, a separate
agent, for each request. For a code-bound request, the research run verifies
the claim and posts the Agent Brief. For an intent-bound request, it first
gathers the facts from the code.

Under the inference test, the orchestrating agent may answer an intent question
itself only when all three hold: it can cite the answer's source, the owner's
approved goal for the work, a recorded owner decision or wish, or the owner's
quoted words, each with its date; the choice is reversible within that work, so
no value or policy outlives it, and it adds no public name and no breaking
change; and it changes neither the goal nor the scope. A default, limit,
timeout, or fallback that persists in the product is never inferred. The brief
states each inferred answer as behavior, and its triage notes list it with its
citation under **Inferred intent**. The orchestrating agent lists every
inferred answer in its next report to the owner, so the owner can veto it. A
veto is an owner decision, and the brief is revised from it.

Questions it cannot infer go to a separate grilling session with the owner, in
short rounds of numbered questions, each with a recommended answer. The grill
records the owner's decisions and drafts the Agent Briefs in a proposed ticket
split; it files no issue and applies no readiness. The orchestrating agent
decides the split: it may merge, split, or drop a draft, or set it aside for
later work. It files the issues with the grill's briefs, and each issue's
triage notes record the owner decisions its brief relies on, each with its date
and where the owner gave it. A recorded decision is not asked again. The
orchestrating agent never writes a brief it accepts: when its split changes a
draft substantially, the grill rewrites that brief, and a research run writes
one only when it needs code facts the grill did not gather.

The orchestrating agent, never the agent that wrote the brief, then reviews its
evidence, scope, acceptance criteria, dependencies, and open questions. Passing
the structure check never makes a brief hold. A brief that leaves owner intent
open, or disguises it as an implementation choice, an option list, or a
fallback value, does not hold: questions the inference test cannot settle go to
the owner, and an unanswered required question blocks acceptance. Any other gap
goes back to the brief's writer for correction. The orchestrating agent accepts
a brief that holds by applying readiness to its revision, records its blockers,
and tells the owner with links. When the revision notice never arrives, or its
credentials cannot apply readiness, it leaves readiness to the owner and tells
them under the [comment rules](#comments) instead.

Every question reaches the orchestrating agent first. `needs-info` means
information is missing: the orchestrating agent answers what it can from code,
logs, or a reproduction, or under the inference test, and a question for an
outside reporter still goes to the reporter. A question only the owner can
answer goes into its decision inbox with its recommendation; the decision inbox
is the one channel for questions to the owner. When the owner runs triage
themselves, they are the orchestrating agent.

## Readiness

Applying `ready-for-agent` or `ready-for-human` is the review action, and the
`github-repository-configuration` rules name the roles it needs. After
revising a contract or posting an Agent Brief, wait for the issue-contract
workflow's revision notice before applying readiness. Editing a contract removes its readiness. The
workflow keeps one workflow state label on an issue: authorized readiness or a
newly applied state replaces the previous one, and an issue left with none gets
`needs-triage` on every run, even if it has never carried a state. This applies
to open intake requests, specifications, tickets, and unrecognized issues;
Wayfinder maps and children stay outside workflow states. The validator's own
`needs-triage` is a fallback and never supersedes authorized readiness bound to
the current revision, even when applied after its review. A person's later
workflow state still supersedes readiness. A closed issue loses `needs-triage`
and keeps its other labels and feedback unchanged.
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

Before filing, check for an open issue that already reports the finding and
link it instead of creating a duplicate. Otherwise, open one issue per finding
through the target repository's issue forms, labelled `needs-triage`. File it
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

No commit or pull request credits an agent, a model, or a tool as an author or
a source. Omit every `Co-authored-by:` trailer, for any co-author, including
people and bots; any "Generated with …" or "Generated by …" attribution line;
and agent session links. The merging account already records who did the work.

## Pull requests

Keep each pull request focused. Describe the problem and resulting change,
report the checks you ran and their outcomes, and link the relevant issue.
A pull request that finishes its issue links it with a closing reference, such
as `Closes #123`, so merging it closes the issue. A pull request that does only
part of an issue's work links it without a closing reference, such as
`Part of #123`. A closing reference closes the issue only when the pull request
merges into the default branch; with another base branch, whoever merges closes
the issue after the merge. If the work finished the issue, close it.

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

For an ordinary pull request, write the body with the `pr` skill, in the pull
request template's sections: the skill's Summary, Evidence and Merge Danger,
then Related issue. For an adoption pull request, use the adoption record as
described below.

### Adoption pull requests

An adoption pull request holds only one completed Repository Standards adoption or
update run. Record the pinned
`.repo-standards/runtime/node_modules/.bin/repo-standards status` ready-to-commit
verdict before committing. Otherwise finish or recover with `repo-standards adopt`,
using the pinned runtime once a run starts. An empty recorded change set can
remain ready after committing; later readiness never replaces pre-commit evidence.

Title it `chore: adopt <source> <version> with CLI <version>`, naming the
source by the repository name in its URL and the versions from the record's
Selection table, such as `chore: adopt repo-canon v0.6.0 with CLI 5.1.0`. An
adoption is not breaking unless the maintainer judges it breaking for the
project.

Its body is the adoption record: the output of `status --summary`, byte for
byte, starting with its `# Repository Standards adoption record` heading. The
record's Operations table lists the standards source's fixes and checks with
their results. Post one check-outcomes comment with the repository's own
validation outcomes, confirmation of the recorded ready-to-commit verdict, and findings
links or unfiled findings under the
[findings rule](#findings). For a breaking (`!`) title, append Impact and Migration
sections after the record only if it lacks them.
Write the check-outcomes comment under the [comment rules](#comments).

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
[comment rules](#comments). The `github-repository-configuration` rules state
when a head with no check counts as passed, and, for the optional
repository-owned `.github/pull-request-reviewer.json`, its schema, review
requests, and merging with or without the configured reviewer's review.
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
its reason in its review thread under the [comment rules](#comments). Record real findings declined because they
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

## Comments

When an agent needs an answer only the owner can give, post the question as one
issue comment under these rules, and stop without a pull request if none is open,
or leaving the open pull request unmerged and linked from the question. Work
without an issue asks on its pull request instead. This owner handoff ends the
agent's babysitting of the pull request. The agent neither closes the pull
request nor waits for the answer. Subsequent continuation follows applicable
installed rules. The orchestrating agent reads the question
first: when it can answer under the [triage](#triage) inference test, it
answers on the issue; otherwise it puts the question in its decision inbox.

If the answer changes the implementation contract, edit the contract; that
drops readiness and requires review again.

An agent comments on an issue or pull request to record a decision, an outcome,
or a question that needs an answer, never to narrate progress. Consolidate
everything the agent has to say on one occasion into one comment.

Every comment an agent writes on an issue or pull request starts with this AI
disclaimer line, `>` included, followed by a blank line:

```markdown
> _This was generated by AI._
```

During triage, use the triage skill's line in the same form instead:

<!-- prettier-ignore -->
```markdown
> *This was generated by AI during triage.*
```

Issue and pull request titles and bodies are exempt: their own format rules govern them.
A review request comment follows the `github-repository-configuration` rules
instead.

Comments, issue and pull request titles, and their bodies never contain secret,
token, or credential values. Write `<REDACTED>` in their place.
