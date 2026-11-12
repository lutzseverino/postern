# Factory workflow adoption guidance

Confirm an intentionally empty scope for `factory-workflow`: no content paths
or directories. Adoption installs its rules for the whole repository.

## Host compatibility

The shipped `.scriptorium/config.json` is configuration version 3. Only
Scriptorium v4 accepts it, and no released host does yet: Scriptorium v3
refuses it and pauses the repository. Deliver this adoption only once the
serving host's release accepts it, updating the repository and its host
together.

Version 3 replaces version 2's single `skill` and `arguments` with
`runKinds`, which turns on `triage`, `implement` and `review` and maps each to
the skill of the same name. Each kind's `arguments` names its work: `#{issue}`
for triage and implement, and `#{pullRequest}` for review. Review sets `differentProvider`; execution choices live outside exact
mechanics. Host configuration supplies capabilities, credentials and per-kind
defaults, including implement retry. The optional repository-owned
`.github/factory-model-policy.json` supplies preferences and explicit fallback
under the factory-workflow rules; the issue label selects initial implement
only unless another stage explicitly selects its reuse. `labels`
names every label the factory reads or writes by role, in the `state:`,
`gate:`, `factory:` and `priority:` families, with no role for answers a run
waits on. `contractResult` stays the issue-contract workflow's result, with
`marker` `repo-canon:issue-contract-state` and `author`
`github-actions[bot]`. `triageResult` names the marker and account of the
factory's triage result, which the issue-contract validator reads to approve
readiness the triage run applies. There is no factory configuration
compatibility layer.

The `babysit` merge check reads only labels from the destination default
branch's configuration. It accepts versions 1, 2 and 3, so an adopter still on
version 2 can deliver this update while retaining its hold checks. The factory
profile installs the `factory` skill for ongoing operations, including pause
and resume through the repository hold.

## App-author policy opt-in

Read the previous adoption record before the run changes it. Ask only when
the selected profile is factory and the previous adoption record did not
already select factory. A first adoption and a switch from standard to factory
both ask; routine updates of existing factory adopters do not ask again.
Standard-only runs never receive this factory-specific question.

Ask the repository's maintainer: "After this adoption is delivered, do you want
to install the optional app-author review policy? If yes, which app identity
does this repository name as its author?" Explain that matching app-authored
PRs skip external review requests and reviewer waits while retaining required
checks, internal Standards and Spec reviews, merge authorization and handling
of findings that arrive. Record the answer with the run. Preserve any existing
deliberate policy unchanged; this question never replaces it or silently opts
the repository in.

On no, leave the policy absent if absent. On yes, after the adoption run
completes and its adoption PR is delivered, install the repository-named
configuration in a separate commit, outside the adoption commit and adoption
PR. Use the version-1 schema in the
[app-author policy rules](../rules/github-repository-configuration.md#factory-app-author-review-policy)
and validate it with the read-only `factory-review-policy` check. The repository
supplies the app identity: do not copy an identity from this source or another
repository, choose a preset or perform a remote account lookup. Missing or
invalid identity is not authorization to install a policy. Existing policies
remain untouched; invalid or unreadable configuration fails explicitly under
the rules and never authorizes a skip.

This opt-in is post-run repository configuration, not a file declaration or
adoption output. Adoption neither creates nor edits the policy file or
`.github/pull-request-reviewer.json`. Policy absence remains supported.

## Workflow reconciliation

When updating from a release that kept factory policy in `CONTRIBUTING.md`,
review the installed `factory-workflow` rules as the new home of run kinds
and their handoffs, gates, parent readiness, model selection, state labels,
questions and stops, and the factory consequence of leaving an issue open
after merge.
The exact contribution guide is replaced by adoption; preserve useful
repository-specific instructions through `project-agent-guidance` rather than
copying factory policy back into it.

Assess `factory-workflow` as `satisfied` once the installed rules and the
repository's tracker workflow agree, citing the reviewed workflow and any
reconciliation. A repository with no current tracker activity can cite that
absence and the installed rules. If an unresolved workflow conflict prevents
conformance, assess it as `blocked` and explain the conflict. Confirm scope
validity after fixes and again after contextual work: it stays empty because
the declaration governs work, not project content.

## Repository model policy configuration

The read-only `factory-model-policy` check validates optional policy structure
using retained resources without network or host access. Absence retains host
defaults. Adoption never installs policy values or declares the policy file as
owned content. Preserve existing bytes on adoption, update, removal and
re-adoption; invalid data fails validation rather than being repaired.

A maintainer may deliberately configure or change the policy in a separate
post-adoption commit, outside the adoption PR, using the authoritative
Repository model policy contract in the factory-workflow rules. Never seed it
from source examples, fixtures, another repository or generated output. No
policy values are chosen for this source itself. Scriptorium v4 resolves the
contract within host capabilities; deploying it and proving real runs are
separate from this source change.
