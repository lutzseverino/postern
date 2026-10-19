# Project agent guidance adoption guidance

Read the `AGENTS.md` that adoption replaced from `HEAD`, for example with
`git show HEAD:AGENTS.md`. If `HEAD` has no `AGENTS.md`, there are no replaced
instructions to recover.

Keep its useful repository-specific agent constraints in
`docs/agents/project.md`, reconciled with any existing content and the
`project-agent-guidance` rules. Preserve their meaning and adjust relative
links for the file's location. Create the file only when such instructions
exist.

If a repository-specific instruction contradicts the standard, ask the
maintainer to resolve it and assess this declaration as blocked until they
answer. Then reconcile the instruction with their decision.

Assess the declaration as satisfied when the useful repository-specific
instructions are preserved and the file meets its rules, or when there are
no such instructions and the file is absent.
