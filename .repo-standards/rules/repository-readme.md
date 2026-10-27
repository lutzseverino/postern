# Repository README rules

The top-level `README.md` is the Repository README, the entry document for
someone discovering the repository. Write it for that reader.

Start with one centered header block: optionally one project image, then the
title, a one-sentence description that says what the project is and who it is
for, then badges, in that order, before anything else. The image is optional;
without it, start with the title as usual. For example:

```html
<div align="center">
  <h1>Harbor</h1>
  <p>A delivery service for operators.</p>
  <p>
    <img src="typescript-badge.svg" alt="TypeScript" />
    <a href="https://nodejs.org/"><img src="node.svg" alt="Node.js 24" /></a>
  </p>
</div>
```

Setting `align="center"` on each element is also accepted: the `h1`, the
description `p`, and the badge `p` paragraphs. Center an optional leading image
with the shared `div` or a containing `p align="center"`. An `img` or
`picture` element's own `align="center"` does not horizontally center it.

A single image needs no theme variants. When light and dark variants exist,
use GitHub's [theme-aware picture markup](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/quickstart-for-writing-on-github#adding-an-image-to-suit-your-visitors)
so readers see the variant matching their GitHub theme, with a usable `img`
fallback. The alternatives count as one project image. For example, put this
before the `h1` inside the centered header:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="harbor-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="harbor-light.svg" />
  <img src="harbor-light.svg" alt="" />
</picture>
```

Use `alt=""` when the image is decorative and adds no information beyond the
adjacent title, as in this example. An image that communicates additional
information needs an appropriate text alternative; assess its purpose using
the [W3C image guidance](https://www.w3.org/WAI/tutorials/images/decorative/).

The description contains no term defined in the repository's root
`GLOSSARY.md` or in a context glossary listed in its `GLOSSARY-MAP.md`, matched
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
