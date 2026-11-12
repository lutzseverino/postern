---
name: factory
description: Hand ready tickets to the factory, resolve holds, resume stopped work, deliver skipped work, or pause and resume one repository.
---

A prompt or brief naming this skill is its invocation.

Work in the repository the factory serves. Read `CONTRIBUTING.md`, the
installed `factory-workflow`, `github-repository-configuration` and `comments`
rules, and `.scriptorium/config.json` before acting. The guide and rules hold the requirements;
this skill supplies the method. Use the configured label roles rather than
assuming the shipped strings. Read the issue's authoritative contract, comments,
blockers, and any existing PR and handoff before choosing a path below.

## Hand a ready ticket to the factory

1. Check the contract's accepted revision and its validator notice, parent
   readiness and open blockers under the guide and installed rules. Resolve
   missing required inputs before seeking readiness.
2. Choose the ticket's model, weighing its triage suggestion. Prefer a stronger
   model for design judgment, ambiguous scope or a long cross-cutting change.
   Use the rules' model-label syntax and metadata; the host operator resolves
   an unavailable or disallowed model rather than substituting one silently.
3. Apply the readiness policy through `triage`'s readiness command. With an App
   or bot credential in a factory repository, hand the reviewed revision,
   suggested readiness, model and route labels, and blockers to an authorized
   person. Report pickup only when the factory actually records it.
4. For a parent held under the latest-link-time fallback, wait until its latest
   ticket link is visible in the timeline, then remove and re-add its ready
   label after that timestamp. Each ticket still needs its own readiness.
   With complete authorized link history, use the installed actor-history rule.

## Read a hold

Read the factory's run comment and current labels first. Match the reason
rather than clearing a state label to see what happens:

| Observation | Next action |
| --- | --- |
| Refused readiness or parent not ready | Verify the exact revision and the authorized person's readiness, then the parent's contract and link history. |
| Model-label error | Reconcile the ticket's single model label with the chosen model; ask the host operator about resolvability or the allowlist. |
| Repository configuration refused | Ask the host operator to verify the serving release and configuration acceptance. Keep the issue's evidence available. |
| Open blockers, capacity or usage drain | Resolve blockers or wait for the host's gate to clear; no label reset bypasses it. |
| Repository or release hold | Find the labelled open items and use Pause and resume below. |
| Running or paused | Read the run comment; the factory owns the run and its automatic resumption. |
| A `state:` stop | Use Resume stopped work below. |
| Failed | Address the failure the run comment names first, then remove the failed label to request a retry subject to pickup gates. |
| Skip | Use the directly launched path below; clearing a waiting marker does not request a factory retry. |

If no comment explains a held issue, ask the host operator for its reason; a
host with no cached valid configuration cannot comment on the issue. Keep
credentials and secret host material out of tracker records.

## Take the skip route

For work excluded by the installed rules, arrange the ready, model and skip
labels together through the authorized readiness path. Launch `implement`
directly with the contract, evidence, decisions, issue link and delivery role.
The worker opens the PR and records its handoff as
`.repo-standards/rules/comments.md#delivery-records` says. Continue as the orchestrating agent through `babysit` from that handoff;
apply its current-head owner-approval gate when designated.

For an unanswered owner question, retain the skip marker and the question's
workflow state.
After resolution and any required renewed readiness, resume the worker if no
PR exists, or continue the same open PR and its handoff. Live host access gates
only the authorized live steps.

A live-acceptance ticket takes this route. Its worker records the ticket's live
acceptance on it, as `.repo-standards/rules/comments.md#disclaimers` says,
instead of opening a PR, and reports back. It closes only once
its live acceptance is recorded on it, never on a merge; its source ticket's PR
links it without a closing reference. A time-bounded host access grant belongs to the
orchestrating agent that asked the maintainer for it, which records the workers
using it. Workers never end it: it ends when the last of them reports back, or
at its own time bound.

## Resume stopped work

Answer the question through the guide's owner-question route, posting as
`.repo-standards/rules/comments.md#disclaimers` says, and meet the installed
Questions and stops rule's conditions for a changed contract. Then return the
issue to `state:ready`, which is the only way to resume it: never clear another
label for it, and never merge the stopped PR by hand. For skipped work,
continue as Take the skip route says instead.

## Pause and resume one repository

1. Read `labels.hold` in the repository configuration and locate every open
   issue and PR carrying it. If the key is absent, arrange a compatible
   configuration with the owner before attempting a pause. Distinguish this
   repository hold from the release hold and the factory's per-run paused state.
2. For an expedited change with an existing PR, put the hold on that PR. If
   work starts before its PR exists, put it on the change's issue first and
   record why the repository is paused and which change will carry it, as
   `.repo-standards/rules/comments.md#disclaimers` says.
3. Deliver the expedited change outside factory pickup: launch a worker
   directly or implement as the orchestrating agent. A held repository launches
   no new work. An already-open factory PR can instead carry the hold and finish
   through its exempt merge relaunch. Runs already started finish without
   merging while another open item holds the repository.
4. Once the expedited PR opens, add the hold to it before removing the hold
   from the issue. Verify that transfer on both items. Before merging, inspect
   all other open items carrying either configured hold: only the PR being
   merged is exempt, so a forgotten issue hold would block it too.
5. Finish validation, applicable reviews and merge authorization through
   `babysit`. Its merge check exempts this PR's own hold, allowing the expedited
   change to merge. The PR's closure ends that hold automatically. To resume a
   deliberate pause without merging, remove the hold from the item that carries
   it; leave other owners' holds alone. Confirm no remaining open hold and
   report the resulting state. A release hold still restricts merges separately.

<!-- Seam (deferred): Scriptorium configuration reads; consumers: 6; extraction proposed in https://github.com/lutzseverino/repo-canon/issues/967. -->

## Reads

Paths are relative to the repository root.

- `CONTRIBUTING.md`: contract, readiness, delivery, question and credential
  requirements. When it is missing, use the installed rules and
  hand off any unresolved delivery or authorization question on the issue or PR.
- The installed `factory-workflow` and `github-repository-configuration` rules,
  located with `repository-standards`. When they are missing, use the guide
  and configured roles; ask the owner before a route or merge-ownership decision
  that those sources do not settle.
- `.repo-standards/rules/comments.md`: the installed comment rules, whose
  sections the posting steps name. When it is missing, post each record the
  steps name as one comment.
- `.scriptorium/config.json`: configured label roles. When it is missing or
  unreadable, perform read-only diagnosis and ask the owner to establish the
  factory configuration before changing factory labels.
