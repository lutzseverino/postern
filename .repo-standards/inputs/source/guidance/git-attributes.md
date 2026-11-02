# Git attributes adoption guidance

Target only the root `.gitattributes` and satisfy the `git-attributes` rules
through contextual work; this declaration has no deterministic fix or check.

1. Read the resolved selection's declarations from `repo-standards inspect`.
   Inventory each exact file's installed target and every file in each
   installed skill directory. Use installed paths, not source paths or
   operation resources retained by Repository Standards. Exclude
   repository-owned contextual files and everything under `.repo-standards/`.
2. Identify the installed files Linguist would count, using its
   [overrides documentation](https://github.com/github-linguist/linguist/blob/main/docs/overrides.md)
   and [default vendor list](https://github.com/github-linguist/linguist/blob/main/lib/linguist/vendor.yml).
   `vendor/` and `.github/` are already excluded. For the current profiles,
   the counted files are the issue-contract validator, the common validator
   command, the rendered-Markdown runtime, the babysit skill's `.mjs` files,
   the triage skill's `ready.mjs`, the orchestrate skill's `wait.mjs`,
   and the diagnosing-bugs skill's shell
   template. Derive the inventory anew on each update; this example is not a
   replacement for the resolved selection.
3. Read any existing `.gitattributes` before editing. Preserve every
   repository-owned line byte for byte, including line-ending and other
   Linguist settings. Keep Repo Canon's additions in a clearly bounded block
   so their ownership is recognizable on later updates. Add missing
   `linguist-vendored` entries for the inventory, using exact installed file
   paths or an installed skill's own directory. Never cover an entire shared
   parent such as `scripts/**`, `operations/**`, or `.agents/skills/**`.
   For the current selection, the block is:

   ```gitattributes
   # BEGIN Repo Canon linguist-vendored
   scripts/validate-issue-contract.mjs linguist-vendored
   scripts/validate.mjs linguist-vendored
   operations/lib/rendered-markdown.mjs linguist-vendored
   .agents/skills/babysit/** linguist-vendored
   .agents/skills/orchestrate/** linguist-vendored
   .agents/skills/triage/** linguist-vendored
   .agents/skills/diagnosing-bugs/** linguist-vendored
   # END Repo Canon linguist-vendored
   ```

4. Remove obsolete entries Repo Canon added for paths the selection no longer
   installs; keep every other line. Use the bounded block or the previous
   adoption's diff to establish ownership, rather than assuming an existing
   attribute belongs to Repo Canon. In Repo Canon's own repository, apply the
   self-adoption exception: add no entries for its own files and remove any
   such entries Repo Canon previously added. If no entry remains, omit the
   block. Do not create `.gitattributes` when nothing needs an entry, or delete
   an existing file containing repository-owned lines.
5. Run `git check-attr linguist-vendored -- <installed-paths>` against every
   installed counted file, including each file covered by a skill directory
   pattern. Each must report `set`. Check repository-owned source files too,
   including any under `scripts/`, `operations/`, and repository-owned skills
   under `.agents/skills/`; the added entries must not mark them vendored.
   For self-adoption, verify that Repo Canon's own source files do not report
   `set`. Inspect the diff to verify that every repository-owned line is
   unchanged and no Repo Canon entry targets `.repo-standards/`.

Assess `git-attributes` as `satisfied` with the resolved installed inventory,
attribute results, and preservation diff as evidence, or cite why the
self-adoption or no-counted-files case needs no entry. Linguist reads committed
attributes; GitHub's language bar changes only after the change reaches the
default branch.
