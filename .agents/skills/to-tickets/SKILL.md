---
name: to-tickets
description: Break a specification into independently mergeable tickets, publish them in their responsible repositories with native parent and blocking links, and return the split for independent review.
disable-model-invocation: true
---

A prompt or brief naming this skill is its invocation.

# To Tickets

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

The issue tracker and triage label vocabulary should have been provided to you.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

For a grill, consume the single specification published by `to-spec`; if it
does not exist yet, invoke `to-spec` first. Keep that specification as the
parent across repositories. Copy relied-on decisions with their dates and
quoted words into every ticket contract, so private records are unnecessary.
For an amendment, first apply the contribution guide's Triage amendment rule
and consume the revised specification; work only the delta, revising affected
contracts and native relationships.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete
before it can start. Keep dependencies cycle-free. A ticket with no blockers
uses the contribution guide's Readiness and installed parent-readiness rules.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. Every ticket's change merges into its base branch on its own, with its checks passing: when even the batches can't stay green alone, fold the batches that can't into one ticket.

**Live acceptance is a ticket of its own.** When work must be shown on a live system, split it into a **source ticket**, which closes when its pull request merges, and a **live-acceptance ticket**, blocked by the source ticket, whose acceptance criteria are the recorded evidence that the deployed change behaves on the live system as its contract says. A merge never closes it: the source ticket's pull request links it without a closing reference, and it closes only once that evidence is recorded on it. Its live steps take the route the installed rules give work that needs host access.

### 4. Prepare the split for independent review

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Attach evidence for granularity, real dependencies, independently mergeable
slices and test seams, and identify any factual verification the independent
reviewer must finish. Reuse recorded answers and plan approval. Read and apply
the contribution guide's Triage inference test, inferred-list and
owner-question rules to unanswered choices.

Return the proposed split and evidence for the orchestrating agent's decision
and independent acceptance under the guide's Triage rules. Use its correction
and fact-finding routes for feedback rather than an owner breakdown quiz.

### 5. Publish the tickets to the configured tracker

Publish the proposed tickets awaiting review. **How** depends on the configured
tracker; the tickets are the same either way, only the shape of the blocking
edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below: one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in its responsible repository, in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Link each ticket to the one specification parent and its blockers with the platform's native sub-issue and blocking relationships: the "Parent" and "Blocked by" sections restate those links for the reader and never stand in for them. If a native link can't be created, stop publication progression and report the exact missing parent/blocker relationship and platform failure. A text-only edge is never reported as established. Before publishing, read `.repo-standards/rules/comments.md#disclaimers`.

Use the guide's direct-body-contract publication route. Return the proposed
split, exact published contracts and established native links to the
orchestrating agent for acceptance under the guide's Triage and Readiness
sections and the installed parent-readiness rules, including after amendments.

Once reviewed, work the **frontier**: any ready ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Once a ticket is ready, nobody edits it to record progress, ticking its acceptance criteria included: progress lives in linked pull requests, sub-issue states and comments. A ticket closes when its own acceptance criteria hold.

Keep the parent open. Modify its contract only for an authorized amendment;
publication progress belongs in comments and native sub-issue states.

<local-ticket-template>

# <NN>: <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None (readiness still required)".

**Status:** state:triage

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None (readiness still required)".

</issue-template>

In either form, avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Reads

Paths are relative to the repository root.

- `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`: the
  configured tracker and its triage label vocabulary. When the tracker config
  is missing and no tracker was provided, ask the user whether to publish to
  local files or a real tracker; when the label config is missing, use the
  canonical role names as the label strings.
- `.repo-standards/rules/comments.md`: the installed comment rules, whose
  section the posting steps name. When it is missing, post issue bodies and
  comments as the steps describe.
- `GLOSSARY.md` and the ADRs in `docs/adr/`: the domain vocabulary and
  decisions to respect. When either is missing, use the codebase's own words.
- The installed rules, such as the `github-repository-configuration` rules,
  which the `repository-standards` skill looks up: the companion labels
  readiness needs, and the route for work that needs host access. When they
  are missing, readiness carries no companion labels, and a live-acceptance
  ticket takes no route of its own.
- `.scratch/`: the local-files tracker's tickets. When it is missing, create
  it as step 5 says.
- `CONTRIBUTING.md`: inference, split authority, amendments and readiness. If
  missing, use `grilling`'s missing-guide fallback and independent exact-revision review, and
  ask the user only for unresolved owner choices.
- The `grilling` skill: the inference fallback, only when the contribution
  guide is missing. If also missing, report it and stop for the missing policy.
- The `to-spec` skill: publish the single specification before a grill's
  tickets. If missing, report it and stop ticket publication until a
  specification exists.
