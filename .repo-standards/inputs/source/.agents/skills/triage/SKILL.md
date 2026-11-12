---
name: triage
description: Move issues and external PRs through a state machine of triage roles, sort each request by where its uncertainty lies, and bring its agent brief to acceptance through research and independent review, or through a grilling session with the owner. Also runs unattended as the factory's triage run, which writes nothing and ends with a run result.
disable-model-invocation: true
---

A prompt or brief naming this skill is its invocation.

# Triage

Bring requests to agent briefs that hold. Resolve bare issue/PR numbers and
whether external PRs are a request surface from `docs/agents/issue-tracker.md`.
A PR is an issue with attached code: use the same roles and states.

Before every tracker comment or issue body, read `.repo-standards/rules/comments.md#disclaimers` for the triage disclaimer.
The contribution guide's Triage and Readiness sections and installed rules own
routing, inference, acceptance, readiness, labels and owner questions; apply them
where named below, with the absent-input fallbacks under Reads.
Use [AGENT-BRIEF.md](AGENT-BRIEF.md) for durable briefs and triage notes, and
[OUT-OF-SCOPE.md](OUT-OF-SCOPE.md) for the `.out-of-scope/` rejection records.

For direct specification and ticket bodies, use the contribution guide's
direct-contract route and the acceptance steps below, applying brief-specific
shape checks only to Agent Briefs.

## Publication mode

Read the validator's current mode and selected source before publishing a
brief. Prepared mode keeps the comment route. After explicit body-mode
activation, new/revised contracts replace the issue body and preserve one
verbatim Original request at its end, as [AGENT-BRIEF.md](AGENT-BRIEF.md) says.
An exact unchanged inventoried legacy comment stays authoritative until its
next revision; no new or edited comment becomes a contract after cutoff.
Missing/ambiguous original input or unknown mode holds publication/readiness.
Ordinary research notes, progress and questions remain comments.

A factory agent remains read-only and returns its brief as before. The host
chooses the verified publication route, captures intake author/writer proof
before replacement, and publishes separate body attestation evidence. Mutable
run reports are not contract evidence. Wait for a matching validator notice
and current-event approval; arbitrary app bodies/markers grant no authority.
The body protocol is an explicit adopter activation, never a package-install
side effect; no live activation occurs while implementing its source ticket.

## Modes and roles

- **Orchestrating agent**, the default maintainer invocation: follow every section except Factory triage run. Sort requests, start a fresh-context research run per request, receive every question first, keep the decision inbox, and independently review and accept briefs.
- **Research run**: gathers facts, verifies claims and writes briefs once intent is settled, unless a grill publishes direct contracts. It applies no labels and never judges its own brief.
- **Grill**: a separate session with the owner for intent you cannot infer. The owner holds intent; never ask them to finish a brief.
- **Factory triage run**: receives one issue and a result path. Follow only [Factory triage run](#factory-triage-run) and the sections it names.

If subagents are unavailable, research and post the brief yourself, then stop
and link the owner to it for review by someone who did not write it.
Follow `AGENTS.md`'s Agent skills delegation and session-naming requirements;
name separately from the invocation and task context. Each research handoff
uses its listed issue references and deliverables as task context, assigning
ordinary research notes to comments and the brief to the verified publication
route above.

Canonical categories are `type:bug` (broken) and `type:enhancement` (improvement).
States name the wait: `state:triage` (evaluation), `state:reporter` (outside reporter's fact), `state:grill` (owner-intent grill), `state:owner` (owner), `state:ready` (AFK agent); `wontfix` closes work that will not be actioned. For a PR, ready means a brief is attached and an agent takes the next diff step.
Use `docs/agents/triage-labels.md` for label strings and installed GitHub rules for meanings. Keep exactly one category and state per triaged issue; flag conflicting states and ask the maintainer before acting. Set one `priority:` label by the installed rules' Labels section.
Unlabeled issues normally enter triage, then a waiting state or `wontfix`. On new information, return waiting work to triage or the guide's Readiness state for answered ready work. Flag unusual transitions and ask before acting; the maintainer may override any time.

Repository issues, briefs, comments and decision records retain every relied-on
decision with its date and quoted words, including decisions copied from private
records. Cite repository records, never private-workbench URLs, host paths or
instructions as input or provenance; private planning may keep its own sources.

## Show what needs attention

Query the issue tracker and present three buckets, oldest first:

1. **Unlabeled**: never triaged.
2. **`state:triage`**: evaluation in progress.
3. **`state:reporter`, `state:grill` or `state:owner` with reporter activity or an owner decision since the last triage notes**: needs re-evaluation.

When PRs are in scope, include external PRs in these buckets and tag each line `[PR]` or `[issue]`. Discovery surfaces only _external_ PRs (the tracker config defines who counts as external), so a collaborator's in-flight PR is not triage work. This filter is discovery-only; an explicitly named PR is always triaged regardless of author.

Show counts and a one-line summary per item. Let the maintainer pick.

## Sort by uncertainty

Before any research, sort the request as code-bound or intent-bound by the contribution guide's Triage section. Its category label does not decide it. A bug whose report or documentation states what should happen is usually code-bound; a new capability, a "should" question, a limit, a default, a timeout, or a naming or scope call usually is not.

A request can move from code-bound to intent-bound when research turns up an intent question. It moves back only when the owner's answers, or answers inferred under the inference test, settle every such question.

## Triage a specific issue or PR

1. **Gather context.** Read the full issue or PR (body, comments, labels, author, dates; for a PR, the diff too). Parse prior triage notes and recorded owner decisions so you don't re-ask resolved questions. When resuming orchestrating triage, check outstanding questions for reporter/owner answers and present an updated picture before continuing. Read `.out-of-scope/*.md` and surface any that resembles this request (prior rejection). Read enough of the codebase, using the project's domain glossary and its ADRs, to sort the request. Pass any recorded owner-review reservation and its dated source to the brief's writer on either path.

Every research run, on either path, does two checks first:

- **Redundancy**: search for an existing implementation of the requested behavior by domain concept (not just the request's wording), and report where it looked.
- **Verify the claim.** For a bug, reproduce it from the reporter's steps. For a PR, confirm the diff does what it claims: check it out, run the relevant tests or commands. Report what happened: confirmed (with code path), failed, or insufficient detail.

2. **Recommend.** Tell the maintainer your category, path (code-bound or intent-bound), priority, and state recommendation with a one-line reason each. Continue unless they redirect you.

3. **Take the request's path**, below. Either path can end early: a redundant request is an already-implemented `wontfix`, a claim that fails verification or lacks detail waits on whoever holds the missing fact, and a rejected request is `wontfix` (see [Other outcomes](#other-outcomes)).

### Code-bound path

1. **Research.** Start the research run with the issue link, its path, [AGENT-BRIEF.md](AGENT-BRIEF.md), the two checks, and this task: when the claim is confirmed, post the agent brief, followed by its triage notes, on the issue as `.repo-standards/rules/comments.md#disclaimers` says, and report any question it could not answer from code or logs instead of guessing at it.

2. **Review.** Read the published brief as a reviewer who did not write it. Check it against the issue and the code yourself, not against the research run's own summary:
   - **Evidence**: each claim the brief rests on traces to a code path, a reproduction, or the issue. Spot-check the one the change depends on. Verify every required input under [Available inputs](AGENT-BRIEF.md#available-inputs); reject a private-workbench reference in place of copied decision content.
   - **Scope**: desired behavior is what the request asks for; nothing the request needs is dropped, nothing beyond it is added, and out of scope names the adjacent work an agent might reach for. Work that must be shown on a live system is split as [AGENT-BRIEF.md](AGENT-BRIEF.md#live-acceptance-gets-its-own-ticket) says.
   - **Acceptance criteria**: each is concrete, testable, and independently verifiable, and together they cover the edge cases the request and the code expose.
   - **Dependencies**: work that must land first is named, so it can be recorded as a blocker.
   - **Seams**: assess the writer's result under `codebase-design`'s [Ownership check](../codebase-design/SKILL.md#ownership-check), including its honesty, Value owner, consumers, reversibility and cost read. The validator checks structure only.
   - **Open questions**: none remain, including missing required inputs. Route unavailable material as [Route questions](#route-questions) says. An open intent question means the request is intent-bound; switch paths.

   Passing the issue-contract check proves the shape, never that the brief holds. When it does not hold, send the research run the specific corrections; it edits the brief, and you review the new revision from the top.

Once it holds, [accept it](#accept-a-brief-that-holds).

### Intent-bound path

1. **Fact-finding.** Start the research run with the issue link, its path, the two checks, and this task: gather the code facts the owner's decision needs (current behavior, constraints, prior decisions in the issue, ADRs, and glossary, and the options with what each would cost), and write no brief yet. Post its findings as a triage notes comment, as `.repo-standards/rules/comments.md#disclaimers` says, when the owner will read them on the issue.

2. **Infer what you can cite.** Answer each intent question the contribution guide's inference test lets you answer, and record it as that test says. When you infer every one, have the research run write the brief from the facts and your inferred answers, then go to step 6.

3. **Grill the owner** on the one-way doors or unchosen values the full inference test cannot settle, in a grilling session of its own. Open it with `/grill-with-docs` using the session's supported invocation, followed by task context: the issue links, facts, inferred answers, dated recorded decisions with quoted words, unresolved questions and scope. Include the owned branch and checkout for domain-document edits, per-repository PR destinations, the decision-record destination and report-back destination. Its deliverables are the decision record and, through `to-spec` then `to-tickets`, one published specification and proposed tickets in their responsible repositories with actual native parent/blocker links, awaiting independent review. Have it reuse settled answers and list qualifying inferences under **Inferred, listed for the owner**, with dated sources and owner veto. When the owner cannot join a grill now, put the request in your decision inbox with your recommendation.

4. **Decide the split** as the contribution guide's Triage section says. Inspect granularity, dependencies and factual/test-seam evidence, and use its correction and fact-finding routes. For failed native writes, report the exact missing relationship and platform response under the guide's publication rule.

5. **Check publication** by the grill writer against the guide's Triage publication rules. Inspect the specification and ticket bodies, native parent/blocker relationships and copied decisions. The original intake's triaged contract, if revised, still follows Publication mode above; do not create a second authoritative contract for the same work.

6. **Review and accept** each exact contract independently as on the code-bound path, using the direct specification/ticket shape rather than Agent Brief fields where applicable. Route open questions as [Route questions](#route-questions) says, and return settled questions to the writer for correction. Apply the guide's Readiness section and installed parent-readiness rules. For amendments, check the revised specification and delta contracts through this same review process under the guide's Triage amendment rules.

### Accept a brief that holds

1. **Wait for the revision notice** for the brief revision you reviewed, as the contribution guide's Readiness section says. If the brief changed after your review, review the new revision. If no notice arrives, leave readiness to the owner and tell them the notice is missing.
2. **Choose the state** the installed rules give the work:
   - `state:owner` for work only the owner can do. It is not readiness: apply it with the tracker's own client and a note naming what the owner must supply, and skip the readiness command.
   - `state:ready` with `factory:skip` for agent work the installed factory rules say the factory must not pick up. Without those rules there is no skip label.
   - `state:ready` alone for any other work.

   When owner review before merge is reserved, verify that the brief explicitly designates it as contract behavior and its triage notes retain the dated decision source. Check this even when that reason first arises here, after the initial brief review. If the designation or its source is missing or unclear, return the brief to its writer with the recorded reservation and source; the writer corrects it. Independently review the corrected brief from the top, then return to step 1 for its new validator revision notice before applying readiness.

3. **Choose the model**, when the installed rules ask for a `model:` label: apply their Model selection rule to the triage notes' suggestion and the work, pick one label yourself, and give the guidance-based reason. Keep a matching model already on the issue, or remove a conflicting one before applying readiness.
4. **Apply and confirm readiness** with the bundled command, using the `sha256:` revision from the notice you reviewed and the companion labels you chose:

   ```sh
   node <this skill's directory>/ready.mjs <issue> <sha256:reviewed-revision> <model-label>
   ```

   The command applies `state:ready`. Omit the model label when the installed rules ask for none. Additional companion labels, such as `factory:skip`, follow the revision; `--repo owner/name` selects another repository. Run it with Node.js 24 or 26 in the foreground, bounded by your command timeout; it uses the current `gh` credential and needs no install step. It reads the destination's factory configuration at its default branch to tell whether a model label applies, and creates a missing chosen model label. Exit zero confirms the validator approved that revision by your account; a nonzero exit explains the refusal or rejection. Review a changed revision again before retrying. For a parent it waits for the latest child link and reapplies readiness when needed.

5. **Record blockers.** Add a native blocker for each issue whose work must land first.
6. **Tell the owner** what you accepted, with links to each brief, the labels you applied, the blockers you added, and every answer you inferred, so they can veto it.

When your credentials cannot apply readiness, or the destination's factory workflow rules say its factory starts no work on your account's readiness, stop at acceptance: tell the owner or another authorized person, with links, which revision holds, the readiness, model and skip labels you chose, and the blockers to record, and report that factory work has not started.

## Factory triage run

The factory starts this run for one issue, read-only, and the installed factory workflow rules' Triage run section sets its limits. There is no orchestrating agent, research run, grill or workbench to hand anything to: you research, write and review the brief yourself, and everything you produce goes into one run result, which the factory posts and turns into labels.

1. **Gather context** as [Triage a specific issue or PR](#triage-a-specific-issue-or-pr) step 1 says, and run its two checks first, yourself. Read the repository's ADRs, its glossary, and the issues the request links, with their decisions: the records the Triage run section lets you cite.
2. **Sort** the request as [Sort by uncertainty](#sort-by-uncertainty) says. Answer each intent question the inference test lets you answer from those records, and list it with the record and its date under **Inferred intent** in the triage notes.
3. **Choose the outcome** the Triage run section names, with the labels it lists, and write its body:
   - `state:ready`: write the Agent Brief and its triage notes as [AGENT-BRIEF.md](AGENT-BRIEF.md) says, review them as the [code-bound path](#code-bound-path)'s step 2 says, and correct them until they hold. Choose the `model:` label under the installed Model selection rule, within the host capabilities the factory supplies, and record its reason in the triage notes.
   - `state:reporter`: the [reporter template](#reporter-template).
   - `state:owner`: the question and what you found.
   - `state:grill`: the facts gathered (current behavior, constraints, the records you read, the options and what each would cost) and the open questions, numbered.
4. **Write the run result** to the path the factory gives, in the format its run-result interface defines: the state and labels you ask for, and the body, with no disclaimer, as `.repo-standards/rules/comments.md#disclaimers` says. When you cannot finish, write a failed result with the reason.
5. **Write nothing else**, as the Triage run section says, even where a credential would allow it: a reproduction stays in your sandbox, and `ready.mjs` never runs.

## Other outcomes

Before posting a comment for any outcome below, read `.repo-standards/rules/comments.md#disclaimers`.

- A missing fact or decision: route it as [Route questions](#route-questions) says; for a question to an outside reporter, post triage notes (template below).
- For `wontfix`, close the issue, with the comment depending on _why_:
  - **Already implemented**: the change already exists in the codebase. Point to where it lives; do **not** write to `.out-of-scope/` (that KB is for _rejected_ requests, not built ones).
  - **Rejected (bug)**: give a polite explanation, then close.
  - **Rejected (enhancement)**: write to `.out-of-scope/`, link to it from a comment, then close ([OUT-OF-SCOPE.md](OUT-OF-SCOPE.md)).
- `state:triage`: apply the role. Optional comment if there's partial progress.

## Route questions

Every question reaches you first, whoever raises it: a research run, a grill, or an agent's issue comment, in any waiting state. Route it as the contribution guide's Triage section says:

- **An answer you can give**, from code, logs, or a reproduction, or under the inference test: post it on the issue as `.repo-standards/rules/comments.md#disclaimers` says.
- **A fact only an outside reporter holds**: ask them with the reporter template below, and move the issue to `state:reporter`.
- **An owner-only question**: put it in your decision inbox with your recommendation, and move the issue to the state the guide names.
- **An agent's question to the owner**, posted as `.repo-standards/rules/comments.md#owner-questions` says: read it first. When you can answer it, answer on the issue, and return the issue to the state the installed rules name for an answered question, such as `state:ready` through [Apply and confirm readiness](#accept-a-brief-that-holds). Otherwise put it in your decision inbox.

When an answer changes the implementation contract, follow the contribution guide's Owner questions section: a separate writer edits it.

## Quick state override

If the maintainer says "move #42 to state:ready", trust them: that is their review, not yours. Confirm what you're about to do (role changes, comment, close), then act, posting any comment as `.repo-standards/rules/comments.md#disclaimers` says. Skip grilling. Apply a readiness role through [Apply and confirm readiness](#accept-a-brief-that-holds), with the revision from the issue's current revision notice and the model and skip labels the installed rules ask for; when the command refuses your account, hand the maintainer those details instead. If moving to `state:ready` without a brief, ask whether they want one written.

## Reporter template

Post `## Triage Notes` with **What we've established so far:** listing every resolved point,
then **What we still need from you (@reporter):** listing specific, actionable questions.

## Reads

Paths are relative to the repository root. The installed rules' paths follow
Repository Standards'
[rules reference](https://github.com/lutzseverino/repo-standards/blob/v10.0.0/docs/usage/rules.md).

- `CONTRIBUTING.md`: Triage, Readiness and Owner questions. If missing,
  follow this method and ask the owner for any rule left to the guide.
- `.repo-standards/rules/comments.md`: posting sections named above. If missing,
  post as each step describes; an installed issue-contract check names the Agent Brief disclaimer.
- Installed rules, such as `github-repository-configuration` and factory workflow,
  looked up by `repository-standards`. If missing, use [AGENT-BRIEF.md](AGENT-BRIEF.md)
  for brief shape, this skill for role meanings, and no `model:` or `factory:` label.
- The `codebase-design` skill: its Ownership check supplies the Seams read
  and independent assessment. If missing, report the missing definition and
  stop brief writing or acceptance until it is available.
- `AGENTS.md`: Agent skills delegation and naming. If missing, give research runs
  only task context and name sessions for operation and target where supported.
- `docs/agents/issue-tracker.md`: tracker and external-PR scope. If missing,
  triage issues only and ask which tracker to use.
- `docs/agents/triage-labels.md`: role label strings. If missing, use canonical role names.
- `.out-of-scope/`, with `.out-of-scope/<concept>.md`: prior rejections. If missing,
  none were; create it on the first rejection as [OUT-OF-SCOPE.md](OUT-OF-SCOPE.md) says.
- `vendor/repo-canon/validate-issue-contract.mjs` and the `babysit` skill's GitHub connection:
  `ready.mjs` imports both. If either is missing it cannot start; stop at acceptance
  as for credentials that cannot apply readiness.
- `.repo-standards/rules/factory-workflow.md` and `.scriptorium/config.json` at the
  destination default branch: `ready.mjs` reads both for model applicability
  and prefix. If rules are missing there, it requires no model label.
