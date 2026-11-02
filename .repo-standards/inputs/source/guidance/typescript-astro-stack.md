# typescript-astro stack adoption guidance

The optional `typescript-astro-stack` declaration confirms one `package.json`
per Project, or no scope when no Project matches. No scope installs no rules
and runs no check. Apply the [shared web rules](../rules/typescript-web-stacks.md).

## Membership

Establish Site/App semantics, workspace membership and each Site/App's shadcn
holder from manifests, source behavior, configuration and documentation.
Framework tools alone do not prove App membership. Review the drafter's
candidates and unresolved questions. A maintained root is assessed independently
of its members; a shared-only root supplies workspace facts. Standalone roots,
including catalog-only roots, remain Projects.

New Projects join the stack they fit. Existing differing Projects stay excluded
with every difference recorded in the handoff for a separate migration. Do not
migrate them incidentally. A Vite-built Site stays outside all stacks; preserve
its build. Shared web packages have only web consumers; a non-web consumer
keeps a package out of both web stacks. Only in-stack consumers decide between
Astro and Vite, with Astro winning when both apply. Unknown or absent in-stack
consumers leave membership unresolved. Keep all three stack scopes disjoint.
Settle questions from repository evidence, returning any remaining owner-intent
question through the orchestrator.

## Check and assessment boundary

The read-only check verifies Node's package-manager, lockfile, engines,
oxlint, Prettier and per-Project `validate` facts. It also checks the Astro
formatter plugin's availability for Sites and shadcn at the evidenced holder:
`components.json`, `base-*`, lucide, an exact major-4 shadcn devDependency and
`ui:add`, `ui:update`, `ui:check`. A Site/App without a holder fails. A shared
package without UI needs no registry or scripts of its own. Workspace dependency
edges evidence a centralized holder without duplicate consumer registries;
confirm that relationship contextually. Default/named catalogs resolve tools
and exact pins; unresolved catalogs produce named corrections. The supported
YAML forms are the same as the [Node guidance](typescript-node-stack.md#supported-workspace-yaml).

Assess framework, React, Tailwind, TypeScript and runner majors separately,
including correcting the runner when tests exist. Tests are not required and
a testless App needs no Vitest. Inspect actual `astro check` and `ui:check`
execution through `validate`, required CI coverage on supported Node majors,
and Setup and validation. Assess generated-output integrity, wrapper behavior,
`data-slot` styling, theme ownership, and the rest of the shared rules. The
manifest check does not resolve framework requirements through consumers and
does not prove these assessed requirements. Cite evidence for each judgment.
