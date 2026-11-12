# Writing Agent Briefs

An agent brief is the implementation contract accepted before `state:ready`.
Read the validator's source/mode first: prepared mode publishes a brief comment;
after explicit body-mode activation, new/revised briefs replace the issue body.
Only an exact unchanged inventoried legacy comment remains authoritative until
its next revision. Readiness follows independent acceptance, as
[SKILL.md](SKILL.md) describes. Never pick a competing comment after migration.

In body mode, preserve the reporter's request verbatim once under
`## Original request` at the end, after the brief and triage notes. On first
conversion capture the original before replacing intake; reuse a correctly
preserved original on later revisions. Never nest a previous brief/body or
invent missing text. Missing or ambiguous original input blocks publication
and readiness. Progress and questions remain comments. The host captures
intake author/run-writer proof independently before body replacement.

The brief states **what the agent should do**, which stretches to both surfaces: for an issue, that's building the change from nothing; for a PR, it's what's left to do _to the existing diff_: finish it, close gaps, address review points. Same principles either way; the PR example below shows the difference.

## Principles

### Available inputs

A brief's required implementation material must be in the repository, the issue and its comments, or public URLs. A host-only path cannot be the sole required source. Before readiness, check host material for secrets and post the non-secret material on the issue, quoted or attached, then cite it from the brief. Copy every relied-on decision into the repository-facing record with its date and quoted words, even when this duplicates a private record. Never cite or require the private workbench: no URL, host path or instruction to consult it, including for provenance. Repository records may cite one another. Independent acceptance review rejects a private-workbench reference as a substitute for copied decision content and verifies input availability along with the brief's other requirements.

### Durability over precision

Describe interfaces, types, function signatures, config shapes and behavioral
contracts that survive renames, moves and refactors while the issue waits in
`state:ready`. Omit file paths, line numbers and assumptions about the current structure.

### Behavioral, not procedural

Describe **what** the system should do, not **how** to implement it. The agent will explore the codebase fresh and make its own implementation decisions.

- **Good:** "`SkillConfig` accepts an optional `schedule: CronExpression`"; "`/triage` without arguments shows issues needing attention."
- **Bad:** "Add the field in src/types/skill.ts at line 42"; "Add a switch statement in the main handler."

### Complete acceptance criteria

Every brief needs concrete, testable, independently verifiable criteria, such
as "`gh issue list --label state:triage` returns classified issues", not "Triage works correctly."

### Progress stays out of the brief

After readiness, nobody edits the brief to record progress, ticking its acceptance criteria included: editing it removes its readiness. Progress lives in linked pull requests, sub-issue states and comments, and the issue closes when its own acceptance criteria hold.

### Live acceptance gets its own ticket

When work must be shown on a live system, write two briefs. The source ticket's brief covers the change, and its issue closes when the pull request merges. The live-acceptance ticket's brief, blocked by the source ticket, has acceptance criteria that are the recorded evidence that the deployed change behaves on the live system as its contract says. A merge never closes the live-acceptance ticket: the source pull request links it without a closing reference, and it closes only once that evidence is recorded on it. Its readiness follows the installed rules for work whose live steps need host access.

### Explicit scope boundaries

State what is out of scope. This prevents the agent from gold-plating or making assumptions about adjacent features.

### Seams

After Out of scope, the writer supplies **Seams** using
`codebase-design`'s [Ownership check](../codebase-design/SKILL.md#ownership-check):
`No trigger`, or the triggered read and selected default or accepted override.
Independent brief review assesses the claim's honesty, Value owner, consumers,
reversibility and cost read. Structural validation checks only that the field
has non-placeholder content.

### Decisions, not options

The implementing agent can't ask the owner anything, so a brief settles every question of intent before it is accepted. State each owner decision as behavior. A brief that needs one of these is not finished; its question is routed as [SKILL.md](SKILL.md) says, to be inferred under the inference test or answered by the owner:

- **Bad:** "Retry for a reasonable period (agent's choice)"
- **Bad:** "Either drop the row or fail the export"
- **Bad:** "Fall back to 60 minutes when no window is configured", when nobody chose 60 minutes
- **Bad:** "Open question: should admins be exempt?"
- **Good:** "Retry for 30 minutes after the first failure, then mark the Parcel failed", with the owner's dated, quoted decision in the triage notes

When the owner has reserved review before merge, state that designation as contract behavior and retain its dated decision source in the triage notes for the worker's PR handoff. Use the recorded reservation, not a routing label, as its source. Follow the `github-repository-configuration` rules' Designated owner review gate in both profiles; applicable installed rules retain merge ownership and continuation.

Implementation choices that don't change what users or operators see stay with the agent; leave them out.

## Triage notes

The triage notes that accompany a brief follow it in the selected body or eligible legacy comment, never between the disclaimer and the `## Agent Brief` heading. Fact-finding and owner decisions posted before the brief exists are separate triage notes comments. A brief's notes cover:

- **Path**: code-bound or intent-bound, with a one-line reason.
- **Verification**: what was checked and how (reproduction, code path, tests run), and where the redundancy search looked.
- **Owner decisions**: each decision the brief relies on, including any owner-review reservation, with its date and quoted words; for a grill's brief, copied from the grill record. Cite a repository record when available, never the private workbench.
- **Inferred intent**: each answer inferred under the inference test, which the brief states as behavior, with its date, quoted decision content and repository citation when available; copy private-source content without referencing the private record. In the factory's triage run, it cites a repository record, as the installed factory workflow rules' Triage run section says.
- **Dependencies**: issues that must land first, for the reviewer to record as blockers.
- **Model**: when the installed rules ask for it, one `model:` label and the one-line reason their Model selection rule requires: a suggestion for the reviewer to apply or replace, or, in the factory's triage run, the label its run result asks for.
- **Owner questions**: none, for a brief ready for review.

## Template

```markdown
## Agent Brief

**Category:** bug / enhancement
**Summary:** one-line description of what needs to happen

**Current behavior:**
Describe what happens now. For bugs, this is the broken behavior.
For enhancements, this is the status quo the feature builds on.

**Desired behavior:**
Describe what should happen after the agent's work is complete.
Be specific about edge cases and error conditions.

**Key interfaces:**

- `TypeName`: what needs to change and why
- `functionName()` return type: what it currently returns vs what it should return
- Config shape: any new configuration options needed

**Acceptance criteria:**

- [ ] Specific, testable criterion 1
- [ ] Specific, testable criterion 2

**Out of scope:**

- Thing that should NOT be changed or addressed in this issue

**Seams:**
Record the Ownership check's result.
```

## Examples

### Good agent brief (bug)

```markdown
## Agent Brief

**Category:** bug
**Summary:** Skill description truncation drops mid-word, producing broken output

**Current behavior:** Descriptions exceeding 1024 characters truncate mid-word at 1024.

**Desired behavior:** Break at the last word boundary before 1024 characters and append "...".

**Key interfaces:**

- `SkillMetadata.description`: keep its type; populate it at word boundaries
- Functions reading SKILL.md frontmatter to extract the description

**Acceptance criteria:**

- [ ] Under 1024 chars: unchanged
- [ ] Over 1024 chars: truncate at the last word boundary before the limit
- [ ] Truncated output ends with "..."; total length is at most 1024 chars

**Out of scope:**

- Changing the limit or supporting multi-line descriptions

**Seams:** No trigger
```

### Good agent brief (enhancement)

```markdown
## Agent Brief

**Category:** enhancement
**Summary:** Record rejected feature requests in `.out-of-scope/`

**Current behavior:**
Rejections close with `wontfix` and a comment, with no persistent decision or
reasoning record; later requests require recalling or searching discussion.

**Desired behavior:**
Record rejected features in `.out-of-scope/<concept>.md`, including the decision,
reasoning and all requesting issue links. Check for matches during triage.

**Key interfaces:**

- Each record: `# Concept Name`, `**Decision:**`, `**Reason:**`, and a
  `**Prior requests:**` issue-link list
- Triage: read all `.out-of-scope/*.md` early; match by concept similarity

**Acceptance criteria:**

- [ ] Closing a feature as wontfix creates/updates its record with the decision,
      reasoning and closed-issue link
- [ ] Matching records gain a Prior requests link rather than a duplicate file
- [ ] Triage checks records and surfaces matching prior rejections

**Out of scope:**

- Automated matching: a human confirms each match
- Reopening rejections or recording bugs (only enhancements belong here)

**Seams:** A new decision record triggers the Ownership check. The repository
owns its rejected-feature decisions; triage and maintainers consume them.
The Markdown record is reversible, cost now S and carrying cost S. Choose the
cheapest local record; defer a shared record interface until another consumer.
```

### Good agent brief (PR)

For a PR, "Current behavior" describes the state of the diff, and the brief asks the agent to finish or fix it rather than build from scratch.

```markdown
## Agent Brief

**Category:** enhancement
**Summary:** Finish the contributor's `--json` output flag for `triage list`

**Current behavior:** The PR's `--json` flag serializes the list, fits the command structure and works
on success, but errors remain human text and the flag lacks tests.

**Desired behavior:** With `--json`, all output including errors is valid JSON on stdout. Preserve
exit codes and the existing human-readable output without the flag.

**Key interfaces:**

- Error path: emit `{ "error": string }` under `--json`
- Reuse the PR's serializer

**Acceptance criteria:**

- [ ] `triage list --json` emits valid JSON for both success and error cases
- [ ] Exit codes match the non-JSON command
- [ ] A test covers the `--json` success output and one error case
- [ ] Default (non-JSON) output is byte-for-byte unchanged

**Out of scope:** Other commands or changes to the PR's success JSON shape

**Seams:** No trigger
```

### Bad agent brief

```markdown
## Agent Brief

**Summary:** Fix the triage bug

**What to do:** The triage thing is broken. Fix the function around line 150.

**Files to change:** src/triage/handler.ts (line 150)
```

This lacks a category, concrete current/desired behavior, acceptance criteria
and scope boundaries; its vague task and stale-prone paths/lines are not a contract.
