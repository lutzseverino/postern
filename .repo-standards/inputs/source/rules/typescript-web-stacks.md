# TypeScript web stack rules

These shared rules cover each Project in the confirmed scope of
`typescript-astro-stack` or `typescript-vite-stack`, named by its `package.json`.
A Site builds pages ahead of time from content or build-time data, with
interactive islands at most. An App renders its interface in the browser with
client-side code that owns routing and state. Apps choose their own router.

## Tools and majors

| Tool                | typescript-astro (Sites)                      | typescript-vite (Apps)                 |
| ------------------- | --------------------------------------------- | -------------------------------------- |
| Framework           | Astro 7                                       | Vite 8 with React                      |
| UI                  | React 19, Tailwind CSS 4, shadcn CLI 4        | React 19, Tailwind CSS 4, shadcn CLI 4 |
| TypeScript          | 6, checked with `astro check`                 | 7                                      |
| Lint and format     | oxlint 1, Prettier 3, `prettier-plugin-astro` | oxlint 1, Prettier 3                   |
| Tests, when present | `node --test`                                 | Vitest 5                               |
| Runtime and manager | Node.js 24 or 26, pnpm 11                     | Node.js 24 or 26, pnpm 11              |

No ESLint. Tests are not required; a testless App needs no Vitest declaration.
When tests exist, correct a different runner or runner major. Sites stay on
TypeScript 6 until `@astrojs/check` accepts 7; that advance is a breaking
standards change. Shared packages inherit their consumers' stack without
requiring redundant framework installations or configuration of their own.

Set workspace-root `packageManager` to `pnpm@11.x.y`, keep `pnpm-lock.yaml`
there and limit `engines.node` to Node.js 24 or 26. Declare oxlint 1 and
Prettier 3 in the Project or workspace root; make the Astro formatter plugin
available for Sites. Each Project has a `validate` script running its checks,
including `astro check` for Sites and `ui:check` for UI holders.

Required pull request jobs together run every step of `validate` on each
supported Node major. The development guide's Setup and validation section
names the tools. One Project uses at most one stack; moving a tool to a new
major is breaking. Install no configuration or workflow file: each Project
owns these and its integrity script.

## shadcn

Every Site and App uses shadcn, directly or through an evidenced workspace
holder. A shared package without `components.json`, such as a non-UI design
package, needs no independent registry, shadcn pin or `ui:*` scripts. For
workspace consumers the following requirements live at the package holding
`components.json`; do not duplicate registries in consumers.

1. Create `components.json` with the pinned shadcn CLI, an exact major-4
   devDependency. Add or refresh components only through `ui:add` and
   `ui:update` scripts invoking that CLI. Set `style` to `base-*` (Base UI)
   and `iconLibrary` to `lucide`. The visual style after `base-` belongs to
   the Project.
2. Keep unmodified registry output in `components/ui/`. A checksum manifest
   records every file, `ui:check` fails on differences, and `validate` runs
   that check. Never edit, format or rename generated output by hand.
3. Pages import through `components/app/`. An unchanged component is a one-line
   re-export. A wrapper exists only for a shared invariant and preserves props,
   ref, `className` and composition, duplicating as little as possible.
4. Use a shadcn component wherever one fits. Write a custom component only when
   the registry has nothing for the job; keep it outside `components/app/`.
5. Apply effects shared by every component of a kind through its `data-slot`
   in a stylesheet, without changing generated files or each call site.
6. Colour tokens live in `:root` and `.dark`; the `.dark` class switches the
   theme. The colour theme is the Project's own.

## Membership and workspaces

Use Site/App semantics and repository evidence, not the build tool alone.
Astro configuration with an Astro dependency evidences a Site. Vite with
React is candidate App evidence, not proof. A Vite-built Site belongs to no
stack until separately brought into conformity; preserve its build and never assign Node as
fallback. Unknown web membership stays unresolved.

A shared web package is used only by web Projects. A package with a non-web
consumer is not a shared web package. Only in-stack consumers choose a shared
web package's stack: an Astro Site makes it Astro, including when a Vite App
also uses it; otherwise a Vite App makes it Vite. A no-stack Site does not
compete. With no known in-stack consumers, keep the proposal unresolved.

A maintained workspace root with its own responsibility and commands is a
Project alongside its members. Assess its membership independently; a
shared-only configuration root is not a Project. A standalone root remains a
Project, including when workspace YAML holds only settings or catalogs. Read
shared package-manager, lockfile and runtime facts at the workspace root for
each covered Project, whether or not the root itself is a Project.
