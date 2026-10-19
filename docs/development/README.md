# Development

This guide describes how to set up and validate changes to Postern.

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

## Index

- [Source layout](source-layout.md): Where the shared layer, the ports, each adapter and the contract suite live.
- [Release procedure](release.md): Publishing a version to npm with provenance, including the first publication, and recovering a failed publication.
