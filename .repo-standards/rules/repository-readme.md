# Repository README rules

The top-level `README.md` is the Repository README, the entry document for
someone discovering the repository. Write it for that reader.

Start with a centered title, followed by a one-sentence description that says
what the project is and who it is for, before anything else, and badges. The
description contains no term defined in the repository's root `GLOSSARY.md` or
in a context glossary listed in its `GLOSSARY-MAP.md`, matched
case-insensitively as a whole word; a hyphen-joined compound, such as
`on-demand`, is one word. For a standards source or another tool applied to a
repository, explain what adopting it changes. Define a project-specific term
before using it anywhere in the document.

Badges cover the languages and runtimes a user or contributor needs, not file
formats, and a runtime badge carries the required major version. Each badge's
label and link agree with the repository. Do not add badges for every
development dependency.

Keep applicable recognized sections in this relative order: Installation,
Features, Usage, Configuration, Documentation, Contributing, License.
Installation is the first section when it applies. Omit sections that do not
apply, and place useful project-specific sections between recognized sections
where they best help the reader.

Give the shortest working user installation path and one representative usage
example. When the project is used through another tool, Installation shows how
to install that tool and how to point it at the project. Install commands carry
no version numbers. Distinguish user installation from contributor setup. Write
each Features item as one line starting with a verb. Keep prose concise, aiming
for roughly 300 words without treating that target as a limit. Move detailed
explanations to the appropriate documentation category and link them from the
README.

The Contributing, Documentation, and License sections are pointers. Each
contains only its link, as a plain paragraph, and nothing else: no surrounding
prose, additional links, lists, quotations, tables, or images. The Contributing
section links to `CONTRIBUTING.md`. When documentation exists, the
Documentation section links to `docs/README.md`, which lists the documents;
otherwise omit the section. The License section links to the root `LICENSE`
file, and its label is the actual repository license name, or
`All rights reserved` when `LICENSE` holds an all-rights-reserved notice. The
[`repository-license` rules](repository-license.md) govern that file.
