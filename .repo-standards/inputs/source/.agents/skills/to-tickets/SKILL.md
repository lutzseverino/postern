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
before it can start. A real dependency, expand–contract order, a live-acceptance
ticket after its source ticket, and a ticket whose `Deletes:` line names a
surface ahead of every ticket that edits that surface each take an edge.
**Overlapping writes** take an edge only when both tickets will rewrite the
same authored passage or the same shared inventory: a list, table or registry
both edit. A shared file prompts that check and never serializes the tickets
on its own; tickets writing different passages of one file take no overlap
edge. The blocked ticket's **Blocked by** names the passage or inventory
behind an overlap edge. Keep dependencies cycle-free. A ticket with no
blockers uses the contribution guide's Readiness and installed
parent-readiness rules.

**Wide refactors are an exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. Every ticket's change merges into its base branch on its own, with its checks passing: when even the batches can't stay green alone, fold the batches that can't into one ticket.

**Deepening tickets are the other exception to vertical slicing.** A **deepening ticket** restructures code into a deeper module, in `codebase-design`'s vocabulary, and makes no new end-to-end behaviour work. Its **What to build** states the structural outcome, then `Behaviour changes: none` or each behaviour change listed, never a promise that behaviour is unchanged. It carries one acceptance criterion naming the type, parameter or function that must no longer exist. That criterion names the thing itself, never a line count or an inline block, which describe today's structure; when the thing is a durable surface, the ticket's `Deletes:` line names it too. Tests observing the deepened module's external interface keep passing without assertion changes, except where a listed behaviour change requires one; tests of the shallow modules it removes are replaced, as `codebase-design`'s replace-don't-layer testing strategy says. Several deepening tickets over one area order by the overlapping-writes rule above.

**Live evidence follows the contribution guide's Implementation contracts paragraph**, which says when it is a criterion of the **source ticket** and when it splits into a **live-acceptance ticket**. In that split case, block the live-acceptance ticket on the source ticket, make the recorded live evidence its acceptance criteria, and have the source pull request link it without a closing reference. Its live steps take the route the installed rules give work that needs host access.

**A cross-repository switch waits on its activation steps.** A ticket **switches** one side of a cross-repository break when its change, once merged, released or adopted, activates a protocol, configuration or workflow change that a deployed producer or consumer in another repository, or a host, cannot yet handle. Each **activation step** the switch needs, whether a release, an adopter update, a host step or the recovery path for a repository the switch deliberately pauses, is a ticket of its own, published in the repository that owns that step. Join the activation steps to the switching ticket with blocking edges: every activation step that must land before the switch blocks it, so the switching ticket stays behind them on the frontier, and an activation step that can only follow the switch, such as recovering a paused repository, is blocked by it. The split's evidence for independent review checks the activation steps against each intervening deployed state: who can still deliver each remaining activation step, the merge tooling on the destination repository's base, contracts and results that are already ready, and adopters' installed versions. A host-step ticket names the step and its outcome; host names, providers and access mechanisms stay in owner setup. A later change to the activation steps is an amendment under step 1's rule.

### 4. Prepare the split for independent review

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first, with each overlap edge's reason
- **What it delivers**: the end-to-end behaviour this ticket makes work, or a deepening ticket's structural outcome and behaviour changes

Attach evidence for granularity, real dependencies, independently mergeable
slices, test seams and any cross-repository switch's intervening deployed
states, and identify any factual verification the independent
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

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list. A deepening ticket states its structural outcome, then `Behaviour changes: none` or each change.

**Blocked by:** the numbers/titles of the tickets that gate this one, each overlap edge with the passage or inventory both rewrite, or "None (readiness still required)".

**Status:** state:triage

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation. A deepening ticket states its structural outcome, then `Behaviour changes: none` or each change.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, with the passage or inventory both rewrite for an overlap edge, or "None (readiness still required)".

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
- The `codebase-design` skill: the vocabulary a deepening ticket uses and its
  replace-don't-layer testing strategy. When it is missing, describe the
  deepened module in the codebase's own words.
- The `to-spec` skill: publish the single specification before a grill's
  tickets. If missing, report it and stop ticket publication until a
  specification exists.
