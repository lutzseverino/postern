<div align="center">
  <h1>Postern</h1>
  <p>Postern is a Node.js library that gives developers building tools one interface to code hosting platforms such as GitHub, for issues, pull requests, releases and access, and reports only facts the platform states.</p>
  <p>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24%20or%2026-339933?logo=nodedotjs" alt="Node.js 24 or 26"></a>
  </p>
</div>

Each of those four areas is a **port**, one stable interface for one concept, and each hosting platform sits behind its own **adapter**. Postern reports what the platform records and decides nothing: readiness, ordering, authorization and what a label means stay with your tool. GitHub is the only adapter so far.

## Installation

```sh
npm install @lutzseverino/postern
```

The package has no runtime dependencies. Its runtime is one self-contained ESM file, `dist/postern.mjs`, which you can also copy into a project at an exact version.

## Features

- Detects the platform and repository path from a Git remote URL.
- Reads issues with their labels, parent, sub-issues, blockers, edit and link times.
- Normalizes issue webhook events into platform-neutral event facts without requests.
- Reads label changes and comments, and writes labels, comments and issue state.
- Lists repository labels and updates their names, colors and descriptions.
- Reads pull requests, reviews, review threads and checks, and squash-merges against an expected head.
- Lists releases and resolves tags to commits.
- Reports the authenticated account and repository roles, and sends other API requests authenticated.
- Reads every API page with `access.requestPages` and reports failures with their status and redacted platform message.

## Usage

```js
import { connect, PlatformError } from "@lutzseverino/postern";

const repository = connect("git@github.com:octo/hello.git", {
  credential: () => process.env.MY_TOOL_TOKEN,
});

try {
  const issue = await repository.issueTracker.issue(42);
  console.log(issue.title, issue.parent, issue.blockedBy);
} catch (error) {
  if (error instanceof PlatformError && error.reason === "rateLimited") {
    console.log("Try again at", error.retryAt);
  } else throw error;
}
```

`connect` takes a remote URL or a `detectPlatform` result. Any remote no adapter serves fails with reason `unsupported`.

## Configuration

- `credential`: a token, or a function returning one that Postern calls whenever it needs a token. Without it the connection is anonymous and public reads that the platform serves anonymously still work. Postern never reads environment variables, files or command-line tools for credentials, and no error or result contains a credential.
- `relationshipSections`: `{ parent, blockedBy }`, the body section names to read relationships from on a platform without native links. There is no default; without it, such a platform reports `parent: null` and `blockedBy: []`. GitHub's links are native, so the GitHub adapter never reads body sections.
- `fetch` and `timeoutMs`: the `fetch` implementation to use, and the per-request timeout in whole milliseconds, from 1 to 2147483647 (30 seconds by default).

## Ports

A connection exposes `issueTracker`, `pullRequests`, `releaseSource` and `access`. Each reports `capabilities`, its capability flags: an absent flag means the platform does not offer that feature. An operation that needs an absent flag fails with `unsupported`, and a field that needs one is `null`.

| Port            | Flags                                                                 |
| --------------- | --------------------------------------------------------------------- |
| `issueTracker`  | `nativeParent`, `nativeBlockers`, `bodyEditTime`, `linkTime`, `botMarking` |
| `pullRequests`  | `closingReferences`, `reviewCommits`                                  |
| `releaseSource` | `drafts`, `prereleases`                                               |
| `access`        | none                                                                  |

The GitHub adapter offers every flag. Roles, review states and check results use the platform's own words.

## Errors

Every failure is a `PlatformError` whose `reason` is one of `unauthenticated`, `forbidden`, `notFound`, `conflict`, `rejected`, `rateLimited` (with `retryAt` when the platform states it), `unavailable`, `invalidResponse` or `unsupported`.

## Scope

The ports cover a deliberate set of facts, listed in the [API reference](docs/usage/reference.md); Postern is not a general API client, and `access.request` reaches anything else on the platform's API. Releases follow SemVer: pin a major version, because a breaking port change is a new major.

## Documentation

[Documentation index](docs/README.md)

## Contributing

[Contribution guide](CONTRIBUTING.md)

## License

[MIT License](LICENSE)
