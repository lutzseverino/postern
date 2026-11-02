# Git attributes rules

The root `.gitattributes` marks every file Repo Canon installs that GitHub
Linguist would count toward language statistics as `linguist-vendored`. This
covers exact file declarations and files inside installed skill directories,
including the triage skill's installed `.agents/skills/triage/ready.mjs`
readiness helper and the orchestrate skill's installed
`.agents/skills/orchestrate/wait.mjs` event wait. Reassess the installed
inventory when updating to a selection that adds runtime code. Paths
Linguist's default vendor list already excludes,
including `vendor/` and `.github/`, need no entry.

Each Repo Canon entry matches only an installed exact file path or an installed
skill's own directory, such as `.agents/skills/babysit/**`. It never matches
repository-owned files: broad patterns such as `scripts/**`, `operations/**`,
or `.agents/skills/**` are not allowed. Repository-owned contextual files are
not installed source code and receive no Repo Canon entry.

Repository-owned lines in `.gitattributes` remain unchanged. Repo Canon's
entries cover only paths the selected declarations still install. Attributes
for `.repo-standards/` belong to Repository Standards, not this declaration.

In Repo Canon's own repository, self-adoption marks none of its own files
vendored: those files are its own code. When no file needs an entry, these
rules require no `.gitattributes` file.
