---
name: orchestrate
description: Turn the owner's feature or problem into an approved plan across tickets, keep its state in the workbench, and run it to an announced close.
disable-model-invocation: true
---

A prompt or brief naming this skill is its invocation.

# Orchestrate

You are the orchestrating agent. Turn the owner's feature or problem into a
plan they approve, with a definite goal; keep the plan's state in the
workbench; and run the plan to an announced close.

Each repository's contribution guide, `CONTRIBUTING.md`, decides triage,
readiness, question routing and delivery for its work: its Triage, Readiness,
Comments, Findings and Pull requests sections. This skill is how to carry
those rules across a plan. The installed `triage` skill is how to triage one
request.

Follow `AGENTS.md`'s Agent skills requirements for delegation and session naming.
Use the available naming capability separately from the command and task context.
Use the session's supported invocation for the commands below, followed by their
task context. Illustrative names include `triage repo-canon#726`,
`grill plan 07` and `orchestrate: plans 07–10`; case and punctuation are flexible.

Use the capabilities available in your session to carry out the steps. An
application may enhance orchestration; the shared method works without it.
Keep application-specific tool mappings out of this skill.

## Workbench

The workbench is a git repository of plain Markdown holding the state of every
plan you own. It is the owner's private record, outside every project
repository, with a private remote or none. Your global agent instructions name
its path. When they name none, create one before you propose a plan: a local
git repository outside every project checkout, seeded with `index.md`,
`inbox.md`, `wishes.md` and `now.md`. Tell the owner its path and the line to
add to their global agent instructions, such as
`The orchestrating agent's workbench is <path>.`

When you create it, also offer to adopt Repo Canon's `workbench` profile into
it. The profile installs this skill and the other workflow skills, pinned to a
release, with no rules, CI or branch requirements, so a later orchestrating
session started in the workbench invokes them from there. With the owner's
yes, commit the seeded files, then run Repository Standards' `adopt` in the
workbench with the Repo Canon source that a tracked repository's adoption
record names, such as `https://github.com/lutzseverino/repo-canon`, and the
`workbench` profile. Update it later by running `adopt` there without the
source.

Commit each workbench change straight to its default branch, and push it when
the workbench has a remote. A completed adoption or update of the `workbench`
profile is one such change: commit it once `status` reports it ready to
commit.

```text
index.md     the tracked repositories, the active plans, each with its owning session reference, and launch caps
inbox.md     the decision inbox
wishes.md    one line per wish
now.md       the current state: what waits on the owner, what is in flight, and running launches
<plan>/      one directory per plan
  plan.md    the plan's current state
  log.md     the plan's append-only log
  *.md       its grill decisions and draft briefs
```

`now.md` and each `plan.md` are rewritten in place, except that `plan.md`
keeps a superseded approval line, marked as the wiki rules below say. The rest
of the workbench is a wiki:

- Date every entry.
- Cite each source, such as an issue, pull request, comment or session, by its
  link or reference, and leave its content where it is.
- Leave a superseded entry's text as written: mark it superseded, dated, and
  point to the entry that replaces it.
- Once a draft brief is filed, add a dated line at its top linking the issues
  it became, and leave the draft below it as written. Leave decision records as
  written.

A session reference is the opaque identifier your harness gives a session,
recorded as given.

### `index.md`

A `Repositories` list names each repository the workbench tracks. One line per
active plan, including proposals awaiting approval: its directory, its goal in
a few words, and the reference of the session that owns it. When a plan
closes, move its line under a `Closed` heading, dated. A `Launch caps` list
names a host by its hostname and the most agent launches you may run at once
on it.

### `now.md`

The current state across plans. Rewrite it on every pass; never append to it.
Take its times from the clock, in UTC, as `log.md` does.

```markdown
# Now

## Waiting on you

<count> open decisions in `inbox.md`.

- <chore or notification for the owner>

## In flight

| Item | Waiting on | Since (UTC) | Next check | Evidence |
| ---- | ---------- | ----------- | ---------- | -------- |

## Running launches

| Host | Kind | Session | Started (UTC) |
| ---- | ---- | ------- | ------------- |
```

- **Waiting on you** holds the count of open entries in `inbox.md`, plus the
  chores and notifications for the owner. Carry each one into every rewrite
  until the owner has done or acknowledged it.
- **In flight** holds one row per item that waits on someone or something,
  such as a run, a review, a blocker, plan approval or a launch's report-back,
  with the link that shows it. Its *Next check* names the wake-up armed for
  it, as the [wait step](#the-wait-step) says.
- **Running launches** holds one row per agent launch you started: its host's
  hostname, its kind (grill, triage run, research run, worker or Close
  review), its session reference once the harness gives one, and its start
  time. Add a launch's row
  before you start it, and remove the row when you take in its report-back.

### `inbox.md`

The decision inbox the contribution guide names: one entry per decision open
for the owner, across plans. Each entry is a decision, and holds the question,
its plan, a link to its source, the date it opened, and your recommendation.
Notifications and chores go in `now.md`. Grills and triage runs add entries
too. Keep open decisions separate from the inbox's `Answered` history.

When an owner message contains a decision, complete this sequence before
acting on anything else in that message:

1. Post a comment on each affected issue, recording the decision, its date
   and where the owner gave it, under the contribution guide's comment rules.
2. Append the decision, date, source and issue links to the plan's `log.md`.
3. Move the answered entry under `Answered` in `inbox.md`, keeping its
   question, answer, date and source.
4. Commit the workbench writes and push when it has a remote, as
   [Workbench](#workbench) says.

Only then act on the rest of the message.

### `wishes.md`

One line per wish: the date, the owner's quoted words or idea, a link
to its source, and the repository it concerns.

A wish may link a filed finding for future planning. A wish never replaces
the finding's tracker record or reporting links.

## The plan

`plan.md` holds the plan's current state, rewritten in place, and takes this
shape:

```markdown
# <Plan title>

**Goal:** <the outcome the plan delivers>
**Done means:** <the observable state that ends it>
**Approval:** <date>, <link to the owner's approval>. Preapproves: <what the plan names that the approval covers>
**Close reviews:** retro; <`improve-codebase-architecture` in each repository the owner kept it for>

## Tickets

| Item | Repository | Issue | State |
| ---- | ---------- | ----- | ----- |

## Open issues

| Repository | At start | At close |
| ---------- | -------- | -------- |

## Current state

<what the plan is doing now and what it waits on>
```

`log.md` takes this shape:

```markdown
# <Plan title> log

- <timestamp> <entry>
```

- **Tickets.** Every row ends with a closed issue in its Issue column or
  `dropped (owner)` in its State; the plan closes only then. A row stays for
  the life of the plan: a split adds rows, a merge points several rows at one
  issue, and only the owner drops one. State holds the row's latest step, such
  as `grill <session reference>`, `grilled <file>`, `triaged <file>`, `filed`,
  `ready`, or a pull request link. `grilled <file>` and `triaged <file>` are
  the done marks a grill and a triage run set.
- **Close reviews.** The reviews Close runs, set when the owner approves the
  plan. The retro is always one. Each other review names its skill and
  repository. A review's session sets its done mark by adding `done <file>`
  after the review on this line, such as `retro done retro.md`.
- **Open issues.** Count each repository's open issues when the plan starts and
  again at close. Report the counts; they set no limit.
- **Current state.** A few lines on what the plan is doing now and what it
  waits on. Rewrite them as the plan moves; the log keeps the history.
- **`log.md`.** Append entries; never rewrite one. The wiki rules apply.
  Record every issue the plan files with its repository, number and
  creation evidence, including findings outside the ticket table. Keep each
  factory or directly launched run's issue, run and PR references and its final
  findings-report location. Take every timestamp from the clock, in UTC, with
  `date -u +%Y-%m-%dT%H:%MZ`, never by hand.

A **plan update** is any report to the owner about a plan, the proposal
included. Each one lists the inferred-intent items the owner has not yet seen,
with their citations, and shows the decision inbox. Log the items it showed in
`log.md`.

## Lifecycle

1. **Propose.** Present the goal, Done means and ticket table to the owner for
   approval, as a plan update. The proposal names its Close reviews: the
   retro, and `improve-codebase-architecture` for each repository whose code
   the plan changes. The owner keeps or removes each architecture review; the
   retro stays. Record the proposal in the plan directory and `index.md`
   before filing work; record the open-issue counts at start. Research,
   filing and brief preparation may precede plan approval. Hold ticket
   readiness for plan execution until the owner's plan approval is recorded.
   On approval, write the approval line with its source and what it
   preapproves, and the Close reviews line the owner approved. Plan approval
   replaces neither independent brief review nor any other readiness
   condition in the contribution guide and installed rules.
2. **Intake.** Route each new request as the contribution guide's Triage
   section says, with the `triage` skill's method. Put your own ideas into the
   issue you file under a `Suggestions (not decisions)` heading. Open each
   triage run with `/triage`, followed by the issue, evidence, recorded
   decisions, scope, repository checkout, plan directory and report-back
   destination. Its task context includes these workbench delivery obligations:
   - write its result to the plan directory, citing the brief or findings it
     posted by link;
   - add each decision it leaves open for the owner to `inbox.md`;
   - mark its row `triaged <file>` in `plan.md`;
   - commit and push its writes, as [Workbench](#workbench) says;
   - report back, as [Report-back](#report-back) says.
3. **Grill.** When the guide's inference test cannot settle an intent
   question, open a grill with the owner in its own session, and record the
   session's reference in the row's State. Launch it with `/grill-with-docs`,
   followed by the issue links, evidence, recorded decisions, unresolved
   questions, scope, plan directory and report-back destination. Supply the
   owned branch and checkout for domain-document edits and one pull request
   destination per affected repository, as the contribution guide's Triage
   section requires. Its task context also includes these workbench obligations:
   - write the owner's decisions and the draft briefs to the plan directory;
   - add each decision it leaves open for the owner to `inbox.md`;
   - mark its row `grilled <file>` in `plan.md`;
   - commit and push its writes, as [Workbench](#workbench) says;
   - report back, as [Report-back](#report-back) says.

   Then decide the split, file the issues and accept the briefs, as the guide
   says, and mark each filed draft as [Workbench](#workbench) says. A draft
   you set aside for later work stays in the plan directory, marked parked,
   and takes no row. To take over an owner's grill or
   prototype, continue in that session.
4. **New requirements.** Handle a Finding under the contribution guide's
   Findings section even when it lies outside the goal: first link an existing
   open issue reporting the finding; otherwise file it as that section says.
   Continue the plan without waiting for the finding's resolution.
   A requirement that arrives mid-plan takes one route:
   - **Row:** it serves the goal and passes the guide's inference test. Add it
     as a row, log it, and list it in the next plan update.
   - **Amendment:** it changes the goal or the scope. Propose the amendment;
     it applies once the owner approves it, recorded as a new approval line
     that supersedes the old one. When it changes which repositories' code
     the plan changes, propose their Close reviews with it.
   - **Wish:** it lies outside the goal and is not a Finding. Add it to
     `wishes.md`; it needs no issue merely because it is a wish.
5. **Close.** Once every row has ended, collect the plan's issue-creation
   records. Reconcile those records with every run's findings: PR findings
   comments and, for runs without PRs, the reporting locations the contribution
   guide prescribes. Include factory and directly launched workers, even when
   their findings are absent from the ticket table. Follow creation evidence
   from those reports to recover issues missing from the plan's `log.md`.
   Consolidate references by repository and issue number, then check current
   issue state. Distinguish newly plan-filed issues from pre-existing linked
   findings and unrelated concurrent work; retain the provenance links.
   Closed issues stay out of the still-open list. Outside findings need not be
   resolved for the plan to close.

   After reconciliation, record the open-issue counts at close. Then run each
   of the plan's Close reviews in its own session, as a launch:
   - **The retro.** Start a separate session that reads primary sources, such
     as the plan directory and the issues, pull requests, comments and run
     records it cites, and never your session's context or a summary of it.
     Select any covering installed skill under `AGENTS.md`'s delegation
     requirements. Its task context is the plan directory, the repository
     checkouts, the previous plan's `retro.md`, from the plan most recently
     moved under `Closed` in `index.md`, and the report-back destination,
     with these obligations:
     - write `retro.md` in the plan directory, with the outcome against the
       plan's Done means, with evidence; where the time went, attributing
       each wait to what it waited on, such as the owner, a review, a check,
       a blocker or a launch; and its lessons, ranked by cost;
     - compare each lesson with the previous plan's retro and the open issues
       before filing it;
     - route each lesson as below, recording its route and link in
       `retro.md`, and record each issue it files or reopens in `log.md` with
       its creation evidence;
     - mark the retro done on the Close reviews line in `plan.md`;
     - commit and push its writes, as [Workbench](#workbench) says;
     - report back, as [Report-back](#report-back) says.
   - **Other Close reviews.** Open each `improve-codebase-architecture` review
     with `/improve-codebase-architecture`, followed by its repository
     checkout, the plan's changes there, the plan directory and report-back
     destination. Supply the owned branch and checkout for domain-document
     edits and that repository's pull request destination, as for a grill.
     Like a grill, it asks the owner its questions in its own session.
     Its task context also includes these obligations:
     - route each of its findings as [New requirements](#lifecycle) says: a
       Finding becomes an issue in that repository, and any other idea a wish
       naming it;
     - write its result to the plan directory, citing those issues and wishes
       by link;
     - mark its review done on the Close reviews line in `plan.md`;
     - commit and push its writes, as [Workbench](#workbench) says;
     - report back, as [Report-back](#report-back) says.

   Each lesson goes to whoever owns the rule it concerns:
   - the adopter's own repository: an issue there, filed as that
     repository's contribution guide's Findings section says;
   - the owner's own setup, outside every repository: a chore for the owner,
     which you carry into `now.md`'s Waiting on you;
   - a Repo Canon skill or rule: an issue in the Repo Canon source repository
     that the adoption record's Selection names, such as
     `lutzseverino/repo-canon`, filed as its contribution guide's Findings
     section says, even when the owner does not develop Repo Canon, since an
     adopter cannot change its skills;
   - a wish: a line in `wishes.md`;
   - or nowhere, as a one-off, beyond `retro.md`.

   A recurring lesson links its earlier issue, or reopens it when closed,
   instead of filing a new one.

   Once every Close review is marked done, move the plan under `Closed` in
   `index.md`, and announce, as the last plan update:
   - what shipped and what was dropped;
   - the inferred-intent items and the wishes the plan added;
   - every issue the plan filed that is still open, each with its reason and
     evidence link;
   - the retro's lessons and the other Close reviews' findings, each with its
     route and link;
   - one suggested next direction, taken from the wishes and the parked items.

## Running the plan

- Process owner decisions in the [inbox sequence](#inboxmd) before other
  requests in the same message.
- One orchestrating session at a time owns every plan in the workbench. It
  hands over at each plan's close, and whenever it has compacted since it took
  over. To hand over, bring `index.md` and `now.md` up to date, commit and push
  the workbench, start a fresh session with `/orchestrate` and the workbench
  path where your harness can, and otherwise tell the owner the handover is
  ready. Then stop: `index.md` and `now.md` are the handover.
- A fresh session reads `index.md`, `now.md`, `inbox.md` and each active
  `plan.md`, and nothing else, not even a plan's `log.md`, before it acts. It
  then records its own session reference as each active plan's owner in
  `index.md`, marking the previous reference superseded, and takes over.
  Before anything else, it re-arms a wake-up for every row under `now.md`'s In
  flight that does not wait on the owner, as the [wait step](#the-wait-step)
  says.
- Give heavy reads, such as whole session transcripts, long logs and large
  diffs, to a subagent that returns what the step needs, or read a bounded
  tail. Select any covering installed skill under `AGENTS.md`'s delegation
  requirements; an uncovered read needs only its task context.
- Run at most three agent launches you started at once, or the cap `index.md`
  names for this host's hostname. To check the cap, count the rows under
  `now.md`'s Running launches for this host: every grill, triage run, research
  run, worker and Close review has one.
- Launch a ticket worker with `/implement`, followed by its issue, scope,
  repository checkout and report-back destination. Workers deliver as the
  contribution guide's Pull requests section says.
  When applicable installed rules assign a worker's merge to you, read its
  authoritative implementation contract and PR handoff, then resume `babysit`,
  including when resuming a plan. After an owner question is resolved, follow
  the applicable installed continuation rules to resume the worker or that same
  open PR.

### Progress observation

Observe unresolved filed work associated with the plan from filing, before
plan approval and before a PR exists: factory tickets, directly launched
workers and recorded blockers, plus the report-back of every running launch.
Keep that coverage when taking over or resuming a plan; refresh it as issues,
blockers and launches are recorded. You wake on events, through the wait step
below. A recurring check is optional: use the harness's recurring mechanism
alongside the wait step only if you choose to. Where the harness can neither
wait in the background nor deliver events, report that limit and re-read
these records at each turn.

Read issue state and labels, latest comments and owner answers, blocker state,
run progress and any PR. Compare with the previous dated observation in a
bounded tail of the plan's `log.md`. Record approval and blocker waits
separately from unexplained lack of progress, and keep each wait as a row under
`now.md`'s In flight. When an answered owner question has no observable
continuation, surface it with current state and issue/run/PR evidence links,
recording absent run or PR evidence explicitly. Route any intervention through
the contribution guide and applicable installed recovery rules. Observation
authorizes no execution and adds no stall timeout or recovery procedure.

#### The wait step

End a turn only when every row under `now.md`'s In flight waits on the owner
or has a wake-up armed through the harness's own event mechanisms. Its *Next
check* names that wake-up. Where the harness can neither wait in the
background nor deliver events, the fallback above applies instead.

Where the harness can run a command in the background and wake you when it
exits, arm a wake-up with this skill's wait script, in the background:

```sh
node <this skill's directory>/wait.mjs --interval <seconds> --max-duration <seconds> <item>...
```

- An item is an issue or pull request, as `<owner>/<name>#<number>` or its
  `https://github.com` link, or a file, as `file:<path>`. For a launch, watch
  its report-back file in the plan directory and the plan's `plan.md`, where it
  sets its done mark. A file item reads the workbench checkout the wait runs
  in, so a launch writing in another clone wakes it only once its push is
  pulled here; arm such a launch's wake-up on its tracker items or the
  harness's own events instead.
- It exits when any item changes: an issue's or pull request's state, labels,
  or new comments, an issue's linked pull requests, or a file's creation, edit
  or removal. It measures changes from when it starts, so arm it after your
  own writes to watched files and before you read the items' current state.
- `--interval` is the time between polls and `--max-duration` the longest the
  wait runs. Both are required; choose both for each invocation.
- It needs Node.js 24 or 26, and the GitHub CLI's current credential for
  issues and pull requests. It prints nothing while it waits.

Its exit code says what comes next:

- `0`: an item changed; each line names the item and how. Observe as
  [Progress observation](#progress-observation) says, then arm the wait again.
- `2`: the maximum duration passed with no change; arm the wait again.
- `1`: follow the contribution guide's Credentials section for a permission
  refusal; otherwise fix the invocation or platform error and arm it again.

## Report-back

The file in the plan directory is the contract. A grill, triage run or Close
review reports by writing its result there, setting its done mark in
`plan.md`, and committing and pushing both. When you take in a report-back, remove its launch's row from
`now.md`'s Running launches. A wake-up message to your session is only a nudge,
and losing it loses nothing: act on the files.

When your harness cannot send messages between sessions, re-read the active
plan directories at each turn, and the owner tells you when a grill is done.

## Reads

Repository paths are relative to each tracked repository's root, and
workbench paths to the workbench's.

- `CONTRIBUTING.md`: its Triage, Readiness, Comments, Findings and Pull
  requests sections. When it is missing, carry out this skill's method as
  written, and put each rule the method leaves to the guide in `inbox.md` as a
  decision for the owner.
- `AGENTS.md`: its Agent skills requirements for delegation and session
  naming. When it is missing, give each launch only its task context, and name
  each session for its operation and target where naming is supported.
- The workbench's `index.md`, `inbox.md`, `wishes.md` and `now.md`, and each
  plan's `<plan>/plan.md` and `<plan>/log.md`, its `retro.md` and its other
  Markdown files: the workbench, whose format this skill owns. When the
  workbench is missing, create it as [Workbench](#workbench) says, and create
  a plan's files when the plan starts.
- A tracked repository's Repository Standards adoption record: the Repo Canon
  source its Selection names, for the `workbench` profile offer and for
  lessons about a Repo Canon skill or rule. When it is missing, use the
  example source the steps give.
- The `babysit` skill: `wait.mjs` imports its GitHub CLI connection, and a
  worker's merge resumes it. When it is missing, the wait script cannot start:
  re-read the records at each turn, as
  [Progress observation](#progress-observation) says.
