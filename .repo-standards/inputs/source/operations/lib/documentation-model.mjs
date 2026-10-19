import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { sep } from "node:path";
import { interpretMarkdown } from "./rendered-markdown.mjs";
import { localLinks, resolvedLocalPath } from "./local-markdown-links.mjs";
import {
  glossaryCorrections,
  glossaryTerms,
  isOneSentence,
} from "./entry-document.mjs";

// The structure of a repository's documentation: its documentation roots and
// categories, its directories and their documentation indexes, its documents,
// their scope membership, and their local links. Roots are inferred from the
// confirmed paths, never from the tree alone, so the model does not draft
// scope; the documentation scope drafter does, with these same definitions.
// The model also defines the documentation rules that read this
// structure: index entry form, one index per document, the development
// guide's order, scope coverage, and the root usage index's glossary-free
// purpose. The documentation check reports their
// violations together with its structural corrections.

// The repository's documentation root, its development guide, and the
// documentation categories, which the documentation scope drafter shares.
export const repositoryDocumentationRoot = "docs";
export const developmentGuide = `${repositoryDocumentationRoot}/development/README.md`;
export const documentationCategories = Object.freeze([
  "usage",
  "development",
  "adr",
  "agents",
]);
const categories = new Set(documentationCategories);

// The installed agents index cites the optional project guidance in context
// rather than listing it as an entry.
const agentsIndex = `${repositoryDocumentationRoot}/agents/README.md`;
const projectGuidance = `${repositoryDocumentationRoot}/agents/project.md`;
const usageIndex = `${repositoryDocumentationRoot}/usage/README.md`;

const setupAndValidation = "setup and validation";

// The documentation rules, by the name each failure cites.
export const documentationRules = Object.freeze({
  indexEntryForm: "index entry form",
  oneIndex: "one index per document",
  developmentGuideOrder: "development guide order",
  scopeCoverage: "scope coverage",
  entryDocumentLanguage: "entry document language",
});

function absolutePath(projectRoot, path) {
  return `${projectRoot}${sep}${path.split("/").join(sep)}`;
}

// The errors that show no entry can exist at a path: it is absent, lies below
// a file or a symbolic link loop, or is too long.
const noEntryErrors = new Set(["ENOENT", "ENOTDIR", "ELOOP", "ENAMETOOLONG"]);

// The entry at a path, or null when no entry can exist there. Any other
// failure to inspect the path, such as inside a directory that cannot be
// searched, throws Node's error naming the path, which the check reports as a
// process error.
function entryAt(projectRoot, path) {
  try {
    return lstatSync(absolutePath(projectRoot, path));
  } catch (error) {
    if (noEntryErrors.has(error.code)) return null;
    throw error;
  }
}

function isFile(projectRoot, path) {
  return entryAt(projectRoot, path)?.isFile() ?? false;
}

function isDirectory(projectRoot, path) {
  return entryAt(projectRoot, path)?.isDirectory() ?? false;
}

// The content of a file, or null when no file exists at the path. A file that
// exists but cannot be read throws Node's read error naming its path, which
// the check reports as a process error.
function fileContent(projectRoot, path) {
  return isFile(projectRoot, path)
    ? readFileSync(absolutePath(projectRoot, path), "utf8")
    : null;
}

function isInside(path, directory) {
  return path.startsWith(`${directory}/`);
}

// A confirmed `<dir>/<category>/README.md` names `<dir>` as a candidate root
// with categories, and any other confirmed README names a candidate root.
// A documentation root never lies inside another: `docs` and the outermost
// candidates with categories are the roots, and a candidate with categories
// inside a root is an ordinary directory of that root. A candidate without
// categories is ambiguous unless a root contains it.
export function inferredRoots(confirmedPaths) {
  const candidates = new Set([repositoryDocumentationRoot]);
  for (const path of confirmedPaths) {
    const segments = path.split("/");
    const fileName = segments.pop();
    if (fileName !== "README.md" || segments.length === 0) continue;
    if (categories.has(segments.at(-1))) segments.pop();
    if (segments.length > 0) candidates.add(segments.join("/"));
  }

  const candidatesWithCategories = [...candidates].filter(
    (candidate) =>
      candidate === repositoryDocumentationRoot ||
      documentationCategories.some((category) =>
        confirmedPaths.includes(`${candidate}/${category}/README.md`),
      ),
  );
  const roots = candidatesWithCategories.filter(
    (candidate) =>
      !candidatesWithCategories.some((other) => isInside(candidate, other)),
  );
  return {
    roots: roots.sort(),
    candidatesWithCategories: candidatesWithCategories.sort(),
    ambiguous: [...candidates]
      .filter(
        (candidate) =>
          !candidatesWithCategories.includes(candidate) &&
          !roots.some((root) => isInside(candidate, root)),
      )
      .sort(),
  };
}

// Whether a path is a Markdown document, which the documentation rules read.
export function isMarkdownPath(path) {
  return path.toLocaleLowerCase("en-US").endsWith(".md");
}

// Walks a root depth first. The first directory is the root itself when it
// exists as a directory; every directory below it exists because its parent
// lists it. A directory that exists but cannot be listed throws Node's read
// error naming its path, which the check reports as a process error.
export function documentationTree(projectRoot, root) {
  const directories = [];
  const markdownFiles = [];
  const visit = (path) => {
    const entries = readdirSync(absolutePath(projectRoot, path), {
      withFileTypes: true,
    });
    directories.push({ path, entries });
    for (const entry of entries) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && isMarkdownPath(entry.name))
        markdownFiles.push(child);
    }
  };
  if (isDirectory(projectRoot, root)) visit(root);
  return { directories, markdownFiles };
}

function isStrayEntry(entry) {
  return (
    entry.name !== "README.md" &&
    !(entry.isDirectory() && categories.has(entry.name))
  );
}

// The index that lists a document under a documentation root: its
// directory's README, or for a directory README, its parent's. A root's own
// index is listed in no index, so its index is null.
export function documentIndex(root, document) {
  const segments = document.split("/");
  const fileName = segments.pop();
  let directory = segments.join("/");
  if (fileName === "README.md") {
    if (directory === root) return null;
    directory = directory.slice(0, directory.lastIndexOf("/"));
  }
  return `${directory}/README.md`;
}

// The targets that declarations own, as Repository Standards derives each
// declaration's allowed targets: a file declaration's target, a repository
// declaration's confirmed paths and directories, and a skill's installed
// directory. An operation request lists every active declaration. A path that
// one declaration owns cannot be in another's scope, so a document under a
// documentation root that another declaration owns, such as an installed exact
// file, is covered without being in the documentation scope. Anything that is
// not a declaration owns nothing.
export function declarationTargets(declarations) {
  const paths = new Set();
  const directories = new Set();
  const strings = (values) =>
    Array.isArray(values)
      ? values.filter((value) => typeof value === "string")
      : [];
  for (const declaration of Array.isArray(declarations) ? declarations : []) {
    if (
      declaration?.kind === "file" &&
      typeof declaration.target === "string"
    ) {
      paths.add(declaration.target);
    } else if (declaration?.kind === "repository") {
      for (const path of strings(declaration.targets?.paths)) paths.add(path);
      for (const directory of strings(declaration.targets?.directories))
        directories.add(directory);
    } else if (
      declaration?.kind === "skill" &&
      typeof declaration.name === "string"
    ) {
      directories.add(`.agents/skills/${declaration.name}`);
    }
  }
  return { paths: [...paths].sort(), directories: [...directories].sort() };
}

// Whether a path is one of the declared targets: an explicit path, or a path
// inside a declared directory.
function isDeclared(path, declaredTargets) {
  return (
    declaredTargets.paths.includes(path) ||
    declaredTargets.directories.some((directory) => isInside(path, directory))
  );
}

function headingLevel(block) {
  const match = /^h([1-6])$/.exec(block.tag);
  return match ? Number(match[1]) : null;
}

function foldedText(text) {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

function listItems(blocks) {
  return blocks
    .filter((block) => block.tag === "ul" || block.tag === "ol")
    .flatMap((list) => list.blocks.filter((block) => block.tag === "li"));
}

// An index item. Its first link names the listed path, a directory meaning
// its README; a link into the index itself, such as to one of its headings,
// lists nothing. The item is well formed when it is
// `[Title](path): description`: it opens with a titled link to another local
// path, followed by a colon and a description.
function indexItem(indexPath, item, directories) {
  const [link] = item.links;
  let path = link ? resolvedLocalPath(indexPath, link.target) : null;
  if (typeof path === "string") {
    path = path.replace(/\/+$/, "");
    if (directories.has(path)) path = `${path}/README.md`;
    if (path === indexPath) path = null;
  } else {
    path = null;
  }
  return {
    text: item.text,
    target: link?.target ?? null,
    path,
    wellFormed:
      Boolean(link?.text) &&
      path !== null &&
      item.text.startsWith(link.text) &&
      /^:\s+\S/.test(item.text.slice(link.text.length)),
  };
}

// The rendered structure of a present documentation index: its purpose, the
// first paragraph after its title (a leading heading), the items of its
// top-level lists after that purpose, and its context, the text and linked
// paths of every block other than those lists. The development guide's index
// follows its Setup and validation section, so only items after that section
// are its index. For its order, the guide also records whether that section is
// its first section after the title (`first`), a later one (`later`), or absent
// (`missing`), and the items before its index.
function indexStructure(path, document, directories, isDevelopmentGuide) {
  const { blocks } = document;
  const isSetupAndValidation = (block) =>
    headingLevel(block) !== null &&
    foldedText(block.text) === setupAndValidation;
  const titled =
    blocks.length > 0 &&
    headingLevel(blocks[0]) !== null &&
    !(isDevelopmentGuide && isSetupAndValidation(blocks[0]));
  let start = titled ? 1 : 0;
  const purpose = blocks[start]?.tag === "p" ? blocks[start] : null;
  if (purpose) start += 1;
  const structure = {
    path,
    purpose: purpose
      ? { text: purpose.text, oneSentence: isOneSentence(purpose.text) }
      : null,
  };
  let indexStart = start;
  if (isDevelopmentGuide) {
    const section = blocks.findIndex(
      (block, index) => index >= start && isSetupAndValidation(block),
    );
    const firstSection = blocks.findIndex(
      (block, index) => index >= start && headingLevel(block) !== null,
    );
    if (section >= 0) {
      const level = headingLevel(blocks[section]);
      const next = blocks.findIndex(
        (block, index) =>
          index > section &&
          headingLevel(block) !== null &&
          headingLevel(block) <= level,
      );
      indexStart = next < 0 ? blocks.length : next;
    }
    if (section < 0) structure.setupAndValidation = "missing";
    else
      structure.setupAndValidation =
        section === firstSection ? "first" : "later";
    structure.itemsBeforeIndex = listItems(blocks.slice(start, indexStart)).map(
      (item) => indexItem(path, item, directories),
    );
  }
  structure.items = listItems(blocks.slice(indexStart)).map((item) =>
    indexItem(path, item, directories),
  );
  const contextBlocks = blocks.filter(
    (block, index) =>
      (index > 0 || !titled) &&
      (index < indexStart || (block.tag !== "ul" && block.tag !== "ol")),
  );
  structure.context = {
    text: contextBlocks.map((block) => block.text).join("\n"),
    paths: [
      ...new Set(
        contextBlocks
          .flatMap((block) => block.links)
          .map((link) => resolvedLocalPath(path, link.target))
          .filter((linked) => typeof linked === "string"),
      ),
    ].sort(),
  };
  return structure;
}

// Every rendered local link of a document. `path` is null when the target
// leaves the project, which makes the link broken.
function documentLinks(projectRoot, source, document) {
  return localLinks(projectRoot, source, document.content.elements).map(
    (link) => ({
      source,
      target: link.target,
      path: link.path ?? null,
      broken: link.broken,
    }),
  );
}

// Builds the model from the project root, the confirmed paths, and the paths
// that other declarations own:
//
// - `roots`: each documentation root, sorted, with its `index`, its
//   `strayEntries` outside the documentation categories, its `directories`
//   below it in walk order with their `index`, and its `confirmedIndexes`
//   under a documentation category of the root or of a directory inside it
//   that a confirmed category index names;
// - `ambiguousRoots`: candidate roots the confirmed paths cannot resolve;
// - `developmentGuide`: the index of `docs/development`;
// - `documents`: the Markdown files under each root and the confirmed
//   Markdown files that exist, sorted;
// - `members`: each Markdown file under a root, sorted, as
//   `{ path, root, index, scope }`, where `index` is the index that lists it
//   (null for a root's own index) and `scope` is `confirmed`, `declared` when
//   another declaration owns it, or null;
// - `indexes`: each present index under a root, in root and walk order, as
//   `{ path, purpose, items, context }`, where `purpose` is
//   `{ text, oneSentence }` or null, each item is
//   `{ text, target, path, wellFormed }`, and `context` is the `{ text, paths }`
//   of its blocks other than its entries and its title; the development guide
//   also records `setupAndValidation` (`first`, `later`, or `missing`) and
//   `itemsBeforeIndex`;
// - `links`: each document's local links as `{ source, target, path, broken }`.
//
// Each index state is `{ path, state, confirmed }`, where `state` is
// `missing`, `empty`, or `present`. `declaredTargets` holds the explicit
// `paths` and `directories` that other declarations own.
export function documentationModel(
  projectRoot,
  confirmedPaths,
  { declaredTargets = { paths: [], directories: [] } } = {},
) {
  const rendered = new Map();
  const render = (path) => {
    if (!rendered.has(path)) {
      const content = fileContent(projectRoot, path);
      rendered.set(path, content === null ? null : interpretMarkdown(content));
    }
    return rendered.get(path);
  };
  const index = (path) => {
    const document = render(path);
    let state = "missing";
    if (document !== null)
      state = document.content.hasContent ? "present" : "empty";
    return { path, state, confirmed: confirmedPaths.includes(path) };
  };

  const inference = inferredRoots(confirmedPaths);
  const documents = new Set();
  const members = [];
  const directoryPaths = new Set();
  const roots = inference.roots.map((path) => {
    const tree = documentationTree(projectRoot, path);
    for (const directory of tree.directories)
      directoryPaths.add(directory.path);
    const [rootDirectory, ...directories] = tree.directories;
    const candidatesInRoot = inference.candidatesWithCategories.filter(
      (candidate) => candidate === path || isInside(candidate, path),
    );
    const confirmedIndexes = new Set(
      confirmedPaths.filter(
        (confirmedPath) =>
          confirmedPath.endsWith("/README.md") &&
          candidatesInRoot.some(
            (candidate) =>
              isInside(confirmedPath, candidate) &&
              categories.has(
                confirmedPath.slice(candidate.length + 1).split("/")[0],
              ),
          ),
      ),
    );
    for (const document of tree.markdownFiles) {
      documents.add(document);
      let scope = null;
      if (confirmedPaths.includes(document)) scope = "confirmed";
      else if (isDeclared(document, declaredTargets)) scope = "declared";
      members.push({
        path: document,
        root: path,
        index: documentIndex(path, document),
        scope,
      });
    }
    const root = {
      path,
      index: index(`${path}/README.md`),
      strayEntries: (rootDirectory?.entries ?? [])
        .filter(isStrayEntry)
        .map((entry) => `${path}/${entry.name}`),
      directories: directories.map((directory) => ({
        path: directory.path,
        index: index(`${directory.path}/README.md`),
      })),
      confirmedIndexes: [...confirmedIndexes].map(index),
    };
    return root;
  });
  // Every directory of every root is known before any index's items are
  // resolved, so a link to a directory in another root lists its README.
  const indexes = roots
    .flatMap((root) => [
      root.index,
      ...root.directories.map((directory) => directory.index),
    ])
    .filter(({ state }) => state === "present")
    .map(({ path }) =>
      indexStructure(
        path,
        render(path),
        directoryPaths,
        path === developmentGuide,
      ),
    );
  for (const path of confirmedPaths) {
    if (isMarkdownPath(path) && isFile(projectRoot, path)) documents.add(path);
  }
  const sortedDocuments = [...documents].sort();

  return {
    roots,
    ambiguousRoots: inference.ambiguous,
    developmentGuide: index(developmentGuide),
    documents: sortedDocuments,
    members: members.sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    ),
    indexes,
    entryDocumentGlossary: indexes.some((index) => index.path === usageIndex)
      ? glossaryTerms(projectRoot)
      : [],
    links: sortedDocuments.flatMap((source) =>
      documentLinks(projectRoot, source, render(source)),
    ),
  };
}

// Whether an index cites a document in context: a link outside its entries
// names the document, or its context text names it by its path relative to
// the index, such as `project.md` or `./project.md`, or by its repository path.
function citesInContext(structure, document) {
  if (!structure) return false;
  const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const relative = document.slice(structure.path.lastIndexOf("/") + 1);
  const named = new RegExp(
    `(^|[^\\w./-])((\\./)?${escaped(relative)}|${escaped(document)})(?![\\w/-]|\\.\\w)`,
  );
  return (
    structure.context.paths.includes(document) ||
    named.test(structure.context.text)
  );
}

function itemLabel(item) {
  const [line] = item.text.split("\n");
  return line.length > 80 ? `${line.slice(0, 79)}\u2026` : line;
}

// The violations of the documentation rules in a model, as
// `{ rule, path, correction }`, grouped by rule in the order of
// `documentationRules` and by path within each rule. A document whose index
// is missing or empty gets no violation asking to list it there; the
// structural correction to create or populate that index covers it. A listing
// of it in another index is still a violation.
export function documentationRuleViolations(model) {
  const violations = [];
  const violation = (rule, path, correction) =>
    violations.push({ rule, path, correction });
  const indexes = new Map(
    model.indexes.map((structure) => [structure.path, structure]),
  );
  const sortedIndexes = [...indexes.keys()].sort();

  for (const path of sortedIndexes) {
    const { purpose, items } = indexes.get(path);
    if (purpose === null) {
      violation(
        documentationRules.indexEntryForm,
        path,
        "start it with a one-sentence purpose after its title.",
      );
    } else if (!purpose.oneSentence) {
      violation(
        documentationRules.indexEntryForm,
        path,
        "make the purpose after its title one sentence.",
      );
    }
    for (const item of items.filter((candidate) => !candidate.wellFormed)) {
      violation(
        documentationRules.indexEntryForm,
        path,
        `write each entry as one "[Title](path): description" item; "${itemLabel(item)}" is not.`,
      );
    }
  }

  const usagePurpose = indexes.get(usageIndex)?.purpose;
  if (usagePurpose) {
    for (const correction of glossaryCorrections(
      usagePurpose.text,
      model.entryDocumentGlossary,
    )) {
      violation(
        documentationRules.entryDocumentLanguage,
        usageIndex,
        correction,
      );
    }
  }

  const guide = indexes.get(developmentGuide);
  const listedBeforeIndex = new Set(
    (guide?.itemsBeforeIndex ?? [])
      .filter((item) => item.wellFormed)
      .map((item) => item.path),
  );
  const listings = new Map();
  for (const path of sortedIndexes) {
    for (const item of indexes.get(path).items) {
      if (item.path === null) continue;
      const listing = listings.get(item.path) ?? [];
      listing.push(path);
      listings.set(item.path, listing);
    }
  }
  for (const member of model.members) {
    const listing = listings.get(member.path) ?? [];
    if (member.index === null) {
      for (const other of new Set(listing)) {
        violation(
          documentationRules.oneIndex,
          member.path,
          `remove it from ${other}; a root's own index is listed in no index.`,
        );
      }
      continue;
    }
    const citedInContext =
      member.path === projectGuidance &&
      member.index === agentsIndex &&
      citesInContext(indexes.get(agentsIndex), projectGuidance);
    const ownListings = listing.filter((path) => path === member.index).length;
    const listedTooEarly =
      member.index === developmentGuide && listedBeforeIndex.has(member.path);
    if (
      indexes.has(member.index) &&
      ownListings === 0 &&
      !citedInContext &&
      !listedTooEarly
    ) {
      violation(
        documentationRules.oneIndex,
        member.path,
        `list it in ${member.index}.`,
      );
    } else if (ownListings > 1) {
      violation(
        documentationRules.oneIndex,
        member.path,
        `list it once in ${member.index}.`,
      );
    }
    for (const other of new Set(
      listing.filter((path) => path !== member.index),
    )) {
      violation(
        documentationRules.oneIndex,
        member.path,
        citedInContext
          ? `leave it to the in-context citation in ${member.index}; remove it from ${other}.`
          : `list it only in ${member.index}; remove it from ${other}.`,
      );
    }
  }

  if (guide) {
    if (guide.setupAndValidation !== "first") {
      violation(
        documentationRules.developmentGuideOrder,
        guide.path,
        "give its purpose, then a Setup and validation section, then its index.",
      );
    } else if (
      model.members.some(
        (member) =>
          member.index === guide.path && listedBeforeIndex.has(member.path),
      )
    ) {
      violation(
        documentationRules.developmentGuideOrder,
        guide.path,
        "list its entries after the Setup and validation section.",
      );
    }
  }

  for (const member of model.members.filter(
    (candidate) => candidate.scope === null,
  )) {
    violation(
      documentationRules.scopeCoverage,
      member.path,
      "include it in the confirmed documentation scope.",
    );
  }
  return violations;
}
