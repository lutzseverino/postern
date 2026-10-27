# typescript-node stack rules

These rules cover each Project in the confirmed scope, named by its
`package.json`. A Project is a maintained CLI, library, or tool with its own
manifest.

## Tools and majors

A covered Project uses:

- pnpm 11 as its package manager, with `packageManager` set to `pnpm@11.x.y`
  and `pnpm-lock.yaml` at the workspace root;
- Node.js 24 or 26, with `engines.node` admitting only those majors, such as
  `>=24 <25 || >=26 <27` or `^24.0.0 || ^26.0.0`;
- TypeScript 7, as the compiler of its TypeScript sources or as the type
  checker of its JavaScript sources through `checkJs`;
- oxlint 1 for linting and Prettier 3 for formatting, declared as dependencies
  of the Project or its workspace root;
- Node's test runner, `node --test`, for its tests;
- a `validate` script in its `package.json` that runs its checks.

## Workspaces

Workspace members are Projects. A workspace root that is itself a maintained
package with its own responsibility and development commands is also a
Project alongside its members. A root that only supplies shared workspace
configuration is not a Project. Establish membership from repository evidence;
the presence of members or conformity to this stack alone does not decide it.
Assess each Project's stack membership independently, including the root's.

Facts a workspace shares, `packageManager`, the lockfile and `engines`, are
set at the workspace root, not in each member, and each Project's check reads
them there, whether the root is itself a Project or shared-only configuration.
A package outside any workspace is its own workspace root and its
own Project. This includes a repository root package without workspace
members, even when its `pnpm-workspace.yaml` holds only settings or catalogs.
It is subject to the same stack requirements as any other Project.

## Pull request checks

Required pull request checks run `validate` on each of the Project's Node.js
majors. Either one job runs the script, or required jobs together run every
step it runs, for example as shards. A step that runs only in a job that is not
required, or only on pushes, does not count.

## Documentation

The development guide's Setup and validation section, which the
`documentation` rules define, names these tools, so the factory image follows
them.

## Scope

A Project uses only this stack. Moving any of these tools to a new major is a
breaking standards change. The stack installs no configuration file and no
workflow file; each Project keeps its own `tsconfig.json`, linter and formatter
configuration, and workflows.
