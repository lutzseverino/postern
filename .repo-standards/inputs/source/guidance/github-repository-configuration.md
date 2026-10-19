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

Decide whether the repository adds the optional
`.github/pull-request-reviewer.json`, whose schema the rules state: choose a
reviewer, or leave the file absent, according to the repository's own setup.
The declaration owns no reviewer file or preset. Its read-only
`pull-request-reviewer` check passes without the file and validates the schema
when present.

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
