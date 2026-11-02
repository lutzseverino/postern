---
name: babysit
description: Babysit an opened pull request through checks and review to merge or its prescribed handoff. Use right after opening a pull request, or when asked to babysit or land one.
---

A prompt or brief naming this skill is its invocation.

Take the pull request through its authorized delivery. `CONTRIBUTING.md` and the
`github-repository-configuration` rules hold the merge conditions and the
wording rules.

Before requesting or waiting, establish your delivery role from
`CONTRIBUTING.md`'s Merging section and applicable installed rules. If they
prescribe a worker handoff, record it on the open PR and stop. The designated
merging agent resumes here from the handoff, carrying its review requirements
and outstanding findings into the steps below.
On resuming a PR paused for an owner question, follow the installed continuation
rules before returning to the request and wait steps.
When installed rules authorize delivery of a stopped run's open PR, enter
Branch-update recovery before the request and wait steps. This consumes the
invocation's one recovery attempt. Carry the handoff's context and follow those
rules for retaining its waiting marker and recording the merge outcome.

The bundled scripts require Node.js 24 or 26. The request and wait read the optional
`.github/pull-request-reviewer.json`, whose schema the
`github-repository-configuration` rules state; without the file, it reports
only checks unless the app-author policy identifies an external review skip.
Both commands read the optional `.github/factory-review-policy.json` under
the same rules' trusted review configuration: they resolve the destination's
default-branch commit once and read both files from that SHA. The wait keeps
that snapshot across polls; its final outcome identifies the repository and
revision, as does the request's. Proposed configuration changes begin applying
after merging to that default branch. Invalid trusted declarations, including
a plain human-login policy author, require an owner handoff (exit `7`, below).
Policy absence keeps configured reviewer behavior and requires no owner question.

Before the first wait, apply the `github-repository-configuration` rules'
review request rule to the pull request's head, using step 4 to post any
required request. Use `node <this skill's directory>/request.mjs <number>`
from the repository root to apply the app-author policy before that rule.
It posts a required request or reports why none is needed. Exit `0` means
the rule was applied, not that a review occurred; exits `1` and `7` follow the
same error and owner-handoff handling as the wait below. Run it again before
waiting on a later or resumed head; add `--fixes-review` when that head fixes a finding
requiring a new request under the rules.

The request command also checks the PR body's own-head file links before any
request or reviewer-policy skip. Exit `8` lists links to replace with commit-SHA
links; correct the body and rerun request before waiting. It never rewrites the
body. External repositories and other branches are outside this check.

When a potentially offending link needs an adoption-summary exemption, the
command rebuilds the pre-commit state in a temporary detached worktree outside
the author's checkout at `merge-base(<PR base commit>, <head>)`. It restores the
exact head tree with `git restore --source=<head> --worktree :/`, runs
`npm ci --ignore-scripts --prefix .repo-standards/runtime` there, then runs the
head's pinned `.repo-standards/runtime/node_modules/.bin/repo-standards status --summary`.
It removes the temporary worktree on success and failure. Only a complete,
byte-exact leading match of that stdout is exempt, including its final newline
and generated Impact and Migration. Every appended section is checked. Missing
local commits or runtime, failed reconstruction/install/generation, and a
mismatching prefix grant no exemption: the diagnostic explains why the whole
body was checked. Link-free bodies need no reconstruction.

1. Wait with `node <this skill's directory>/wait.mjs <number>`, run in the
   repository root in the foreground until it exits; it waits for the checks
   and the configured reviewer's review of the head, silently. Use a command
   timeout of 600000 ms where supported, and ask for the longest wait each
   time the command yields. The exit code
   says what comes next. Here, "checks passed" also covers a head with no
   check that the `github-repository-configuration` rules count as passed:
   - `0`: checks passed and the configured reviewer reviewed, or no reviewer is configured; go to step 2.
   - `2`: the listed checks failed; go to step 2.
   - `3` or `4`: checks passed and the configured reviewer did not review this head (`3`
     unavailable, `4` for the reason its line gives); go to step 2 and follow
     the `github-repository-configuration` rules for merging without that
     review.
   - `5`: still waiting; run it again.
   - `6`: checks passed and external review was skipped by app-author policy;
     go to step 2. After completing both internal reviews, replace both outcome
     placeholders in the printed full-head template and post it as a PR comment
     under the rules' policy-skip merge outcome requirements. The unfilled
     template is not completed review evidence.
   - `7`: invalid trusted review configuration. Record an owner question under
     the contribution guide's Comments rules, identifying the destination
     repository, selected revision, affected declaration and validation problem
     from the diagnostic, and the correction needed. Follow applicable installed
     continuation rules, leave the PR open and stop babysitting. This outcome
     permits neither an unchanged-configuration retry nor a merge.
   - `1`: follow `CONTRIBUTING.md`'s Credentials section for a
     permission refusal; otherwise fix the invocation or other platform error and
     run it again.

2. Verify each failing check and review finding against the source, including
   findings that arrive on a policy-skipped pull request. Follow the
   `github-repository-configuration` rules for applicable internal Standards and
   Spec reviews and their merge record.
3. Fix the real findings `CONTRIBUTING.md` does not let you decline, and answer
   every review thread as it requires, following its Comments section.
4. Apply the review request rule to each new head after a fix push. When it
   requires a request, post the review request comment as the
   `github-repository-configuration` rules describe, using `request.mjs` as above
   so the app-author policy takes precedence. After any push or
   re-request, return to step 1.
5. Before each merge attempt, verify merge ownership and any required owner
   approval against the current head under the applicable installed rules.
   Read the authoritative implementation contract and any worker handoff and
   apply the `github-repository-configuration` rules' Designated owner review gate.
   Read the PR comments carrying designation provenance and current-head approval,
   and record approval there under that gate.
   When required approval is missing, use the contribution guide's
   owner-question handoff and stop with the PR unmerged. Once the merge
   conditions hold on the latest head, run
   `node <this skill's directory>/merge.mjs <number> <SHA>`, where `<SHA>` is
   the full SHA that starts the wait's latest line. Exit `0` means merged;
   `2` means the head changed, so return to step 1; `3` means it did not merge
   and needs the owner, so hand off with a question under
   `CONTRIBUTING.md`'s Comments section, without retrying the merge;
   `4` means the base is stale: follow Branch-update recovery only if its one
   attempt is unused; otherwise record the owner handoff and stop;
   `5` means the current-head policy-skip outcome comment is missing or incomplete:
   complete both internal reviews, post their actual outcomes using the wait's
   template for that full head, then rerun the merge after verifying the other
   merge conditions. This is a post-and-rerun result, not an owner handoff;
   `9` means another open PR carries the configured release-hold label: leave
   this PR open and do not retry yet. In a factory run, end the run; the factory
   relaunches merging after the hold ends. Otherwise, run merge again after
   the hold ends. This is not an owner handoff;
   `1` means follow
   `CONTRIBUTING.md`'s Credentials section for a permission refusal;
   otherwise fix the invocation or other platform error and
   run it again. On exit `0`, record any merge outcome comment the installed rules
   require, using the delivered head, validation and review results, and merge
   commit SHA printed by the command.
6. Stop.

The merge command independently resolves trusted review configuration and checks
the platform PR author on every invocation, even without a prior wait. Invalid
trusted declarations require its owner-handoff exit `3`; unreadable review
configuration returns `1` and permits no merge. A prior wait result and proposed
PR-branch policy cannot bypass the outcome check.
Immediately before its merge write, it reads `labels.releaseHold` from
`.factory/config.json` at that same destination default-branch snapshot and
lists open PRs carrying the label, excluding the PR being merged. An absent
file or key adds no hold. Unreadable or invalid configuration or PR reads
permit no merge write and follow the freshness-read failure handling.

## Branch-update recovery

The merge command confirms GitHub's required-check freshness before merging;
unavailable, unreadable or unconfirmed enforcement requires the owner handoff,
even when remote setup was deferred. It never substitutes local ancestry for
GitHub's final guard. Exit `4` reports a stale base, separately from a changed
PR head or an owner-only failure; no merge succeeded.

Allow one branch-update recovery per babysit invocation. Preserve committed,
staged, unstaged and untracked work and the PR's review and handoff context
before changing history. Fetch origin, resolve its remote default branch again,
and inspect outgoing history (including each merge parent) and the whole diff.
Rebase or replay only this PR's work onto the refreshed base; keep unrelated
work preserved separately. Never merge the default branch into the PR branch.
Never use GitHub update-branch. Uncertain ownership or reconstruction conflicts
require the owner handoff. For an authorized stopped-run handoff, any failed
recovery step requires the owner handoff with its failure reason.

Validate the integrated change with the repository's required local checks;
wait for their final successful status before pushing with an explicit lease
when history changed. Before the delivery push, refresh origin and its default
branch again and inspect both `git log --stat --patch -m origin/HEAD..HEAD`
and `git diff origin/HEAD...HEAD`. Revalidate after any further reconstruction.
A permission refusal ends recovery under Credentials, without another push.

For the replacement head, repeat applicable internal reviews and owner approval,
then run request and wait again from step 1, applying the trusted app-author
policy anew. Pending or failed checks on that head permit no merge; checks from
the old head never qualify it. Re-establish merge ownership before step 5.
If another merge attempt reports stale base, record the owner handoff and stop;
this is not an unbounded update/retry loop. For several waiting PRs, finish each
delivery before starting the next and refresh its base independently.

For exit `7` from either command, follow correction and authorized continuation
under the `github-repository-configuration` rules' Trusted review configuration
section.

## Reads

Paths are relative to the repository root.

- `CONTRIBUTING.md`: the merge conditions and the Merging, Comments and
  Credentials sections the steps name. When it is missing, carry out the
  steps and the commands' own checks as written, and hand off to the owner in
  one PR comment for any rule the steps leave to the guide.
- The installed rules the steps name, such as the
  `github-repository-configuration` rules, which the `repository-standards`
  skill looks up. When they are missing, the commands' own behavior stands, no
  rule prescribes a worker handoff, owner approval or merge outcome comment,
  and `CONTRIBUTING.md` alone sets the merge and wording rules.
- `.github/pull-request-reviewer.json`: the optional reviewer declaration.
  When it is missing at the selected commit, no reviewer is configured.
- `.github/factory-review-policy.json`: the optional app-author review policy.
  When it is missing at the selected commit, configured reviewer behavior
  applies.
- `.factory/config.json`: its `labels.releaseHold`, which the merge command
  reads. When the file or the key is missing, no release hold applies.
- `.repo-standards/runtime/`: the pinned Repository Standards runtime, its
  `package-lock.json` and `node_modules/.bin/repo-standards`, which the
  request command uses to rebuild an adoption summary. When it is missing, no
  link is exempt as part of an adoption summary.
- `vendor/postern/postern.mjs`, `vendor/marked/marked.esm.js` and
  `vendor/parse5/parse5.esm.js`: the bundles the commands import, which Repo
  Canon's adoption installs. When they are missing, the commands cannot start:
  carry out each step by hand with the GitHub CLI under the same rules, and
  squash-merge with the subject `<title> (#<number>)` and the PR body passed
  explicitly.
