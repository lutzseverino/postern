# Development

This guide describes setup, validation and the source layout for changes to Postern.

## Setup and validation

Use stable Node.js 24 or 26 with its bundled npm, Git 2.18.0 or newer, and
GitHub CLI 2.57.0 or newer for authenticated GitHub operations. Clone the
repository and work on a branch. In a fresh checkout, install the development
dependencies and the pinned standards runtime:

```sh
npm ci --ignore-scripts
npm ci --prefix .repo-standards/runtime
```

Before requesting review, type-check, build and test the package, run the
installed standards checks, and check the whole change for whitespace errors:

```sh
npm run validate
.repo-standards/runtime/node_modules/.bin/repo-standards check
git diff --check origin/main...HEAD
```

`npm run validate` runs `npm run typecheck`, `npm run build` and `npm test`.
The tests run the TypeScript sources directly through Node.js type stripping,
so the sources use only erasable TypeScript syntax. The package tests need the
build, so run `npm run build` before running `npm test` alone. No test reaches
the network: each adapter is tested against a local fake of its platform API.
CI runs the same validation on Node.js 24 and 26 and reports it as the `Test`
check.

For an adoption or update, also verify that the pinned CLI's `status` reports
the run ready to commit. Use its `adopt` command to continue incomplete work.

When changing the factory toolchain image or its workflow, validate the image
with Docker:

```sh
docker build - < .factory/Dockerfile
```

The factory adds Git, GitHub CLI, and its agent layer to that toolchain image.
The pull-request sandbox-image workflow also builds changed images.

## Source layout

```text
src/
├── index.ts         # the public exports
├── detect.ts        # platform detection from a Git remote
├── connection.ts    # connect(), options, and the shared layer every port passes through
├── ports.ts         # the four port types, their facts and capability flags
├── errors.ts        # PlatformError and its reasons
├── secrets.ts       # credential sources and redaction
├── snapshot.ts      # reading each object a caller passes in once
└── github/          # the GitHub adapter and its transport
test/
├── contract/        # the adapter contract suite and its harness
└── github/          # the local GitHub fake, its harness and GitHub-specific tests
```

The shared layer in `connection.ts` checks arguments, enforces capability
flags, and removes credentials from errors and results, so an adapter only
maps its platform's API onto the ports. A new adapter adds a harness over a
local fake of its platform and calls `runAdapterContract` from
`test/contract/suite.ts`. The
[first ADR](../adr/0001-facts-only-ports-with-platform-adapters.md) records
why the ports are shaped this way.

## Index

- [Release procedure](release.md): Publishing a version to npm through trusted publishing, and recovering a failed publication.
