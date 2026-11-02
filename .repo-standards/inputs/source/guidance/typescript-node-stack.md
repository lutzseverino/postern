# typescript-node stack adoption guidance

The `typescript-node-stack` declaration is optional. A repository without a
Project that uses the stack confirms no scope: its rules are not installed and
its check does not run.

## Membership

Settle each Project's membership from the repository's evidence: its
manifests, workspace configuration, lockfile, sources, workflows and
development guide. Do not ask the maintainer unless that evidence leaves
membership open.

- A Project new in this adoption or update joins the stack: include its
  `package.json` and bring it in line with the rules.
- An existing Project that differs from the rules stays out of the scope.
  Exclude it with its differences as the reason, and list each concrete
  difference in your handoff, so that a separate migration ticket brings it
  in.
- A Project that already matches stays in the scope.
- A workspace root that is itself a maintained package with its own
  responsibility and development commands is a Project alongside its members.
  Assess its stack membership independently under the same rules: a differing
  existing root stays out, even when its members match. The presence of members
  alone never excludes it. A root that only supplies shared workspace
  configuration stays excluded. If the evidence does not settle which it is,
  keep root membership unresolved until it does.
- A repository root package without such members is itself a Project,
  including when its `pnpm-workspace.yaml` holds only settings or catalogs.
  Assess it under the same membership and stack requirements as any other
  Project.

Whether or not the root is a Project, shared workspace facts remain at the
root. Keep one manifest per scoped Project and at most one stack per Project;
including a root never assigns its stack to every member.

When no Project is included, confirm no scope, with the reasons for each
exclusion.

## Assessment

Assess each covered Project against the `typescript-node-stack` rules. The
read-only check verifies, for each confirmed `package.json`, that the
workspace root sets `packageManager` to pnpm 11, keeps `pnpm-lock.yaml`, and
limits `engines.node` to Node.js 24 or 26; that the Project or its workspace
root declares oxlint 1 and Prettier 3; and that the Project has a `validate`
script. Assess what the check cannot see:

- TypeScript 7 compiles the Project's TypeScript sources, or type-checks its
  JavaScript sources with `checkJs`;
- its tests run with `node --test`;
- required pull request checks run `validate`, or every step it runs, on each
  of its Node.js majors;
- the development guide's Setup and validation section names these tools;
- the Project uses no other stack.

Cite the evidence for each judgment, such as the `tsconfig.json`, the
`validate` script's steps, and the workflow jobs that the repository requires.

## Supported workspace YAML

The check and scope drafter use a limited YAML reader. The entire
`pnpm-workspace.yaml` document must fit it before its members or catalogs can
be trusted; a supported `packages` list does not make unsupported syntax
elsewhere readable.

The reader supports block mappings, block sequences and flow sequences of
scalars, with plain, single-quoted or double-quoted strings and comments.
A `packages` sequence may be indented or unindented; a flow sequence may span
lines and have a trailing comma. Unrelated settings can contain null, boolean
or numeric scalars, such as `linkWorkspacePackages: true` and
`resolutionMode: 1`; member patterns and catalog versions must still be
strings.

Anchors, aliases, block scalars, flow mappings and a mapping that starts on a
sequence item's line, such as `- enabled: true`, are unsupported, even in
unrelated settings. Tabs, a leading BOM, duplicate keys, malformed indentation
and multiline scalar continuations also make the document unreadable. A quoted
`packages` key is unsupported as well. The reader does not support arbitrary
YAML.

For example, this supported member list still belongs to an unreadable document
because `overrides` uses a flow mapping:

```yaml
packages:
  - packages/*
overrides: {}
```

Rewrite unsupported forms throughout the document, including unrelated
settings. Correcting only the member list cannot resolve unsupported YAML
elsewhere. Until the document is readable, its membership remains unresolved;
do not treat it as an empty, narrower or wider trusted member list.

## Web exclusions

Exclude Sites, Apps and shared web packages with named reasons. Name the
intended `typescript-astro` or `typescript-vite` stack when established;
otherwise retain unresolved/no-stack classification. A Vite-built Site never
falls back to Node. Shared web means only web consumers; a package also used
by a non-web Project remains a Node candidate, assessed independently. Only
in-stack consumers choose a shared package's web stack, with Astro winning
when both apply. Assess maintained roots independently of their members and
keep Node, Astro and Vite scopes disjoint. Follow the
[shared web rules](../rules/typescript-web-stacks.md) for the web boundary.
