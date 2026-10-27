# GitHub repository configuration adoption guidance

Bring the adopting repository's GitHub settings into line with the
`github-repository-configuration` rules through the `canonical-labels` and
`pull-request-integration` fixes. The repeat-safe operations infer one
unambiguous github.com repository from Git remotes, require authenticated
access and the needed permissions, apply only missing settings, and read the
result back. Review blocked and partial results before retrying. Operation
evidence describes the state at execution time; it does not provide remote
freshness, rollback, or an ownership baseline.

When the repository's plan offers neither branch protection nor rulesets, the
`pull-request-integration` fix completes without requiring the `PR metadata`
check, and the next adoption or update requires it once GitHub offers either.
Until the PR metadata validation workflow is on the default branch, requiring
the check is deferred, and the next adoption or update after the workflow
merges requires it.

## Remote setup

The `canonical-labels` and `pull-request-integration` fixes are remote setup:
they change GitHub's settings for the repository, not project files. Each has
a read-only readiness probe that inspection runs before anything is written.
A probe is ready only when its fix could run:

- GitHub CLI (`gh`) 2.57.0 or newer and Git 2.18.0 or newer are installed;
- the repository-local Git remotes name exactly one github.com repository, and
  GitHub resolves that same repository;
- `gh` has an authenticated active account for github.com;
- that account has write, maintain, or admin access for `canonical-labels`,
  and admin access for `pull-request-integration`.

Otherwise the probe is not ready and its reason names what to do, such as
installing `gh`, resolving the remotes, or signing in with
`gh auth login --hostname github.com`. Resolve the reason and inspect again, or
defer that remote setup and complete adoption locally: answer `defer` to
`adopt`'s remote setup question. The adoption record and `status` list each
deferred remote setup with its reason. Every later `adopt`, including one that
applies the unchanged selection again, probes again and applies a deferred
remote setup once its probe is ready. A probe changes nothing, locally or on
GitHub, and does not read the labels, rules, or settings its fix reconciles,
so a ready fix can still return `confirmation-required` or `blocked`.

## Pull request reviewer

The optional `.github/pull-request-reviewer.json` is the repository's own
configuration, not adoption output. The declaration owns no reviewer file or
preset and its confirmed scope is empty, so the run leaves the file untouched:
it neither creates nor changes it. Its read-only `pull-request-reviewer` check
passes without the file and validates the schema when present.

If the repository wants a reviewer, the agent or a maintainer adds or changes
the file in a separate commit after the run completes, following the schema in
the rules, never in the adoption commit or pull request. The check validates it
on the next `check` or update.

## Factory app-author review policy

The optional `.github/factory-review-policy.json` is the repository's own
configuration, not adoption output. Adoption and update leave it untouched:
they neither create nor edit it, supply a preset, select an app author nor
enable a review exemption. Deliberate configuration belongs in a separate
commit after the run completes, following the schema in the rules, never in
the adoption commit or pull request.

The read-only `factory-review-policy` check passes without the file; absence
is supported and requires no policy or owner question. When present, it
validates the version-1 schema with the same reader as the installed request
and wait commands, without account lookup or GitHub access. Valid declarations
using REST `<slug>[bot]` or CLI `app/<slug>` identities pass unchanged. Invalid
declarations, including plain human logins, and file-read failures fail with
a correction identifying the policy and the requirement from the rules. The
check never rewrites the file or treats invalid content as absence.

## Installed workflow runners

Assess the repository's visibility and the repository-level
`REPO_CANON_RUNS_ON` variable as unset, valid with its labels, or invalid,
following the
[discovery guidance](../discovery/github-repository-configuration.md), against
the runner rules. Disclose uncertainty about an organization-level value the
run cannot read. Report parsed falsy JSON such as `false`, `0`, `null`, or `""`
as invalid, even though it selects the hosted default.

The adoption or update run reports this setting but never sets, changes, or
deletes the variable. Setting it without matching runners would strand every
installed job. The assessment changes nothing remotely.
