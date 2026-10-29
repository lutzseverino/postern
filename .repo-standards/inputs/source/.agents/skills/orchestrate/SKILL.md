---
name: orchestrate
description: Turn the owner's feature or problem into an approved plan across tickets, keep its state in the workbench, and run it to an announced close.
disable-model-invocation: true
---

# Orchestrate

You are the orchestrating agent. Turn the owner's feature or problem into a
plan they approve, with a definite goal; keep the plan's state in the
workbench; and run the plan to an announced close.

Each repository's contribution guide, `CONTRIBUTING.md`, decides triage,
readiness, question routing and delivery for its work: its Triage, Readiness,
Comments, Findings and Pull requests sections. This skill is how to carry
those rules across a plan. The installed `triage` skill is how to triage one
request.

Use the capabilities available in your session to carry out the steps. An
application may enhance orchestration; the shared method works without it.
Keep application-specific tool mappings in the owner's own setup outside
Repo Canon.

## Workbench

The workbench is a git repository of plain Markdown holding the state of every
plan you own. Your global agent instructions name its path. When they name
none, ask the owner for it before you propose a plan.

Commit each workbench change straight to its default branch, and push it when
the workbench has a remote.

```text
index.md     the active plans, each with its owning session reference, and launch caps
inbox.md     the decision inbox
wishes.md    one line per wish
<plan>/      one directory per plan
  plan.md    the plan
  *.md       its grill decisions and draft briefs
```

The workbench is a wiki:

- Date every entry.
- Cite each source, such as an issue, pull request, comment or session, by its
  link or reference, and leave its content where it is.
- Leave a superseded entry's text as written: mark it superseded, dated, and
  point to the entry that replaces it.

A session reference is the opaque identifier your harness gives a session,
recorded as given.

### `index.md`

One line per active plan: its directory, its goal in a few words, and the
reference of the session that owns it. When a plan closes, move its line under
a `Closed` heading, dated. A `Launch caps` list names a host by its hostname and
the most agent launches you may run at once on it.

### `inbox.md`

The decision inbox the contribution guide names: one entry per decision open
for the owner, across plans. Each entry holds the question, its plan, a link
to its source, the date it opened, and your recommendation.
Grills and triage runs add entries too. When the owner answers, move the entry
to its plan's log, with the date, the answer, and where the owner gave it.

### `wishes.md`

One line per wish: the date, the owner's quoted words or idea, a link
to its source, and the repository it concerns.

A wish may link a filed finding for future planning. A wish never replaces
the finding's tracker record or reporting links.

## The plan

`plan.md` takes this shape:

```markdown
# <Plan title>

**Goal:** <the outcome the plan delivers>
**Done means:** <the observable state that ends it>
**Approval:** <date>, <link to the owner's approval>. Preapproves: <what the plan names that the approval covers>

## Tickets

| Item | Repository | Issue | State |
| ---- | ---------- | ----- | ----- |

## Open issues

| Repository | At start | At close |
| ---------- | -------- | -------- |

## Log

- <timestamp> <entry>
```

- **Tickets.** Every row ends with a closed issue in its Issue column or
  `dropped (owner)` in its State; the plan closes only then. A row stays for
  the life of the plan: a split adds rows, a merge points several rows at one
  issue, and only the owner drops one. State holds the row's latest step, such
  as `grill <session reference>`, `grilled <file>`, `triaged <file>`, `filed`,
  `ready`, or a pull request link. `grilled <file>` and `triaged <file>` are
  the done marks a grill and a triage run set.
- **Open issues.** Count each repository's open issues when the plan starts and
  again at close. Report the counts; they set no limit.
- **Log.** Take every timestamp from the clock, in UTC, with
  `date -u +%Y-%m-%dT%H:%MZ`, never by hand.

A **plan update** is any report to the owner about a plan, the proposal
included. Each one lists the inferred-intent items the owner has not yet seen,
with their citations, and shows the decision inbox. Log the items it showed.

## Lifecycle

1. **Propose.** Present the goal, Done means and ticket table to the owner for
   approval, as a plan update. On approval, write the approval line, with what
   the approval preapproves, record the open-issue counts at start, and add
   the plan to `index.md`.
2. **Intake.** Route each new request as the contribution guide's Triage
   section says, with the `triage` skill's method. Put your own ideas into the
   issue you file under a `Suggestions (not decisions)` heading. Give each
   triage run what the `triage` skill gives a research run, the plan directory,
   and this task:
   - write its result to the plan directory, citing the brief or findings it
     posted by link;
   - add each decision it leaves open for the owner to `inbox.md`;
   - mark its row `triaged <file>` in `plan.md`;
   - commit and push its writes, as [Workbench](#workbench) says;
   - report back, as [Report-back](#report-back) says.
3. **Grill.** When the guide's inference test cannot settle an intent
   question, open a grill with the owner in its own session, and record the
   session's reference in the row's State. Give it what the `triage` skill
   gives a grill, the plan directory, and this task:
   - write the owner's decisions and the draft briefs to the plan directory;
   - add each decision it leaves open for the owner to `inbox.md`;
   - mark its row `grilled <file>` in `plan.md`;
   - commit and push its writes, as [Workbench](#workbench) says;
   - report back, as [Report-back](#report-back) says.

   Then decide the split, file the issues and accept the briefs, as the guide
   says. A draft you set aside for later work stays in the plan directory,
   marked parked, and takes no row. To take over an owner's grill or
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
     that supersedes the old one.
   - **Wish:** it lies outside the goal and is not a Finding. Add it to
     `wishes.md`; it needs no issue merely because it is a wish.
5. **Close.** Once every row has ended, record the open-issue counts at close,
   move the plan under `Closed` in `index.md`, and announce, as the last plan
   update:
   - what shipped and what was dropped;
   - the inferred-intent items and the wishes the plan added;
   - every issue the plan filed that is still open, each with its reason;
   - one suggested next direction, taken from the wishes and the parked items.

## Running the plan

- One long-lived orchestrating agent owns every plan in the workbench. A fresh
  session reads `index.md`, `inbox.md` and the active plans, and nothing else,
  before it acts. It then records its own session reference as each active
  plan's owner in `index.md`, marking the previous reference superseded.
- Give heavy reads, such as whole session transcripts, long logs and large
  diffs, to a subagent that returns what the step needs, or read a bounded
  tail.
- Run at most three agent launches you started at once, or the cap `index.md`
  names for this host's hostname. Count every grill, triage run, research run
  and worker.
- Workers deliver as the contribution guide's Pull requests section says.
  When applicable installed rules assign a worker's merge to you, read its
  accepted brief and PR handoff, then resume `babysit`, including when resuming
  a plan. After an owner question is resolved, follow the applicable installed
  continuation rules to resume the worker or that same open PR.

## Report-back

The file in the plan directory is the contract. A grill or triage run reports
by writing its result there, setting its done mark in `plan.md`, and
committing and pushing both. A wake-up message to your session is only a
nudge, and losing it loses nothing: act on the files.

When your harness cannot send messages between sessions, re-read the active
plan directories at each turn, and the owner tells you when a grill is done.
