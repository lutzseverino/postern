# Discover typescript-astro stack scope

`repo-standards adopt` runs this declaration's read-only discovery script during
inspection. Its proposed `scope:typescript-astro-stack` answer lists one
`package.json` per Project, with evidence and named reasons for inclusion or
exclusion. No included Project proposes `noScope: true`; unresolved questions
must be settled before confirmation. Nobody runs the drafter by hand.

The drafter reads kept manifests, workspace patterns and catalogs, framework
configuration, source behavior and package descriptions or READMEs. It proposes
Astro Sites and Vite Apps from semantic evidence, never Vite alone. It follows
workspace dependency edges for shared web packages and centralized shadcn
holders. A mixed web/non-web consumer package stays outside web stacks; only
in-stack consumers choose Astro over Vite. A no-stack Vite-built Site is
excluded from every stack, and an uncertain web package is never a Node fallback.
A package with no known in-stack consumers remains unresolved.

A maintained workspace root is independently a Project alongside members;
a shared-only root is excluded. Root membership does not depend on conformity.
Standalone and catalog-only roots are Projects. Fixtures, generated output and
vendored packages are excluded unless an outside workspace lists them.

Review both membership and the rules the manifest check cannot see, following
[adoption guidance](../guidance/typescript-astro-stack.md). A matching Project
is proposed; a differing existing Project stays out with differences named
until a separate migration. Remove unresolved questions only with recorded
evidence; return remaining owner intent through the orchestrator. Confirmed
Node, Astro and Vite scopes must be disjoint. Including a Project removes
`noScope`; excluding every Project retains it. The maintainer's adoption request
authorizes the reviewed scope; ask for confirmation only when `adopt` asks.
