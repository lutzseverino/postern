# Factory workflow rules

These rules apply to all work in a repository a factory serves, including
tracker work that changes no file. The contribution guide holds the general
implementation contract, readiness, owner-question, credential, comment and
pull request requirements.

## Parent readiness

A parent (a specification or any issue with sub-issues) never runs; its
readiness releases its tickets, which each also need their own readiness. Apply the parent's
readiness after its tickets are published, and again when a ticket is
published later. To re-apply readiness the parent still carries, remove
`ready-for-agent` and add it back. Apply that readiness only once the latest
ticket link appears in the parent's timeline. Readiness recorded in the same
second as that link holds the tickets; the factory's skip reason says to remove
`ready-for-agent` and add it back.

## Model selection

The factory picks up ready issues and runs each ticket on its own. In a
repository a factory serves, whoever applies `ready-for-agent` to a non-parent
issue must apply exactly one `model:` label they chose, before readiness or
together with it, even when it names the host's default model. A parent needs
no `model:` label of its own, and `ready-for-human` needs none.

Choose a stronger model when the work needs design judgment, has an ambiguous
scope, or makes a long cross-cutting change. Name the chosen model with
`model:<slug>` or `model:<provider>/<slug>`, optionally followed by
`@<effort>`; create the label if the repository lacks it. A `claude-*` or
`gpt-*` slug needs no provider.

For a non-parent issue in a repository a factory serves, the triage notes after
its Agent Brief suggest one `model:` label with a one-line reason, for the
reviewer to apply or replace. The suggestion is a triage note, not a field of
the brief. An orchestrating agent that accepts the brief is that reviewer: it
chooses the label itself, weighing the suggestion, and the research run that
suggested it applies no label.

The factory runs an unlabelled ticket on the host's default model; a parent's
label chooses none of its tickets' models.

The factory accepts readiness only from a person. Readiness that an agent's
tool applies through a GitHub App or bot account never starts a run, so the
issue waits until a person applies readiness. An orchestrating agent working
through such an account tells the owner, with links, that the brief it accepted
waits for a person's readiness, even when its own readiness stands under the
GitHub rules. It never reports that its own readiness started a run.

## State labels

In a repository a factory serves, `.factory/config.json` names the factory's
labels: `ready-for-agent` is the ready label, `factory:skip` marks ready agent
work the factory must not pick up, an agent adds `factory:needs-input` with its
question, and the factory adds `factory:running` while it holds an issue,
`factory:failed` after a run fails for good, and `factory:paused` when it
pauses a run. `factory:paused` means the factory paused the run and resumes it
by itself, and its comment on the issue says why, so nobody removes the label
by hand. Remove `factory:failed` to run the issue again once its failure note
or the factory's comment is dealt with.

`ready-for-human` is only for work that needs the owner's own accounts or
credentials, or a taste call the owner reserved for themselves. Agent work the
factory must not pick up gets `ready-for-agent`, one `model:` label and
`factory:skip`, applied together: work that edits `.github/workflows/`, or work
the owner reviews before merge. Whoever applies `factory:skip` creates it if
the repository lacks it, as for `model:` labels; the factory never creates or
removes it. An agent working on the owner's account implements skip-labelled
work, and the orchestrating agent merges it; when the owner reviews the work
before merge, the orchestrating agent merges it after the owner's review.

For every skip-labelled PR, the implementing worker delivers an open PR and
hands it to the orchestrating agent without merging. Worker completion is the
recorded PR handoff; the issue stays open until delivery finishes. The handoff
records the PR's current head, validation and internal review outcomes,
outstanding findings, and any owner-review requirement with its source. The
orchestrating agent continues `babysit` and owns the merge under the
contribution guide and applicable review rules.

Owner review is required when either the accepted brief or the worker's handoff
says so. Read both sources; an omission in one does not cancel a designation in
the other. Carry that designation and its source into the PR handoff. The skip
marker alone requires no owner review; without a designation, the orchestrating
agent merges under the ordinary applicable conditions.

Before merging a designated PR, the orchestrating agent verifies the owner's
explicit approval of the current head. Record the approval's source and head
SHA on the PR. Any head change requires renewed owner approval; approval of an
earlier head does not authorize the new one. Passing checks, a configured
external review, its absence or timeout, and an app-author review-policy skip
never substitute for owner approval. When approval is missing, follow the
contribution guide's owner-question handoff and leave the PR unmerged.
For this approval pause, keep the PR open, retain `factory:needs-input` and
`factory:skip` on its issue, and preserve the orchestrating agent's merge
ownership. After verifying and recording current-head approval as above, the
orchestrating agent removes `factory:needs-input` and resumes `babysit` on the
same open PR, merging only when all other applicable merge conditions hold.
Any head change returns to this approval pause until renewed approval is
verified and recorded. This continuation requires neither owner merge, PR
closure nor factory pickup.

## External review of factory pull requests

Before requesting or waiting for external review, apply the optional
repository-owned `.github/factory-review-policy.json` under the
`github-repository-configuration` rules' trusted review configuration,
selected from the destination default branch at a pinned commit, including
after fixes, rebases, retries and resumed runs. The installed `babysit` request and wait commands
implement that policy. Without a declaration, keep configured reviewer
behavior; absence needs no owner question. The host does not choose a
repository's reviewer policy.

A policy skip preserves required checks and their waits, internal Standards
and Spec reviews defined by the `github-repository-configuration` rules'
app-author policy, merge authorization, and handling of findings that arrive.
Those rules hold the skip outcome wording and internal review record;
the contribution guide's supplied-credential restrictions still apply.

## Owner handoff and recovery

When an agent needs an answer only the owner can give, follow the contribution
guide's owner-question and comment rules and add `factory:needs-input` to the
issue. Work without an issue uses no factory state label. The question reaches
the orchestrating agent first, as those rules say: it answers on the issue when
the triage inference test lets it, and otherwise puts the question in its
decision inbox for the owner.

An agent that stops without a pull request and without a question under
`factory:needs-input` comments one short paragraph on the issue explaining why
it stopped, in its own words. Never paste log output, environment values or
tokens into that note: this repository and repositories that adopt these rules
may be public.

### Skipped work

For every owner question on skipped work, retain the skip marker and
`factory:needs-input` while unanswered. The current worker or merging-agent
run stops under the contribution guide's owner-question handoff.

For the designated skipped-PR approval pause, follow State labels for
continuation. Answering another question does not satisfy that approval
requirement: keep both markers until explicit current-head approval is verified
and recorded with its source and SHA, as State labels requires.

If the answer changes the implementation contract, edit the contract and have
that exact revision independently reviewed and granted renewed readiness under
the contribution guide and the `github-repository-configuration` rules,
including the validator revision notice before readiness is applied. With or
without an open PR, implementation
and delivery wait for that renewed readiness. Resolving the question or
removing `factory:needs-input` does not authorize continuation on an unreviewed
revision. Renewed readiness does not substitute for designated current-head
owner approval under State labels.
If the answer leaves the contract unchanged, no new readiness cycle is required.

Once the question is resolved and any required renewed readiness is recorded,
the orchestrating agent removes `factory:needs-input` and continues the skipped
work. With no open PR, it resumes
or relaunches the implementing worker. With an open PR, it resumes that same PR,
arranging any remaining worker work and continuing delivery from the prescribed
handoff. The worker still hands off without merging; the orchestrating agent
owns `babysit` and the merge as State labels prescribes. Removing the waiting
marker alone is not a factory retry for skipped work. This recovery requires
neither factory pickup, owner merge nor closing an open PR for hand-back.

### Ordinary factory runs

This recovery applies only to non-skipped factory runs.

With no open pull request, whoever answers, the orchestrating agent or the
owner, removes the label to return the issue to the frontier as a fresh first
attempt. While the run's pull request is open, removing the label starts no
run in a repository a factory serves, and the owner, even after the
orchestrating agent answers, either finishes the pull request by merging it, for example after
pushing the refused change, and ensuring the issue is closed under the
contribution guide's pull request rules, or hands it back: close it before
removing the label, wait for `factory:running` to disappear, then remove the label so a
fresh first attempt continues its branch.

## Issue closure

A merged pull request that leaves its issue open fails the factory run for
good, without a retry. The contribution guide holds the issue-closing
obligations.
