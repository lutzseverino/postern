---
name: babysit
description: Babysit an opened pull request through checks and review to merge or its prescribed handoff. Use right after opening a pull request, or when asked to babysit or land one.
---

A prompt or brief naming this skill is its invocation.

Take the PR through authorized delivery under `CONTRIBUTING.md` and the
`github-repository-configuration` merge rules. Before each post, read the
`.repo-standards/rules/comments.md` section named by its step.

Before requesting or waiting, establish your role from `CONTRIBUTING.md`'s
Merging section and applicable installed rules. Record any prescribed worker
handoff on the open PR under `.repo-standards/rules/comments.md#delivery-records`
and stop. The designated merging agent resumes with its review requirements
and outstanding findings. For an owner-question pause, follow installed
continuation rules before request and wait. For authorized delivery of a
stopped run's open PR, enter Branch-update recovery first, using this
invocation's branch update. Carry the handoff context and follow installed
rules for retaining its waiting marker and recording the merge outcome.

The bundled scripts require Node.js 24 or 26. Request and wait read optional
`.github/pull-request-reviewer.json` and `.github/factory-review-policy.json`
under the `github-repository-configuration` rules' Trusted review configuration:
both files come from one pinned destination default-branch full SHA, retained
across wait polls and head changes. Each outcome identifies repository and revision.
Proposed changes apply only after merging to that default branch. No reviewer
file means checks only, unless app-author policy identifies a review skip;
no policy means configured reviewer behavior, without an owner question.
Invalid trusted declarations, including a plain human-login policy author,
require the owner handoff (exit `7`, below).

Before the first wait and each later or resumed head, run
`node <this skill's directory>/request.mjs <number>` from the repository root.
It applies app-author policy before the rules' review request rule, posting
any required request under step 4 or reporting why none is needed. Add
`--fixes-review` when the head fixes a finding requiring a new request.
Exit `0` means the rule was applied, not that review occurred; `1` and `7`
use the wait's error and owner-handoff actions below.

Request and wait read the paginated ready-for-review history when automatic
opening requests are enabled. They apply the rules' effective request time to
bounds and head freshness while retaining the original completion and
unavailability evidence cutoffs. Polls and resumed invocations use platform
timestamps, including when the PR has returned to draft.

Request checks the PR body's own-head file links before any request or policy
skip. Exit `8` lists links to replace with commit-SHA links; correct the body
and rerun request before waiting. It never rewrites the body; external
repositories and other branches are outside this check.

For an adoption-summary exemption, request rebuilds pre-commit state in a
temporary detached worktree outside the author's checkout at
`merge-base(<PR base commit>, <head>)`, restores the exact head tree with
`git restore --source=<head> --worktree :/`, runs
`npm ci --ignore-scripts --prefix .repo-standards/runtime` there, then runs the
head's pinned `.repo-standards/runtime/node_modules/.bin/repo-standards status --summary`.
It removes the temporary worktree on success and failure. Only a complete,
byte-exact leading match of that stdout is exempt, including its final newline
and generated Impact and Migration. Every appended section is checked. Missing
local commits or runtime, failed reconstruction/install/generation, and a
mismatching prefix grant no exemption: the diagnostic explains why the whole
body was checked. Link-free bodies need no reconstruction.

1. Run `node <this skill's directory>/wait.mjs <number>` from the repository
   root in the foreground until it exits. It silently waits for checks and the
   configured reviewer's review of the head. Use a 600000 ms command timeout
   where supported and ask for the longest wait whenever it yields.
   Wait requires positive current-head success for every name in trusted
   `.github/required-checks.json`; no-check timeouts never qualify.

   | Exit | Outcome and action |
   | --- | --- |
   | `0` | Checks passed; reviewer reviewed or none configured. Go to step 2. |
   | `2` | Listed checks failed. Go to step 2. |
   | `3`, `4` | Checks passed; reviewer did not review this head (`3`: unavailable; `4`: reason in output). Go to step 2; apply the rules for merging without review and record its absence under `.repo-standards/rules/comments.md#delivery-records`. |
   | `5` | Still waiting; rerun wait. |
   | `6` | Checks passed; app-author policy skipped external review. Go to step 2; after both internal reviews, read `.repo-standards/rules/comments.md#reviews`, fill every placeholder in the printed full-head template and post it as a PR review. An unfilled template is not completed evidence. |
   | `7` | Invalid trusted configuration. Post an owner question under `.repo-standards/rules/comments.md#owner-questions`, naming the diagnostic's destination repository, selected revision, declaration, validation problem and needed correction. Follow installed continuation rules, leave the PR open and stop babysitting; no unchanged-configuration retry or merge. |
   | `1` | For permission refusal, follow `CONTRIBUTING.md`'s Credentials section; otherwise fix the invocation or platform error and rerun. |

2. Verify each failing check and review finding against the source, including
   findings that arrive on a policy-skipped pull request. Follow the
   `github-repository-configuration` rules for applicable internal Standards and
   Spec reviews, posting each round as
   `.repo-standards/rules/comments.md#reviews` says.
3. Fix the real findings `CONTRIBUTING.md` does not let you decline, and answer
   every review thread as it requires. Before replying, read
   `.repo-standards/rules/comments.md#review-thread-replies`.
4. After a fix push, apply the review request rule to the new head using
   `request.mjs` as above, with app-author policy taking precedence. Post any
   required request under `.repo-standards/rules/comments.md#review-request-comments`.
   After any push or re-request, return to step 1.
5. Before each merge attempt, verify merge ownership and any required owner
   approval against the current head under the applicable installed rules.
   Read the authoritative implementation contract and any worker handoff and
   apply the `github-repository-configuration` rules' Designated owner review gate.
   Read PR comments carrying designation provenance and current-head approval;
   record approval there under `.repo-standards/rules/comments.md#delivery-records`.
   Missing required approval means the guide's owner-question handoff under
   `.repo-standards/rules/comments.md#owner-questions`; stop with the
   PR unmerged. Once merge conditions hold on the latest head, run
   `node <this skill's directory>/merge.mjs <number> <SHA>`, where `<SHA>` is
   the full SHA that starts the wait's latest line:

   | Exit | Outcome and action |
   | --- | --- |
   | `0` | Merged. Record any installed-rule-required outcome under `.repo-standards/rules/comments.md#delivery-records`: delivered head, validation/review results and printed merge commit SHA. |
   | `2` | Head changed or current-head validation has not succeeded. Return to step 1. |
   | `3` | Not merged; owner needed. Hand off under `.repo-standards/rules/comments.md#owner-questions`, without retrying merge. |
   | `4` | Stale base. Enter Branch-update recovery if this invocation has not used its branch update; otherwise record the owner handoff and stop. |
   | `5` | Current-head policy-skip review missing/incomplete. Complete both internal reviews, post under `.repo-standards/rules/comments.md#reviews` using wait's full-head template, verify other merge conditions and rerun merge. No owner handoff. |
   | `6` | Configured-reviewer threads remain unresolved. Resolve them on the platform, verify the other gates and rerun merge. Replies alone do not resolve threads. |
   | `9` | Another open issue/PR has the repository-hold label, or another open PR has the release-hold label. Leave this PR open; retry only after the hold ends. Factory runs end for factory relaunch after the hold; other runs rerun merge after it ends. No owner handoff. |
   | `1` | For permission refusal, follow `CONTRIBUTING.md`'s Credentials section; otherwise fix the invocation or platform error and rerun. |
6. Stop.

Wait and merge require `.github/required-checks.json` from the pinned trusted
default branch; absent, invalid or unreadable declarations refuse delivery.
Correct the declaration on that trusted branch through the applicable owner
procedure, then invoke again. Local or PR-branch files supply no bootstrap bypass.
Merge independently checks every declared name for positive current-head success
and all configured-reviewer threads for resolution, on both freshness paths.
Unreadable or incomplete check/thread evidence permits no merge. After slow
gates it rechecks the head, live destination and current-base ancestry.

The merge command independently resolves trusted review configuration and checks
the platform PR author on every invocation, even without a prior wait. Invalid
trusted declarations require its owner-handoff exit `3`; unreadable review
configuration returns `1` and permits no merge. A prior wait result and proposed
PR-branch policy cannot bypass the outcome check.
Immediately before its merge write, it reads `labels.hold` and
`labels.releaseHold` from
`.scriptorium/config.json` at that same destination default-branch snapshot and
lists open issues and PRs for the repository hold and open PRs for the release
hold, excluding only the PR being merged. An absent file or key adds no hold. Unreadable or invalid configuration or issue/PR reads
permit no merge write and follow the freshness-read failure handling.

## Branch-update recovery

Every owner handoff in this section and in step 5 posts its question as
`.repo-standards/rules/comments.md#owner-questions` says.

Follow the `github-repository-configuration` rules' Required-check freshness
section: strict non-bypassable GitHub enforcement wherever available; only
recognized plan-limit 403s for both classic protection and rulesets on a private
repository permit merging-agent verification. After slow gates, immediately
before expected-head merge, verify the live default destination, unchanged
validated/reviewed head, successful applicable validation on that exact head
and current default-tip ancestry. Missing/unreadable evidence, ordinary
permission refusals, missing workflow and deferred setup grant no exception.
Only on this proven plan-limited path does the owner accept the concurrent-base
race: another writer may advance the base after verification and merge can succeed. Immediate
checks narrow that window without GitHub's atomic protection. Exit `4` means
stale base, distinct from head change or owner-only failure; no merge succeeded.

The same section bounds recovery and says what it never does. Preserve committed,
staged, unstaged and untracked work and the PR's review and handoff context
before changing history. Fetch origin, resolve its remote default branch again,
and inspect outgoing history (including each merge parent) and the whole diff.
Rebase or replay only this PR's work onto the refreshed base; keep unrelated
work preserved separately. Uncertain ownership or reconstruction conflicts
require the owner handoff.

Validate the integrated change with the repository's required local checks;
wait for their final successful status before pushing with an explicit lease
when history changed. Before the delivery push, refresh origin and its default
branch again and inspect both `git log --stat --patch -m origin/HEAD..HEAD`
and `git diff origin/HEAD...HEAD`. Revalidate after any further reconstruction.
A permission refusal ends recovery under Credentials, without another push.

For the replacement head, repeat applicable internal reviews and owner approval,
then request and wait again from step 1 under freshly applied trusted app-author
policy. Pending/failed checks permit no merge; old-head checks never qualify it.
Re-establish merge ownership before step 5. Finish each waiting PR's delivery
before the next, refreshing each base independently.

For either command's exit `7`, follow correction and authorized continuation
under the rules' Trusted review configuration section.

## Reads

Paths are relative to the repository root.

- `CONTRIBUTING.md`: the merge conditions and the Merging, Owner questions and
  Credentials sections the steps name. When it is missing, carry out the
  steps and the commands' own checks as written, and hand off to the owner in
  one PR comment for any rule the steps leave to the guide.
- `.repo-standards/rules/comments.md`: the installed comment rules, whose
  sections the steps name before each post. When it is missing, post each
  record or question the steps name as one comment, and each review in the
  shape the wait prints.
- The installed rules the steps name, such as the
  `github-repository-configuration` rules, which the `repository-standards`
  skill looks up. When they are missing, the commands' own behavior stands, no
  rule prescribes a worker handoff, owner approval or merge outcome record,
  and `CONTRIBUTING.md` alone sets the merge rules.
- `.github/required-checks.json`: the required-name authority for wait and merge.
  Missing, invalid or unreadable at the selected trusted commit stops delivery
  and requires correction on the destination default branch before reinvocation.
- `.github/pull-request-reviewer.json`: the optional reviewer declaration.
  When it is missing at the selected commit, no reviewer is configured.
- `.github/factory-review-policy.json`: the optional app-author review policy.
  When it is missing at the selected commit, configured reviewer behavior
  applies.
- `.github/workflows/pr-metadata.yml`: the workflow whose presence the merge
  command verifies on the live default branch for plan-limited delivery. When
  missing or unreadable, that path permits no merge.
- `.scriptorium/config.json`: its `labels.hold` and `labels.releaseHold`, which the
  merge command reads. When the file or a key is missing, that hold does not apply.
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
