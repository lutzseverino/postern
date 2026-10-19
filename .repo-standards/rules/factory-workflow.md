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
labels: `ready-for-agent` is the ready label, an agent adds
`factory:needs-input` with its question, and the factory adds `factory:running`
while it holds an issue, `factory:failed` after a run fails for good, and
`factory:paused` when it pauses a run. `factory:paused` means the factory
paused the run and resumes it by itself, and its comment on the issue says why,
so nobody removes the label by hand. Remove `factory:failed` to run the issue
again once its failure note or the factory's comment is dealt with.

## Owner handoff and recovery

When an agent needs an answer only the owner can give, follow the contribution
guide's owner-question and comment rules and add `factory:needs-input` to the
issue. Work without an issue uses no factory state label.

With no open pull request, the owner answers and removes the label to return
the issue to the frontier as a fresh first attempt. While the run's pull request
is open, removing the label starts no run in a repository a factory serves.
The owner either finishes the pull request by merging it, for example after
pushing the refused change, and ensuring the issue is closed under the
contribution guide's pull request rules, or hands it back: close it before
removing the label, wait for `factory:running` to disappear, then remove the label so a
fresh first attempt continues its branch.

An agent that stops without a pull request and without a question under
`factory:needs-input` comments one short paragraph on the issue explaining why
it stopped, in its own words. Never paste log output, environment values or
tokens into that note: this repository and repositories that adopt these rules
may be public.

## Issue closure

A merged pull request that leaves its issue open fails the factory run for
good, without a retry. The contribution guide holds the issue-closing
obligations.
