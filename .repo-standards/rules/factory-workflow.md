# Factory workflow rules

These rules apply to all work in a repository a factory serves, including
tracker work that changes no file. The contribution guide holds the general
implementation contract, readiness, owner-question, credential and pull request
requirements, and the `comments` rules hold what agents and the factory post on
issues and pull requests. The `factory` skill holds the method for handing work
to the factory, interpreting holds, delivering skipped work, and pausing or
resuming one repository.

## Canonical stages

Canonical stages are ordered below. Configured run kinds determine coverage;
uncovered stages are factory gaps.

| Stage                      | Configured factory coverage                                                                                                                                                                                                                                    | Hand skill                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Intake                     | An owner's idea enters through conversation with the orchestrating agent, then a grill unless the owner approves a shorter path. No run kind covers ideas. Filed requests enter through triage; its run covers them where enabled, within Triage run's limits. | `triage` for filed requests; ideas stay conversation, with no launch                                                                            |
| Grill                      | No run kind conducts the owner grill. Triage can gather facts and prepare questions; the owner answers under the contribution guide.                                                                                                                           | `grill-with-docs`                                                                                                                               |
| Specification              | No run kind publishes the grill's specification; the contribution guide governs publication.                                                                                                                                                                   | `to-spec`                                                                                                                                       |
| Tickets                    | No run kind publishes the ticket split; retain native parent and blocking links.                                                                                                                                                                               | `to-tickets`                                                                                                                                    |
| Brief review and readiness | Triage prepares research and briefs and accepts only within Triage run's exception. Direct specification and ticket contracts need independent authorized acceptance of exact revisions. Plan approval remains the owner's gate; Parent readiness applies.     | None yet (gap); readiness still uses `triage`'s readiness command                                                                               |
| Implement                  | Implement takes an eligible ready ticket through code and checks to a draft PR. Readiness never bypasses blockers.                                                                                                                                             | `implement`                                                                                                                                     |
| Review                     | Configured review independently reviews the implemented draft and handles findings under Run kinds.                                                                                                                                                            | `review`                                                                                                                                        |
| Merge                      | Configured review delivers through merge; otherwise implement follows Run kinds' delivery route. Skipped work retains separate merge ownership.                                                                                                                | `babysit`                                                                                                                                       |
| Release                    | No configured run kind supplies release; follow the repository's existing rules.                                                                                                                                                                               | None yet (gap)                                                                                                                                  |
| Live acceptance            | No run kind supplies live access. The separately blocked live-acceptance ticket closes only on recorded live evidence, as Skipped work says.                                                                                                                   | `implement`, under a time-bounded grant                                                                                                         |
| Close                      | Issue closure follows the contract and Issue closure below. A merged source PR never closes its live-acceptance ticket. No run kind supplies plan closure.                                                                                                     | `improve-codebase-architecture` for architecture Close reviews; retro uses a covering installed skill, else a skill-less launch with a gap line |

Owner grills, plan approval, independent contract acceptance and live access
retain their existing gates. The contribution guide owns publication authority
and amendment rules. Consumers reference this definition.

## Run kinds

`.scriptorium/config.json` enables run kinds under `runKinds`, mapping each to a
skill and its arguments:

- **Triage** researches one issue and ends with its Agent Brief or the
  question that stops it, changing no code, as Triage run says.
- **Implement** takes a ready issue to a draft pull request.
- **Review** reviews that draft pull request as an agent that wrote none of
  it, under the `github-repository-configuration` rules' Review of an
  implemented pull request section, and delivers it to its merge.

Implement is the minimum; triage and review are optional. Without triage,
readiness comes only from a person; without review, implement delivers and
merges its own PR. Otherwise only review merges. Triage stays read-only, and
every run ends with a result the factory posts and turns into labels.
Configuration holds mechanics; execution choices follow Repository model
policy and review's `differentProvider` follows Provider diversity below.

## Handoffs

Runs hand off through the issue's workflow state and pull request:

1. **Trigger.** A person whose current repository role the host authorizes
   starts triage by opening the issue or applying `state:triage`; an agent on
   their account counts as that person. The issue-contract workflow's fallback
   never triggers triage, so an outside reporter's issue waits for that person.
2. **Triage** ends with `state:ready` and the labels readiness needs, or in a
   `state:` stop.
3. **Readiness** starts implement when applied by a person or the factory's
   own triage run under the GitHub rules' Readiness roles. Other bot/App
   readiness never starts a run, even if validator-approved. An orchestrating
   agent on such an account applies no readiness: it stops at acceptance under
   `triage` and never reports factory work started.
4. **Implement** ends at a draft pull request, which starts review on it.
5. **Review** ends in a merge, a hand-back to implement on the same pull
   request, a stop at an owner gate, or a `state:grill` stop for a wrong or
   ambiguous contract. When its rounds do not converge, the issue gets
   `factory:failed`.
6. **A `state:` stop** leaves the issue with whoever must answer until it is
   back in `state:ready`, as Questions and stops says.

## Implementation inputs

Required Agent Brief inputs must be in the repository, issue/comments or public
URLs. Before readiness, check host-originated material for secrets and quote
or attach the non-secret material on the issue; a host-only path cannot be the
sole required source. Independent acceptance checks input availability with
the other requirements; a passing structure check grants no readiness. Sandbox
access is unchanged.

## Contract publication mode

Before publishing triage, the host verifies the repository's mode and cutoff.
Preparation retains legacy comment publication and v1 authorization. An explicit
per-repository cutoff activates body publication, v2 decisions and rejection of
new comment contracts together, after a bridge reader/poster is installed.
Freeze new/revised publication during complete inventory and its final re-read;
include held and skip-routed issues. Unknown mode or proof holds publication.

In body mode the read-only agent still returns its brief; the host preserves
one verbatim Original request and independently captured intake author/writer
proof, publishes the body, and posts separate immutable exact-revision
attestation evidence with one configured run marker. Mutable run reports never
replace contract evidence. Wait for the validator's matching body/proof notice,
then request readiness and wait for approval of that current event. Consume the
validator's verified v2 association; never parse a competing contract or infer
authority from an app author. Retain the exact unchanged inventoried legacy
exception indefinitely; edits move it into the body, and deletion cannot resurrect it.
Compatible release/adoption/host activation and actual pickup evidence belong
to their separately closing live-acceptance ticket, never to source closure.

## Parent readiness

A parent (a specification or any issue with sub-issues) never runs; its
readiness releases its tickets, which each also need their own readiness.
Parenthood grants no Agent Brief exemption: a non-specification parent with a
`type:` label needs its own complete Agent Brief and revision-bound
readiness under the contribution guide and issue-contract validator.

With complete sub-issue link actor history, later links preserve the parent's
readiness only when every addition at or after readiness was made by a person
the readiness policy authorizes. Bot, excluded, unauthorized, unknown or
unreadable actors, and unknown link times, hold the parent. A later authorized
link never cancels an earlier unauthorized one. Body edits and Agent Brief
revisions still require the applicable review and renewed readiness.

Platforms without that history use the latest-link-time fallback: apply the
parent's readiness after its tickets are published, and again when a ticket is
published later. Renewed readiness is valid only once the latest ticket link
appears in the parent's timeline. Readiness recorded in the same second as that
link holds the tickets. A platform reporting no link times skips the link
check; contract-review and authorization gates still apply.

## Model selection

The factory runs each ready ticket on its own. Whoever applies `state:ready`
to a non-parent must apply exactly one chosen `model:` label before or with
readiness, even for the host default. A parent needs no model label and chooses
none of its tickets' models.

Triage's suggestion, the accepting reviewer's label, factory triage's issue
label and every hand launch, including hand reviews, choose by the host's
Model guidance: fit first, then the cheaper model when several fit. Host
guidance owns the fit and cost information; Repo Canon supplies no model
ranking or task-difficulty ladder. Repository preferences and host capabilities
bound choices. The one-line model reason identifies the actual guidance used.
A model without guidance is never chosen by judgment: it runs only when the
owner explicitly names it for a launch or as a configured default. When
guidance leaves the choice open, use the configured host default
(`models.default`), even if unguided, and say that guidance did not settle it.

Prefer omitting `@<effort>` to inherit the per-model override or host-wide
effort. Explicit effort remains valid. The chosen model label uses
`model:<slug>` or `model:<provider>/<slug>`, optionally followed by
`@<effort>`; create the label if the repository lacks it. A `claude-*` or
`gpt-*` slug needs no provider. Create missing model labels with color
`5319e7` and description `Factory model: <model>` where `<model>` is the label
name after `model:`. Preserve an existing repository label unchanged. Triage's
readiness command provisions the chosen label before applying readiness; a
lookup or creation failure grants no readiness. The command accepts a matching
model already on the issue and refuses zero or conflicting models for
non-parent agent readiness.

For a non-parent issue in a repository a factory serves, the triage notes after
its Agent Brief suggest one `model:` label with a one-line reason, for the
reviewer to apply or replace. The suggestion is a triage note, not a field of
the brief. An orchestrating agent that accepts the brief is that reviewer: it
chooses the label itself, weighing the suggestion, and the research run that
suggested it applies no label. The factory's triage run chooses its own, as
Triage run says.

Repository preferences constrain the label triage suggests or chooses: select
within the repository's initial-implement preference and host capabilities.
The reviewer weighs that preference when applying or replacing the suggestion.

The host owns capabilities, credentials and per-kind defaults, including the
implement retry default. Defaults alone never define the capability catalog.
Malformed, conflicting or host-forbidden model labels hold work with a visible
model-label reason, including a relaunch whose recorded choice is forbidden.
Repository fallback never bypasses those shared-gate holds; it handles
temporary unavailability of an otherwise valid choice.

For a hand launch whose fitting provider is draining or paused, wait or choose
another model whose guidance also fits. Never choose an unfitting model to
avoid quota. Factory review and implement retry retain deterministic repository
policy and host per-kind defaults, the `wait`/`host-default` fallback and
provider diversity below; guidance adds no per-issue factory review chooser.

### Choosing examples

These placeholders illustrate choices, not shipped model guidance, costs or
effort values. Assume host capabilities and repository preferences permit the
named choices. The host's guidance says `provider-a/model-docs` suits
"documentation and policy edits; lower cost", `provider-b/model-general` suits
"documentation, policy edits and code review; higher cost", and
`provider-c/model-ui` suits "visual design; lowest cost".
`provider-d/model-unguided` has no guidance. All providers are available unless
stated otherwise. Each quoted reason is the one-line reason for that choice.

| Consumer and work                                                               | Choice and reason                                                                                                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Triage suggestion for a policy edit                                             | Suggest `model:provider-a/model-docs`: "Host guidance fits documentation and policy edits; lower cost than the other fitting model-general."                   |
| Accepting reviewer of that edit, with model-general suggested                   | Choose `model:provider-a/model-docs`: "Both guidance entries fit policy edits; model-docs is lower cost."                                                      |
| Factory triage's issue label for a documentation edit                           | Ask for `model:provider-a/model-docs`: "Host guidance fits documentation at lower cost than model-general; model-ui only fits visual design."                  |
| Hand review of a code change                                                    | Choose `provider-b/model-general`: "Host guidance fits code review; the cheaper models' guidance does not."                                                    |
| Hand documentation launch, considering the unguided model                       | Choose `provider-a/model-docs`: "Host guidance fits documentation at lower cost; model-unguided has no guidance for a judgment choice."                        |
| Owner explicitly names model-unguided for a hand launch                         | Use `provider-d/model-unguided`: "Owner explicitly named this model; no guidance-based choice was made."                                                       |
| Guidance leaves a hand launch's choice open; `models.default` is model-unguided | Use `provider-d/model-unguided`: "Guidance does not settle this work; use the configured host default, which has no guidance."                                 |
| Hand documentation launch; provider A is draining or paused                     | Wait for A, or choose `provider-b/model-general`: "Host guidance also fits documentation; provider A is held, and available model-ui fits visual design only." |

For effort examples only, suppose host effort is `high` and model-docs has a
`medium` override. `model:provider-a/model-docs` inherits `medium`;
`model:provider-b/model-general` inherits `high`.
`model:provider-a/model-docs@high` explicitly selects `high`; all three are
valid selections. These choosing examples supply no launch templates: the
orchestration integration owns the validated status read, effective model and
effort on each template, and budget in the records-only status view.

## Repository model policy

The optional repository-owned `.github/factory-model-policy.json` has this
one authoritative structural contract. A present file is a JSON object with
exactly these required root fields:

- `version`: the number `1`.
- `fallback`: `"wait"` or `"host-default"`.
- `runKinds`: an object with optional `triage`, `implement` and `review` keys.
  `triage` and `review` each hold a Selection. `implement` is an object with
  optional `initial` and `retry` keys, each a Selection.

A Selection is exactly `{ "provider": string, "model": string, "effort"?: string }`
or exactly `{ "source": "issue-label" }`. Every string is nonempty and trimmed.
Omitted effort inherits host/provider configuration. Unknown fields at every
level, mixed selectors, wrong types, non-object roots, malformed JSON and
unsupported versions are invalid. Empty `runKinds` and empty `implement`
objects are valid inheritance. A present file requires explicit fallback;
Repo Canon chooses no fallback, provider, model or effort for adopters.
The read-only `factory-model-policy` check passes absence as unconfigured and
fails invalid or unreadable files with their path and an actionable correction.
It validates syntax and structure locally, without a live host catalog or
credentials. Capability membership and temporary availability are host duties.

Scriptorium v4 resolves selections within host capabilities. The issue label
selects the initial implement attempt only: label, then initial-implement
policy, then host default. Triage, review and implement retry use their stage's
policy, then host default. A stage can explicitly reuse the issue label with
`{ "source": "issue-label" }`, which requires a usable issue label at runtime.
Missing preferences or a missing file retain host defaults, including retry;
they never imply a Repo Canon model choice.

For an otherwise valid preference that is unavailable, `wait` preserves the
issue, work and PR without launching until it is usable or configuration
changes. `host-default` uses the available host default for that kind/attempt,
otherwise waits. Neither authorizes arbitrary catalog substitution, credential
expansion, retry loops, label rewrites or bypassing a bad-label hold.

The repository deliberately creates or changes its policy in a separate
post-adoption commit. Adoption owns validation only: it never creates,
rewrites, normalizes, deletes or copies policy values, including on update,
removal or re-adoption. Invalid data is reported, never repaired. The
repository that deliberately configures the policy supplies all its values.

### Provider diversity

`runKinds.review.differentProvider` remains mechanics. When true, compare the
chosen review provider with the implement attempt that actually produced the
reviewed PR, including retries and hand-backs. If they match, the sole
alternative is the host's explicitly configured per-kind review default.
Switch only when no policy file exists or fallback is `host-default`, and
that default is available within capabilities on a different provider.
Otherwise run on the chosen provider and report unavailable diversity; never
wait solely for diversity or scan the catalog. This applies even when the
review preference itself is available. False or absent adds no diversity
requirement.

Acceptance examples use placeholders, never shipped defaults: diversity is
true, the PR-producing implement attempt used `provider-a/model-impl`, and
named models are available within capabilities unless stated otherwise.

| Review preference                     | Fallback       | Host review default                            | Outcome                                                          |
| ------------------------------------- | -------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `provider-a/model-review` (available) | `host-default` | `provider-b/model-host`                        | Switch to the host default for diversity                         |
| `provider-a/model-review`             | `wait`         | `provider-b/model-host`                        | Keep preference; report unavailable diversity without waiting    |
| `provider-a/model-review`             | `host-default` | Missing, provider A, or unavailable provider B | Keep preference; report unavailable diversity without waiting    |
| No policy                             | —              | `provider-b/model-host`                        | Host default satisfies diversity                                 |
| No policy                             | —              | `provider-a/model-host`                        | Keep host default; report unavailable diversity, no scan or wait |

## Triage run

Factory triage uses `triage` on one issue, without an orchestrating agent,
workbench or decision inbox. It only reads: no posts, labels, pushes or fixes.
Its result asks the factory to post its brief or question and apply its chosen
labels, never a `gate:` label.

It applies the contribution guide's inference test with sources recorded only
in the repository: its ADRs, its glossary, and linked issues and their
decisions, each cited with its date. The brief's triage notes list every
inferred answer for the owner to veto, in place of the orchestrating agent's
report. Every other intent question, and any it is unsure of, moves the issue
to `state:grill` with the facts gathered and the open questions. A fact only
an outside reporter holds moves it to `state:reporter`, and one only the owner
holds to `state:owner`, each with its question; whether to close a request
already implemented or rejected before is the owner's. Every outcome carries
the issue's one `type:` label.

A brief it writes with no open question it accepts, as the GitHub rules'
Readiness roles allow, asking for `state:ready` with the labels readiness
needs: one `model:` label it chooses under Model selection and Repository model
policy, within host capabilities, any
`factory:skip` that Skipped work requires, and a `priority:` label as the
GitHub rules' Labels section says.

## Gates

An owner gate holds work only for what the owner alone can do: a credential or
grant only the owner holds, a blocker the owner tracks, or a `gate:` label. The
owner, or a grill at the owner's request, sets a `gate:` label before the work;
triage never sets one. A contract that designates owner review under the
`github-repository-configuration` rules' Designated owner review section gets
`gate:owner-review` with its readiness. A taste call in copy, UI or look is
the owner's intent, which a grill settles before the work under the
contribution guide's Triage section, never a gate.

A `gate:` label on a pull request or its issue stops its review at
ready-to-merge: the pull request is ready for review with its current head
reviewed and its checks passed, its issue waits in `state:owner`, and nothing
merges it until the owner removes the gate. Clearing a gate resumes
automation: a later review merges the pull request without reviewing an
unchanged head again. No merge is manual; an agent always merges.

Skipped work whose live steps need host access stays gated on the
maintainer's grant, as Skipped work says.

## State labels

Factory-profile setup provisions and verifies these labels:

| Label                  | Color    | Description                                                |
| ---------------------- | -------- | ---------------------------------------------------------- |
| `gate:owner-review`    | `e99695` | Waits on the owner's review before its pull request merges |
| `gate:major-release`   | `e99695` | Waits on the owner's go-ahead for a major release          |
| `factory:running`      | `0052cc` | Waits on the factory run that holds it                     |
| `factory:paused`       | `c5def5` | Waits on the factory to resume the run it paused           |
| `factory:failed`       | `b60205` | Waits on a person to deal with the failed run              |
| `factory:skip`         | `c5def5` | Ready agent work the factory must not pick up              |
| `factory:release-hold` | `c5def5` | Hold other merges while a release PR is open               |
| `factory:hold`         | `c5def5` | Pause factory pickups and other merges in this repository  |

Standard-profile setup provisions none. `.scriptorium/config.json` names every
factory-read/written label by role. Only the factory sets `factory:running`,
`factory:paused` and `factory:failed`, creating any missing ones. Running marks
an issue a run holds; paused means the factory resumes its own paused run, so
nobody removes it by hand. After fixing a failure's cause, remove
`factory:failed` to request a retry, subject to pickup gates, never a resumption.
Skip and hold labels follow Skipped work and Repository and release holds.

`state:owner` is for an answer, an account, a credential or a grant only the
owner has, and for work an owner gate stopped.

## Skipped work

Agent work the factory must not pick up gets `state:ready`, one `model:` label
and `factory:skip`, applied together: work that edits `.github/workflows/`, or
work whose live steps need host access the maintainer grants. A directly
launched worker performs the agent work, including the source changes; host
access gates only the live host steps and does not designate owner review of
the source PR. A live-acceptance ticket, blocked by its source ticket, takes
this route and closes only on its recorded live acceptance; a merge never
closes it. The orchestrating agent that asked the maintainer for a
time-bounded host access grant owns it and records the workers using it.
Workers never end a grant: it ends when the last of them reports back, or at
its own time bound. Whoever applies `factory:skip` creates it if the
repository lacks it, as for `model:` labels; the factory never creates or
removes it.

For every skip-labelled PR and every PR opened by a directly launched worker,
including a PR without a skip label, the implementing worker delivers an open PR
and hands it to the orchestrating agent without merging. Worker completion is
the recorded PR handoff, a delivery record under the `comments` rules; the issue
stays open until delivery finishes. The orchestrating agent continues `babysit`
and owns the merge under the contribution guide and applicable review rules.

Apply the `github-repository-configuration` rules' Designated owner review gate
for designation, provenance and current-head approval. The skip marker alone
requires no owner review. While a designated PR waits for that approval, its
issue keeps `factory:skip` in `state:owner` and the PR stays open; once the
approval of its current head is verified and recorded, the issue returns to
`state:ready` and the orchestrating agent resumes `babysit` on the same PR.
Any head change returns it to `state:owner` until renewed approval.

An owner question on skipped work keeps `factory:skip` and the question's
workflow state while unanswered, and the worker or merging agent stops under
the contribution guide's owner-question handoff. Once the issue is back in
`state:ready`, as Questions and stops says, the orchestrating agent resumes or
relaunches the worker, or continues the same open PR from its handoff. This is
not a factory retry and needs no factory pickup.

## Repository and release holds

While any open issue or PR carries configured `labels.hold`, that repository
pauses new pickups and merges; started runs finish without merging.

An expedited change carries the hold on its PR until merge or closure. Transfer
an issue's hold to that PR before merge, labelling the PR before removing the
issue label. Only the merging PR is exempt from its own hold; other labelled
open issues/PRs still hold it. A held repository claims and launches nothing:
new expedited work uses a direct worker or the orchestrating agent outside
factory pickup. An open factory PR may carry the hold and finish through its
exempt merge relaunch.

Babysit's merge check enforces the repository hold as well as the release hold
immediately before merging, including when a hold appears mid-run. For the
repository hold it counts open issues and PRs; the release hold counts open
PRs only. Its hold exit leaves the PR open; a hold is not an owner handoff.

### Release holds

Every factory-repository release PR carries configured `labels.releaseHold`
from opening until merge or closure, holding other PRs' merges. Babysit checks
immediately before every merge write, including mid-run release openings,
orchestrator recovery and handed-off worker PRs. The labelled PR is exempt
from its own hold; merges outside babysit are unaffected by its check.

Babysit reads the hold configuration from the destination default branch at
the same pinned revision as trusted review configuration; proposed PR changes
cannot remove their own hold. Missing configuration or an absent label key
adds no corresponding hold; unreadable or invalid configuration permits no
merge. The check accepts configuration versions 1, 2 and 3.

## External review of factory pull requests

Before requesting or waiting for external review, including after fixes,
rebases, retries and resumed runs, apply optional repository-owned
`.github/factory-review-policy.json` from the pinned destination default-branch
commit under the `github-repository-configuration` rules' trusted review
configuration. Installed `babysit` request/wait commands implement it. Absence
keeps configured reviewer behavior without an owner question; the host never
chooses the repository's reviewer policy.

A policy skip preserves required checks and their waits, internal Standards and
Spec reviews defined by the `github-repository-configuration` rules' Internal
Standards and Spec reviews section, merge authorization, and handling of
findings that arrive. Those rules hold the skip outcome, and the `comments`
rules' Reviews section holds the internal review; the contribution guide's
supplied-credential restrictions still apply.

## Questions and stops

When an agent needs an answer only the owner can give, it follows the
contribution guide's owner-question handoff and moves the issue's workflow
state to whoever must answer: `state:owner` for the owner's answer,
`state:grill` for the owner's intent, or `state:reporter` for a fact only its
outside reporter holds. A factory run asks for that state in its run result.
Work without an issue uses no state label.

An answered question returns the issue to `state:ready`, which resumes the
same work and pull request on a current base, whether the pull request is open
or closed unmerged; the factory never opens a replacement. An answer that
changes the implementation contract first needs the edited revision's
validator notice, independent review and renewed readiness under the
contribution guide; an unchanged contract needs none. Skipped work resumes as
Skipped work says.

An agent that stops without a pull request and without a `state:` stop posts a
stop note on the issue under the `comments` rules.

## Issue closure

When a merged PR's body has an actual closing reference to its still-open
issue, the factory closes the issue and clears its factory state instead of
failing the run. A branch-name match alone grants no authority to close it:
a merged PR without that closing reference that leaves the issue open still
fails the run for good, without a retry. The contribution guide holds the
issue-closing obligations.
