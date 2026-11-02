---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
---

A prompt or brief naming this skill is its invocation.

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to a branch that holds only this work, made from the up-to-date base branch and never the base branch itself; the current branch serves when it already is such a branch. Deliver it as the repository's contribution guide directs, such as one pull request; without one, leave the commits on that branch.

## Reads

Paths are relative to the repository root.

- `CONTRIBUTING.md`: how the repository delivers work, such as one pull
  request. When it is missing, leave the commits on the work's branch.
