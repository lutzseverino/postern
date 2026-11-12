---
name: review
description: Review an implemented draft pull request as an agent that did not write it, fix small findings or hand it back, then mark it ready and babysit it to merge. Use when a draft PR waits on review, or when asked to review and land one.
---

A prompt or brief naming this skill is its invocation.

Take an implemented draft pull request to merge as its independent reviewer.
Run in a session that wrote none of the change; if you wrote any of it, stop
and say so, because the review needs a fresh agent. The
`github-repository-configuration` rules' Review of an implemented pull request
section holds what a review must do, and where installed, the
`factory-workflow` rules hold how an owner gate stops it; this skill supplies
the method. Each step that posts names the section of
`.repo-standards/rules/comments.md` to read before posting.

The review works in **rounds**, one reviewed head each. A round **holds**,
**hands back**, **fails** or goes to a **grill**, as those rules say.

`node <this skill's directory>/round.mjs <number>`, run from the repository
root, prints the PR's `head`, its `round`, whether that head is already
`reviewed`, whether the review `held`, whether it is a `draft`, the `issues` it
closes and every owner `gates` label on the PR or those issues. It counts
only the standing reviews of the account you run as, as the rules say: the
review held when that account's latest one is a holding review of the head.
Add `--issue <n>` for an issue the PR links without closing. It requires
Node.js 24 or 26 and uses the GitHub CLI's credential. Exit `1` is an
invocation or platform error, including more closing issues or labels than one
read holds: follow `CONTRIBUTING.md`'s Credentials section for a permission
refusal; otherwise fix the cause and run it again.

1. **Read the round.** Run `round.mjs`. When it reports `held yes`, delivery
   already started, as after a run stopped before step 5 finished, a later
   babysit round or a cleared gate: go to step 5. When it reports
   `reviewed yes` and `held no`, your round on this head left a finding open:
   stop and report that the head waits for the implementation or grill its
   review asked for. Otherwise read the authoritative implementation contract
   under `CONTRIBUTING.md`'s Implementation contracts section, the whole issue
   and its discussion, and every earlier round's review. A PR without an issue
   takes its decision-bearing body as its contract. Done when you hold the
   head, the round number, the contract and the issue.
2. **Review.** Check out the head in a checkout you own and run `code-review`
   with the merge-base of the PR's base branch as the fixed point and the
   contract as the spec.
   Apply `codebase-design`'s [Ownership check](../codebase-design/SKILL.md#ownership-check) through `code-review`'s Standards axis, judging against the recorded contract.
   Give its Spec axis this task context: also read the
   contract against the issue, and report where the contract contradicts,
   drops or invents what the issue and its recorded decisions ask, or leaves it
   ambiguous. A PR without an issue has no such check. Verify every finding
   against the source and drop those that do not hold. A defect outside the
   change's responsibility goes under `CONTRIBUTING.md`'s Findings section, not
   into this review. Sort each remaining finding as **contract**, **larger**
   or **small**, by the rules' section. Done when every finding from both axes
   is dropped with its reason or sorted.
3. **Fix small findings** when no contract or larger finding stands; otherwise
   fix nothing and carry every finding into the review. Commit the fixes to the
   PR branch, run the required checks the development guide names, and push.
   Run `round.mjs` again: its head is the head this round's review covers. Done
   when the diff from the reviewed head to that head holds only the fixes and
   the checks pass.
4. **Post the round's review**, after reading
   `.repo-standards/rules/comments.md#reviews`: the actual Standards and Spec
   outcomes, the fixes under `Fixed`, and each open finding under `Findings`
   with its file and line, all in its body, listing only the findings the
   rules count as open. Post it with `round.mjs <number> --post <file>`;
   exit `2` means the file is not a complete review of the current head, so
   correct it and post again; exit `3` means this head already has your
   review, so post none. Then:
   - The round **holds**: go to step 5.
   - A **larger** finding in round 1 **hands back**: leave the PR a draft and
     end the run, reporting the hand-back with the review's link, so `implement`
     can take it on the same PR.
   - A **larger** finding in a later round **fails**: leave the PR a draft and
     end the run, reporting that the rounds did not converge and why.
   - A **contract** finding: post the question a grill must settle as
     `.repo-standards/rules/comments.md#owner-questions` says, move the issue
     to `state:grill`, leave the PR a draft and stop under
     `CONTRIBUTING.md`'s owner-question handoff.
5. **Deliver.** Mark the PR ready with `round.mjs <number> --ready`; exit `2`
   means the review has not held, so return to step 1. Then run `babysit` on
   the PR, posting each internal review round it calls for with
   `round.mjs --post`, in the same shape as step 4. Before each of babysit's
   merge attempts, run `round.mjs` again. When it reports a gate, stop at
   ready-to-merge as the `factory-workflow` rules say: leave the PR open, move
   its issue, if it has one, to `state:owner`, and end the run, reporting the
   gate.

## Reads

Paths are relative to the repository root.

- `CONTRIBUTING.md`: the implementation contract, Findings, Credentials and
  owner-question handoff the steps name, and the development guide's required
  checks. When it is missing, take the issue body as the contract, run the
  checks the repository documents, and hand off to the owner in one PR comment
  for any rule the steps leave to the guide.
- `.repo-standards/rules/comments.md`: the installed comment rules, whose
  sections the steps name before each post. When it is missing, post each
  review in the shape `round.mjs` accepts and each question as one comment.
- The installed `github-repository-configuration` and `factory-workflow`
  rules, and those `babysit` names, which the `repository-standards` skill
  looks up. When the review section is missing, hold a round only with no open
  finding, hand back any other finding once and fail on a second round with
  one; without the factory rules, a gate stops delivery as step 5 says.
- The `code-review` skill, which runs both axes. When it is missing, review
  the diff since the merge-base against the repository's documented standards
  and against the contract yourself, keeping the two axes apart.
- The `babysit` skill, which delivers the PR: `round.mjs` imports its GitHub
  CLI connection and its review shape. When it is missing, `round.mjs` cannot
  start: stop and report that this skill needs it.
- The `implement` skill, which takes a hand-back on the same PR. When it is
  missing, report the hand-back with the review's link and stop.
- The `codebase-design` skill: the check used through Standards above. When
  missing, report the gap through the contribution guide's Findings route, or
  in the handoff without the guide; retain the recorded contract as the baseline.
