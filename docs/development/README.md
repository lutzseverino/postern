# Development

This guide describes setup and validation for changes to Postern.

## Setup and validation

Postern currently has a repository scaffold with no product implementation,
application dependencies, build command, or product test suite.

Use stable Node.js 24 or 26 for the installed standards checks and delivery
scripts, Git 2.18.0 or newer, and GitHub CLI 2.57.0 or newer for authenticated
GitHub operations. Clone the repository and work on a branch. For a fresh
checkout, install the pinned standards runtime:

```sh
npm ci --prefix .repo-standards/runtime
```

Before requesting review, run the installed standards checks and check the
whole change for whitespace errors:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards check
git diff --check origin/main...HEAD
```

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

There are no additional development documents yet.
