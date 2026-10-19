# Documentation rules

Documentation categories are `usage`, `development`, `adr`, and `agents` under
each applicable documentation root. Create a directory when it has content.
The categories hold:

- usage: using, configuring, and integrating the product.
- development: building, testing, architecture, and maintenance.
- adr: consequential decisions and their rationale.
- agents: agent workflow configuration.

Every documentation directory has a README index: a one-sentence purpose, then
one `[Title](path): description` item per entry. List each document under a
documentation root in exactly one index: its directory's README, or for a
directory README, its parent's. Other documents link to that index or cite a
document in context, and never repeat the list. The installed
`docs/agents/README.md` stays as is and cites the optional
`docs/agents/project.md` in context. Project-specific agent constraints belong
in that optional file, governed by the `project-agent-guidance` rules.
In the root documentation README, each
category README's description states what belongs in that category. Keep
durable research with its usage or development topic. Glossaries remain outside
`docs`, at the repository or context root.

The root usage index, `docs/usage/README.md`, is a newcomer entry document. Its
one-sentence purpose says what the project is and who it is for, before anything
else. It contains no term defined in the repository's root `GLOSSARY.md` or in a
context glossary listed in its `GLOSSARY-MAP.md`, matched case-insensitively as
a whole word; a hyphen-joined compound, such as `on-demand`, is one word. For a
standards source or another tool applied to a repository, explain what adopting
it changes. Define a project-specific term before using it anywhere in this
index, as in the `repository-readme` rules.

The root `docs/development/README.md` is required because `CONTRIBUTING.md`
links to it. It gives its purpose, then a Setup and validation section, then its
index. Its Setup and validation section states the project's real prerequisites,
setup, development commands, and required validation, or links the development
documents that contain them.

Documentation holds maintained material only. A point-in-time record, such as
an account of one release, adoption, or validation run, stays with the pull
request, release, or CI run it records, and documents cite it by identity, such
as a tag, run ID, or commit permalink. An adoption or update pull request
carries the tool's summary, a release carries its notes and any machine-readable
records as release assets, and bulk raw output remains a CI artifact. CI
artifacts expire, so base each conclusion on a lasting record, such as a pull request
summary or a release asset. There is no evidence documentation category. Delete
a superseded document other than an ADR rather than keeping it under a
historical label, and repair the links to it.

An ADR is never deleted. When a later ADR supersedes it, keep it and mark it
superseded, naming and linking the superseding ADR. A superseded ADR is
maintained material, not a point-in-time record.
