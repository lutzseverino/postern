---
name: implement
description: "Implement a spec or ticket, or address review findings on its existing pull request."
---

A prompt or brief naming this skill is its invocation.

Before editing, read `CONTRIBUTING.md` for the repository's branch and
validation requirements. Implement the work described in the spec or tickets.
When the input is review findings on an existing pull request, read the
findings and continue on that pull request's branch.

Apply `codebase-design`'s [Ownership check](../codebase-design/SKILL.md#ownership-check) to the change, including its contract-disagreement route.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the repository's
required validation on the final commit.

Before factory delivery, read the installed `factory-workflow` rules' Run kinds
section to determine the configured route. When no
review run is configured, commit and push the work, write the PR body with
`pr`, open a ready pull request (or mark its existing draft ready), and invoke
`babysit` to deliver it under those rules, including any prescribed worker handoff.
Before reporting success, satisfy `CONTRIBUTING.md`'s Worker handoff condition
and report as below. Retain babysit's internal reviews and merge gates.

Otherwise, for new work, commit and push the branch, write the body with `pr`,
and open one **draft** pull request as `CONTRIBUTING.md` directs. For review findings,
commit and push the fixes to the same pull request and leave it a draft;
before replying to findings, read the installed `comments` rules' Review-thread
replies section and answer there as it directs.
Before reporting success on this separate-review route, satisfy `CONTRIBUTING.md`'s
Worker handoff condition, applying the factory rules'
[environment-performed step rule](../../../.repo-standards/rules/factory-workflow.md#run-kinds)
to its passing-checks condition. Report as below, then stop. Leave review, marking
ready, babysitting and merging to the separate `review` agent; do not self-review.

On both routes, the worker handoff is the PR body's `### Delivery` subsection
that `.repo-standards/rules/comments.md#delivery-records` describes. Write it
when opening the PR and update it after every push and once that head's
required checks finish; post no delivery-record comment. A body edit reruns
checks that read the body, so confirm the required checks after the last edit.
Report one lead line naming the PR and its check state, such as
`✅ **Draft PR #N** · checks green on <short SHA>` or
`❌ **Draft PR #N** · Test failed on <short SHA>`, with at most a few lines
after it; the Delivery subsection holds the record. A factory run's result body
is this report.

## Reads

Paths are relative to the repository root.

- `CONTRIBUTING.md`: branch, validation and pull request requirements. When
  it is missing, work on a branch dedicated to the change, run the available
  checks, and open a draft pull request with `pr` as above.
- `.repo-standards/rules/comments.md`: the Delivery subsection and how to
  reply to review findings. When it is missing, follow the contribution guide's
  comment requirements; without either source, keep the handoff in the PR
  body's Evidence section and report the fixes there.
- `.repo-standards/rules/factory-workflow.md`: delivery and environment-performed steps.
  When it is missing, use the draft handoff above.
- The `codebase-design` skill: the check applied above. When missing, report
  the gap through the contribution guide's Findings route, or in the handoff
  when the guide is missing; retain the recorded contract.
