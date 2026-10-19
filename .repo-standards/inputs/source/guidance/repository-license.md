# Repository license adoption guidance

Target only the adopting repository's root `LICENSE`, with no directory
targets, and bring it into line with the `repository-license` rules.

First check for other root license files, such as `LICENSE.md`. They are outside
this declaration's target: never edit, rename, or delete them. If any exist,
leave `LICENSE` unchanged and assess `repository-license` as `blocked`, naming
the files the maintainer must reconcile before adoption continues.

When `LICENSE` already holds a single, clear license, keep it unchanged.
Otherwise, ask the maintainer to name the repository license or to grant none.
Until the maintainer answers, leave `LICENSE` unchanged and assess
`repository-license` as `blocked`, naming the decision needed. This assessment
stops the run before checks; contextual work continues once the maintainer
answers. Then write `LICENSE` from the answer, asking for the copyright notice
if needed.

Assess `repository-license` as `satisfied` once `LICENSE` meets its rules and
there are no other root license files to reconcile. Cite the existing file or
the maintainer's decision as evidence. The separate `repository-readme`
declaration writes the matching License link.
