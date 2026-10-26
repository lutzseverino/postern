# Development

This guide describes how to set up and validate changes to Postern.

## Setup and validation

Use stable Node.js 24 or 26 with pnpm 11.28.8, Git 2.18.0 or newer, and
GitHub CLI 2.57.0 or newer for authenticated GitHub operations. Clone the
repository and work on a branch. In a fresh checkout, install the development
dependencies and the pinned support runtime:

```sh
pnpm install --frozen-lockfile
npm ci --prefix .repo-standards/runtime
```

Before requesting review, validate the package, run the
installed support checks, and check the whole change for whitespace errors:

```sh
pnpm validate
.repo-standards/runtime/node_modules/.bin/repo-standards check
git diff --check origin/main...HEAD
```

`pnpm validate` runs the typecheck (TypeScript 7), lint (oxlint 1), format
check (Prettier 3), build and tests (`node --test`), in that order. Run
`pnpm format` to apply formatting and `pnpm lint` to check code. The lint and
format configurations exclude generated, vendored and installed support files.
The `pnpm-workspace.yaml` setting disables esbuild's install script; its
optional platform package supplies the build executable.
The tests run the TypeScript sources directly through Node.js type stripping,
so the sources use only erasable TypeScript syntax. The package tests need the
build, so run `pnpm build` before running `pnpm test` alone. No test reaches
the network: each adapter is tested against a local fake of its platform API.
CI runs the same validation on Node.js 24 and 26 and reports it as the `Test`
check.

The property tests in `test/property/` generate caller inputs and changed
GitHub responses from a seed. They use a fixed seed, so every run, CI's
included, tests the same cases. To explore other cases, set
`POSTERN_PROPERTY_SEED` to a number or to `random`, and optionally
`POSTERN_PROPERTY_RUNS` to the number of cases per property (200 by default):

```sh
POSTERN_PROPERTY_SEED=random POSTERN_PROPERTY_RUNS=1000 node --test "test/property/*.test.ts"
```

A failing case names its seed and case number. Rerun it with that seed.

For an adoption or update, also verify that the pinned CLI's `status` reports
the run ready to commit. Use its `adopt` command to continue incomplete work.

When changing the factory toolchain image or its workflow, validate the image
with Docker:

```sh
docker build - < .factory/Dockerfile
```

The factory adds Git, GitHub CLI, and its agent layer to that toolchain image.
The pull-request sandbox-image workflow also builds changed images.

## Index

- [Source layout](source-layout.md): Where the shared layer, the ports, each adapter and the contract suite live.
- [Release procedure](release.md): Publishing a version to npm with provenance, including the first publication, and recovering a failed publication.
