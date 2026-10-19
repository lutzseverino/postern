# Source layout

This document maps Postern's source and tests, and where a new adapter fits.

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
