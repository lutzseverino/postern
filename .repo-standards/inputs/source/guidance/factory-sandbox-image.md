# Factory toolchain image adoption guidance

The `factory-sandbox-image` declaration permits the canonical
`.scriptorium/Dockerfile`, `.factory/Dockerfile` and `.factory/config.json` paths.
Complete migration within this adoption/update run:

1. If `.scriptorium/Dockerfile` exists, retain its bytes. Otherwise, when
   `.factory/Dockerfile` exists, move it byte for byte to the canonical path.
2. Delete both legacy files, including edited legacy config, and remove the
   now-empty `.factory/` directory. If it contains unknown files, leave them
   untouched and report the assessment as blocked: their deletion is outside
   this declaration's permitted targets. Canonical content wins when both layouts
   exist; no migration conflict stop or content merge is needed. The separate exact-file declaration
   installs `.scriptorium/config.json`, with normal exact-file confirmation.
3. On a fresh adoption with neither Dockerfile, create the canonical toolchain
   file following the rules below. A migrated or existing canonical Dockerfile
   retains its bytes; assess any toolchain defect separately rather than
   regenerating content to accomplish this move.

Before the migration PR merges, read the legacy config from the pre-update
snapshot and confirm that no open issue or pull request carries either label
named by `labels.hold` or `labels.releaseHold`. Record the labels, query and
absence in the PR. The delivery helper reads only canonical configuration from
the trusted base, so a legacy-only base supplies no holds during this window.
Leave CLI-owned state to the CLI; no manual pre/post-run deletion is required.
The explicit file targets avoid public CLI 10.0.0's directory-removal readiness
defect ([repo-standards #497](https://github.com/lutzseverino/repo-standards/issues/497)).

When creating a fresh canonical file and the repository still has a
`.sandcastle/Dockerfile` from an earlier Repo Canon release, use its toolchain
lines, the lines after Repo Canon's base, following the rules for the base and
delivery runtime.
Leave out the old base's agent tooling and user setup.

If the toolchain needs a different Node.js major from the one the installed
`babysit` scripts support, ask the maintainer how to provide both requirements,
and assess the declaration as `blocked` until they answer. When the development
guide names a tool without enough detail to install it, such as a missing
version that matters, ask the maintainer, and assess the declaration as
`blocked` until they answer.

Assess `factory-sandbox-image` as `satisfied` once the file meets its rules,
citing the development guide's lines for each toolchain tool and the installed
`.agents/skills/babysit/SKILL.md` for Node.js. No check reads the file; whether
it installs the right toolchain is an agent judgment.

The installed `sandbox-image` workflow builds `.scriptorium/Dockerfile` on standard
input without a build context on pull requests that change the Dockerfile or
the workflow. A failing toolchain command fails the job. The workflow builds
only the toolchain image and runs nothing inside it.
