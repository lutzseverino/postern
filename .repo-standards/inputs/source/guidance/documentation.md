# Documentation adoption guidance

Bring the documentation at the confirmed paths into line with the
`documentation` rules.

Remove point-in-time records already committed to the documentation; Git history
retains them, and a maintained document that still needs one cites its commit
permalink.

Preserve useful, current documentation when reorganizing it. Update affected
links and account for both old and new paths. Preserve exact shared agent
configuration.

During an update, rename existing `CONTEXT.md` and `CONTEXT-MAP.md` files to
`GLOSSARY.md` and `GLOSSARY-MAP.md`, including glossaries in each context.
Preserve their content and repair links and map entries to the renamed paths.
Include both source and destination paths in the contextual documentation scope
before the complete inspection. The updated conventions use the new names.

Assess documents against their actual audience and topic. Mechanical checks
cover categories, directory READMEs, required entry points, local link targets,
the index entry form, the root usage purpose's absence of glossary terms,
one index per document, the development guide's order,
and that every Markdown document under a documentation root is in the confirmed
scope unless another declaration, such as an exact file, owns it. They do not
prove correctness or usefulness, and they do not check where records are kept.
