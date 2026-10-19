# Factory workflow adoption guidance

Confirm an intentionally empty scope for `factory-workflow`: no content paths
or directories. Adoption installs its rules for the whole repository.

When updating from a release that kept factory policy in `CONTRIBUTING.md`,
review the installed `factory-workflow` rules as the new home of parent
readiness, model selection, state labels, owner handoff and recovery, stop
notes, and the factory consequence of leaving an issue open after merge.
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
