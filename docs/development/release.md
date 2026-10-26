# Release procedure

This procedure publishes a Postern version to npm as `@lutzseverino/postern`
and records it as a GitHub release. Only the owner releases: the release-tag
ruleset lets only the owner create, move or delete `v*` tags, and the
`Release` workflow publishes from such a tag and never creates one.

## Start here

| State                                                    | Next action                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A `Release` run is queued or running                     | Wait for it to finish before inspecting or retrying anything.                              |
| The `npm` environment does not exist yet                 | Ask the orchestrator to create it, as in **The `npm` environment** below.                  |
| No version is published yet                              | Follow **First publication** below.                                                        |
| New version, no publication attempted                    | Follow **Publish** below.                                                                  |
| A publication attempt failed or its outcome is uncertain | Follow **Recover a publication** below before dispatching another publishing run.          |
| npm and the GitHub release exist; public checks failed   | Dispatch `Release` with `verify_published: true`, as in **Retry the public checks** below. |

## The `npm` environment

The `Release` workflow publishes from the `npm` GitHub environment. The
orchestrator creates it before the first dispatch, with deployments
restricted to `v*` tags and the owner as its required reviewer, so every
publication waits for the owner's approval. The environment holds no secret
except the short-lived `NPM_TOKEN` of the first publication.

## Trusted publishing

Every release after the first publishes through
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), which
exchanges the workflow's OIDC identity for a short-lived publish credential,
so the repository holds no npm token. The trusted publisher on npm names
GitHub Actions with user `lutzseverino`, repository `postern`, workflow
filename `release.yml` and environment `npm`. Every publication carries a
provenance attestation that ties the tarball to the workflow run, and the
public check fails a version without one.

## First publication

If npm accepts a trusted publisher for the not yet published
`@lutzseverino/postern`, add it as above and follow **Publish**; no token is
needed. npm's trusted-publishers documentation does not say whether it does,
and it requires a new trusted publisher to complete its first publication
within two days, so add it shortly before dispatching. Otherwise, the
workflow publishes `1.0.0` with a short-lived token, still with provenance,
in this order:

1. On npm, create a granular access token that can publish to the
   `@lutzseverino` scope without two-factor authentication, with the
   shortest expiration npm offers.
2. Store it as the `npm` environment's `NPM_TOKEN` secret. The command
   prompts for the value, so it never reaches the shell history:

   ```sh
   gh secret set NPM_TOKEN --env npm --repo lutzseverino/postern
   ```

3. Dispatch `Release` as in **Publish**. The publish step passes the token
   to npm as `NODE_AUTH_TOKEN` only when the secret is set.
4. Verify the provenance. The public check fails without it, and npm
   reports its SLSA provenance attestation:

   ```sh
   npm view @lutzseverino/postern@1.0.0 dist.attestations --json
   ```

5. Add the trusted publisher as in **Trusted publishing**.
6. Delete the token from the environment, and revoke it on npm:

   ```sh
   gh secret delete NPM_TOKEN --env npm --repo lutzseverino/postern
   ```

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

- validates on Node.js 24 and 26 with `pnpm validate`;
- packs the tarball once with `pnpm pack`, on Node.js 24,
  with its `SHA256SUMS`, and keeps the
  tarball and notes as the `release-bundle` and `release-notes` artifacts;
- in the `npm` environment, after the owner approves the deployment, checks
  the hashes and publishes that exact tarball with provenance through
  trusted publishing, or with the first publication's token;
- creates the GitHub release `v<version>` at the existing tag, with the notes
  as its body and the tarball and `SHA256SUMS` as assets;
- installs the version from the public registry on Node.js 24 and 26 with
  `scripts/public-smoke.mjs`, after waiting up to ten minutes for it to
  appear. The check verifies registry signatures with `npm audit
signatures`, and requires the version's provenance attestation, which
  that command does not. It then reads this repository's releases and tag
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

| Established state                                                                              | Recovery action                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Validation failed                                                                              | Nothing was published. Fix the cause on `main`; if the tag must move to a new commit, use a new version instead.                   |
| npm lacks the version; the run's `release-bundle` is intact                                    | Correct the trusted publisher, or for the first publication the `NPM_TOKEN` secret, then dispatch `Release` again at the same tag. |
| npm has the version; its integrity matches the original tarball; the GitHub release is missing | Create the release from the original artifacts, as below.                                                                          |
| npm, the tag and the GitHub release all match                                                  | Run **Retry the public checks**.                                                                                                   |
| Anything differs or cannot be established                                                      | Stop and resolve the discrepancy, keeping the original artifacts and observations.                                                 |

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

## Retry the public checks

Once npm and the GitHub release are verified, dispatch only the public checks:

```sh
gh workflow run release.yml --repo lutzseverino/postern \
  --ref v<version> -f version=<version> -F verify_published=true
```

This skips validation and publication. GitHub's anonymous API quota is shared
by source address, so a `rateLimited` failure in the check is external;
retry after its `retryAt`.
