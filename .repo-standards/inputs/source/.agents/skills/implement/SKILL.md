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

Before delivery in a factory repository, read the installed `factory-workflow`
rules' Run kinds section and `.scriptorium/config.json`'s `runKinds`. When no
review run is configured, commit and push the work, write the PR body with
`pr`, open a ready pull request (or mark its existing draft ready), and invoke
`babysit` to deliver it under those rules, including any prescribed worker handoff.
Before reporting success, satisfy `CONTRIBUTING.md`'s Worker handoff condition
and include its head, trusted required-check authority, check-location, command
and outcome record.
That route retains babysit's applicable internal reviews and merge conditions.

Otherwise, for new work, commit and push the branch, write the body with `pr`,
and open one **draft** pull request as `CONTRIBUTING.md` directs. For review findings,
commit and push the fixes to the same pull request and leave it a draft;
before replying to findings, read the installed `comments` rules' Review-thread
replies section and answer there as it directs.
Before reporting success, satisfy `CONTRIBUTING.md`'s Worker handoff condition.
Report the pull request and its required head, trusted required-check authority,
check-location, command and outcome record, then stop. Leave review, marking ready,
babysitting and merging to the separate agent running `review`; do not run a
self-review.

<!-- Seam (deferred): Scriptorium configuration reads; consumers: 6; extraction proposed in https://github.com/lutzseverino/repo-canon/issues/967. -->

## Reads

Paths are relative to the repository root.

- `CONTRIBUTING.md`: branch, validation and pull request requirements. When
  it is missing, work on a branch dedicated to the change, run the available
  checks, and open a draft pull request with `pr` as above.
- `.repo-standards/rules/comments.md`: how to reply to review findings.
  When it is missing, follow the contribution guide's comment requirements;
  without either source, report the fixes in the handoff.
- `.repo-standards/rules/factory-workflow.md`: the factory's delivery route.
  When it is missing, use the draft handoff above.
- `.scriptorium/config.json`: the configured review run under `runKinds.review`.
  When it is missing in a factory repository, no review run is configured;
  follow the installed factory rules' delivery route.
- The `codebase-design` skill: the check applied above. When missing, report
  the gap through the contribution guide's Findings route, or in the handoff
  when the guide is missing; retain the recorded contract.
