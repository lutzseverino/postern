# Discover documentation scope

`repo-standards adopt` drafts the documentation scope itself: the
`documentation` declaration's discovery script, the drafter this source ships,
runs read-only during inspection and proposes the declaration's scope entry.
`adopt` asks its unresolved questions in the terminal, or as the
`scope:documentation` field of its answers file, whose proposed answer is the
draft. Nobody runs the drafter by hand.

The `documentation` rules this source installs decide the draft's candidates: every file Git keeps under the `docs` documentation
root, the index of the root and of each directory under it, the development
guide, the repository root's glossary and context map, and each context
glossary that context map lists. Paths other declarations own, including
`docs/agents/project.md` under `project-agent-guidance`, and paths
Repository Standards reserves, stay out, and so does every `README.md` outside
the documentation roots, which the documentation check would read as a root's
index; such a README cannot enter this scope, even as a move source. If it is a
Project README, the `project-readmes` declaration's proposal covers it.

Directories named `adopt-standards` or `standards-updates` at either
`.agents/skills/` or `.claude/skills/` receive ordinary handling under these
rules and the selected declarations' ownership. Their Markdown outside a
documentation root enters the ordinary membership questions, whether it is an
unedited leftover from Repository Standards CLI 6.x, an edited copy, or a
project-owned skill. The drafter makes no removal claim. An adopter updating
from CLI 6.x may see one extra membership question, once.

Decide only the cases in its unresolved questions, resolving genuine membership
questions with the maintainer, and remove each question from the entry once it
is decided:

- Whether a directory is a documentation root. For each one that is, include
  its files, with a new index for each of its directories without one, as the
  draft does for `docs`. `docs` is always a root, and a documentation root never
  lies inside another.
- Whether a Markdown file outside the documentation roots is documentation that
  the scope must cover, such as a document to move into a category.
- Which category a file or directory directly under a root moves to.
- Whether another `GLOSSARY.md` or `GLOSSARY-MAP.md` is a glossary or context map
  of this repository.
- What becomes of a directory under a root without a file that Git keeps, a
  symbolic link under a root, or an entry that blocks a root or an index, such
  as a file named `docs`.

An update drafts afresh: the drafter cannot see the previous confirmed scope,
so its draft asks again every question that scope may have settled. That scope
holds the maintainer's earlier decisions. Find it in the retained
`.repo-standards/inputs/scope-history.json`, format
`repo-standards/scope-history/v5`, which `inspect --json` reports as
`historicalScope`: the `documentation` entry of its discovery proposal, with its
candidates and coverage. Answer each unresolved question it decides as it
decided:

- A root it included stays a root, with its files and a new index for each of
  its directories without one.
- A Markdown file it included or excluded keeps that decision, and so does a
  file added since to a directory whose Markdown its coverage includes or
  excludes as a whole.
- A glossary or context map it included stays included.

Also keep each path it included that still exists and that no rule now assigns
elsewhere. `docs/agents/project.md` stays out even if it included it: the
`project-agent-guidance` declaration now owns that path, and removing it from
documentation scope preserves its content. Show the carried answers to the
maintainer with the inspection, each naming the earlier decision it comes from,
and ask them only the questions the previous scope does not decide, such as one
about a directory added since. `adopt` accepts the entry only once every
question is answered.

Then add each intended new path that the work needs and the draft cannot know: a
move destination, with the index of any new directory; and a file whose link to
documentation needs repair. Keep all declarations' paths disjoint: a Project
README under a documentation root belongs to one declaration only. A move
requires authority for its source, destination, and affected link repairs.

The draft does not decide membership by itself. The maintainer's request to
adopt or update is consent to the drafted and reviewed scope. Ask them to
confirm only when `adopt` asks its `confirmation` question.
