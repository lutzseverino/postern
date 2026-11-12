# Agent guidance

Before changing this repository, read `CONTRIBUTING.md`.
Read `docs/agents/project.md`, when present, for repository-specific constraints.

For setup and validation commands, read `docs/development/README.md`.

Deliver every change as one pull request: `implement`, then `review` in a
separate agent when configured, as `CONTRIBUTING.md` directs.

## Agent skills

Before handing work to another agent, subagent or session, check whether an
installed skill covers it. This includes implementation workers delegating
ticket subwork without invoking `orchestrate` or `triage`, and heavy reads.
When covered, invoke that skill using the session's supported invocation
mechanism, followed by task context. When no installed skill covers the work,
pass task context only.

Task context includes issue links, evidence, recorded decisions, scope,
workspace and plan references, report-back destinations and task-specific
delivery obligations. Keep procedure and question format with the invoked skill.

Where session naming is supported, name sessions you launch or own for their
operation and target. Otherwise, continue without naming. Keep naming metadata
outside the skill invocation and task context.

### Issue tracker

Issues, specifications, and tickets live in GitHub Issues, worked with the `gh`
CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The canonical triage roles map to Repo Canon's `state:` labels. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context by default: a root `GLOSSARY.md` and `docs/adr/`; a root
`GLOSSARY-MAP.md` makes it multi-context. See `docs/agents/domain.md`.
