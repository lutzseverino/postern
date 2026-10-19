# Discover GitHub repository configuration scope

This declaration changes remote GitHub configuration through its authored
fixes and checks optional repository-owned reviewer data without writing it.
Propose no project-content paths or directories. Explain that the
empty contextual scope is intentional and disclose any unresolved uncertainty
about the repository identity or whether remote configuration is authorized.

Read the repository's visibility and its repository-level `REPO_CANON_RUNS_ON`
variable through authenticated `gh` access, for example:

```sh
gh repo view --json visibility
gh variable list --json name,value
```

Report the visibility and whether the repository-level variable is absent,
empty, or set to its observed value. For the assessment, classify absent or
empty as **unset** (the hosted default), a valid non-empty JSON array of
non-empty label strings as **valid** (list its labels), and every other value
as **invalid** (state why). Invalid JSON or an unusable `runs-on` value fails
every installed job during GitHub's runner evaluation, before any steps run.
The expression does not validate the array schema: parsed falsy JSON such as
`false`, `0`, `null`, or `""` also selects the hosted default. Classify these
as invalid regardless of that runtime result; do not call invalid values a
supported fallback.

An organization-level variable can supply the value when the repository-level
one is absent; a repository-level value takes precedence. If an inherited
organization-level value cannot be read, disclose that uncertainty rather
than asserting the effective runner is `ubuntu-latest`. The installed jobs
use no environments. Read and report only: neither discovery nor assessment
sets, changes, or deletes the variable or any remote configuration.
