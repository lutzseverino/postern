# Release procedure

This procedure publishes a Postern version to npm as `@lutzseverino/postern`
and records it as a GitHub release. Only the owner releases: the release-tag
ruleset lets only the owner create, move or delete `v*` tags, and the
`Release` workflow publishes from such a tag and never creates one.

## Start here

| State                                                     | Next action                                                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A `Release` run is queued or running                      | Wait for it to finish before inspecting or retrying anything.                                   |
| Trusted publishing is not configured yet                  | Complete **Trusted-publisher setup** below.                                                     |
| New version, no publication attempted                     | Follow **Publish** below.                                                                       |
| A publication attempt failed or its outcome is uncertain  | Follow **Recover a publication** below before dispatching another publishing run.               |
| npm and the GitHub release exist; public checks failed    | Dispatch `Release` with `verify_published: true`, as in **Retry the public checks** below.      |

## Trusted-publisher setup

The workflow publishes through
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), which
exchanges the workflow's OIDC identity for a short-lived publish credential,
so the repository holds no npm token. npm attaches a provenance attestation
that ties the tarball to the workflow run.

Before the first release, in the `@lutzseverino/postern` package settings on
npm, add a trusted publisher for GitHub Actions with user `lutzseverino`,
repository `postern`, workflow filename `release.yml`, and environment `npm`.
If npm does not yet allow configuring a package that has never been
published, publish `1.0.0` once by **Interactive publication** below from the
tarball a validation run produced, then add the trusted publisher. In GitHub,
the `npm` environment appears on the first run that uses it; restrict its
deployments to `v*` tags and require the owner's review if the owner wants a
second confirmation.

## Publish

1. Record the exact stable version in `package.json` and merge that change.
   A version can never be published twice, so each release needs a new one.
   A breaking port change needs a new major version.
2. Write the release notes in Markdown: what changed, and any breaking change
   with its migration.
3. Create and push the annotated tag at the reviewed commit on `main`:

   ```sh
   git tag -a v<version> -m "Postern <version>" <reviewed-commit>
   git push origin v<version>
   ```

4. Dispatch the workflow at that tag with the version and notes:

   ```sh
   gh workflow run release.yml --repo lutzseverino/postern \
     --ref v<version> -f version=<version> -F notes=@<release-notes-file>
   ```

The workflow refuses to publish unless it runs at `refs/tags/v<version>`,
`package.json` records that version, and the notes are not empty. It then:

- validates on Node.js 24 and 26 with `npm run validate`;
- packs the tarball once, on Node.js 24, with its `SHA256SUMS`, and keeps the
  tarball and notes as the `release-bundle` and `release-notes` artifacts;
- in the `npm` environment, checks the hashes and publishes that exact
  tarball with provenance through trusted publishing;
- creates the GitHub release `v<version>` at the existing tag, with the notes
  as its body and the tarball and `SHA256SUMS` as assets;
- installs the version from the public registry on Node.js 24 and 26 with
  `scripts/public-smoke.mjs`, after waiting up to ten minutes for it to
  appear. The check verifies registry signatures and provenance with
  `npm audit signatures`, reads this repository's releases and tag
  anonymously through the installed package, and runs its single file
  copied alone.

## Recover a publication

An npm version cannot be overwritten, so never rebuild or republish a version
npm has accepted. From the failed run, establish what exists:

```sh
gh run view <run-id> --repo lutzseverino/postern --json headSha,jobs,url
npm view @lutzseverino/postern@<version> dist --json
gh release view v<version> --repo lutzseverino/postern
```

A missing artifact, an unavailable service or an authentication failure
leaves the state unknown; it does not prove that publication is absent.

| Established state                                               | Recovery action                                                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation failed                                               | Nothing was published. Fix the cause on `main`; if the tag must move to a new commit, use a new version instead.                                      |
| npm lacks the version; the run's `release-bundle` is intact     | Correct the trusted-publisher setup, then dispatch `Release` again at the same tag, or publish the original tarball by **Interactive publication**. |
| npm has the version; its integrity matches the original tarball; the GitHub release is missing | Create the release from the original artifacts, as below.                                                    |
| npm, the tag and the GitHub release all match                   | Run **Retry the public checks**.                                                                                                                      |
| Anything differs or cannot be established                       | Stop and resolve the discrepancy, keeping the original artifacts and observations.                                                                    |

To compare integrity, download the original bundle and compare the npm
`dist.integrity` with the tarball's:

```sh
gh run download <run-id> --repo lutzseverino/postern --name release-bundle --dir <fresh-directory>
(cd <fresh-directory> && sha256sum --check SHA256SUMS)
node -e 'const c=require("node:crypto"),f=require("node:fs");console.log("sha512-"+c.createHash("sha512").update(f.readFileSync(process.argv[1])).digest("base64"))' <fresh-directory>/<tarball>.tgz
```

To create a missing GitHub release from the original run:

```sh
gh run download <run-id> --repo lutzseverino/postern --name release-notes --dir <fresh-notes-directory>
gh release create v<version> <fresh-directory>/* --repo lutzseverino/postern \
  --verify-tag --title "Postern <version>" --notes-file <fresh-notes-directory>/release-notes.md
```

## Interactive publication

Use this only for the first publication when npm requires it, or to recover
when trusted publishing is unavailable. The account needs access to the
`@lutzseverino` npm scope and two-factor authentication. Publish the tarball a
validation run produced, never a local rebuild:

```sh
npm login --registry=https://registry.npmjs.org
npm publish <original-tarball> --ignore-scripts --access public \
  --registry=https://registry.npmjs.org
npm view @lutzseverino/postern@<version> dist --json
```

A local publication carries no provenance attestation. Log out afterwards,
and keep no tokens, one-time passwords or authentication logs.

## Retry the public checks

Once npm and the GitHub release are verified, dispatch only the public checks:

```sh
gh workflow run release.yml --repo lutzseverino/postern \
  --ref v<version> -f version=<version> -F verify_published=true
```

This skips validation and publication. GitHub's anonymous API quota is shared
by source address, so a `rateLimited` failure in the check is external;
retry after its `retryAt`.
