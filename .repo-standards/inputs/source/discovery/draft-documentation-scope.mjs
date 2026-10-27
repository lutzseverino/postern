import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  declarationTargets,
  developmentGuide,
  documentationCategories,
  documentationModel,
  documentationTree,
  inferredRoots,
  isMarkdownPath,
  repositoryDocumentationRoot,
} from "../operations/lib/documentation-model.mjs";

// Drafts the documentation scope of a repository from its tree, as a
// Repository Standards scope proposal for the `documentation` declaration.
// It is that declaration's discovery script: Repository Standards runs it
// during inspection in a copy of the project, which holds the files Git keeps
// without Git metadata or `.repo-standards`, and passes a discovery request on
// standard input. It decides only what the documentation rules decide, through
// the documentation model the check uses, and lists every other case as an
// unresolved question. It reads the copy and writes the proposal to standard
// output.

const requestFormat = "repo-standards/discovery/v1";
const proposalFormat = "repo-standards/scope/v2";
const declarationId = "documentation";
// The declaration fields that decide its targets.
const targetFields = ["kind", "target", "name", "exclude"];
const glossary = "GLOSSARY.md";
const contextMap = "GLOSSARY-MAP.md";
const directoryIndex = "README.md";

// Paths Repository Standards reserves, which no declaration's scope can hold:
// its product state and its system skills, with their skill links.
const reservedPaths = [
  ".repo-standards",
  ...["repository-standards", "author-standards"].flatMap((name) => [
    `.agents/skills/${name}`,
    `.claude/skills/${name}`,
  ]),
];

// The other declarations' targets come from the source manifest beside this
// script, which the declaration retains with it, so it lies beside the script
// in the acquired source and in the retained one alike.
const manifestPath = fileURLToPath(
  new URL("../standards.yaml", import.meta.url),
);

/** @returns {never} */
function fail(message) {
  throw new Error(message);
}

function isInside(path, directory) {
  return path.startsWith(`${directory}/`);
}

function isWithin(path, directory) {
  return path === directory || isInside(path, directory);
}

// Whether the draft leaves a path out as reserved.
function isReserved(path) {
  return reservedPaths.some((reserved) => isWithin(path, reserved));
}

function baseName(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

// The directory that holds a path, or '' for a path at the repository root.
function parentOf(path) {
  const end = path.lastIndexOf("/");
  return end < 0 ? "" : path.slice(0, end);
}

function byPath(left, right) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function code(path) {
  return `\`${path}\``;
}

function series(items, conjunction = "and") {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`;
}

// The discovery request on standard input: its project root, the copy to
// draft, and the selected profile.
function readRequest(argv) {
  if (argv.length > 0)
    fail(
      `Unknown argument ${argv[0]}. The drafter takes no arguments; it reads a ${requestFormat} request on standard input.`,
    );
  let request;
  try {
    request = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return fail(`Standard input must hold a ${requestFormat} request.`);
  }
  if (request?.format !== requestFormat)
    fail(`Standard input must hold a ${requestFormat} request.`);
  if (request.declaration !== declarationId)
    fail(
      `The request names the ${code(String(request.declaration))} declaration; the drafter drafts ${code(declarationId)}.`,
    );
  if (
    typeof request.projectRoot !== "string" ||
    !isAbsolute(request.projectRoot)
  )
    fail("The request's projectRoot must be an absolute path.");
  if (request.profile != null && typeof request.profile !== "string")
    fail("The request's profile must be a profile name.");
  return {
    projectRoot: request.projectRoot,
    profile: request.profile ?? undefined,
  };
}

function absolutePath(projectRoot, path) {
  return `${projectRoot}${sep}${path.split("/").join(sep)}`;
}

// The errors that show no entry can exist at a path, as the documentation model
// reads them: it is absent, lies below a file or a symbolic link loop, or is
// too long.
const noEntryErrors = new Set(["ENOENT", "ENOTDIR", "ELOOP", "ENAMETOOLONG"]);

// The entry at a path, or null when no entry can exist there.
function entryAt(projectRoot, path) {
  try {
    return lstatSync(absolutePath(projectRoot, path));
  } catch (error) {
    if (noEntryErrors.has(error.code)) return null;
    throw error;
  }
}

// The manifest beside the drafter, with its path.
function readManifest() {
  try {
    return { path: manifestPath, text: readFileSync(manifestPath, "utf8") };
  } catch {
    return fail(
      `Cannot read the standards manifest ${manifestPath} beside the drafter.`,
    );
  }
}

// Whether a manifest key path holds declarations or a declaration's fields:
// the top level, `defaults`, `profiles`, a profile, a declarations mapping,
// or a declaration.
function holdsDeclarations(keyPath) {
  const [section, , declarations] = keyPath;
  if (keyPath.length === 0) return true;
  if (section === "defaults") return keyPath.length <= 3;
  if (section !== "profiles") return false;
  return (
    keyPath.length <= 2 ||
    (declarations === "declarations" && keyPath.length <= 4)
  );
}

// A scalar value without its quotes or trailing comment, undefined for none,
// or null for a quoted value the drafter does not decode: one with a
// backslash escape, without a closing quote, or with text after it.
function scalar(value) {
  if (value === undefined || value.startsWith("#")) return undefined;
  if (!/^["']/.test(value)) return value.replace(/\s+#.*$/, "");
  const single = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(value);
  if (single) return single[1].replaceAll("''", "'");
  const double = /^"([^"\\]*)"(?:\s+#.*)?$/.exec(value);
  return double ? double[1] : null;
}

// The declarations the selected profile resolves to, with the fields that
// decide their targets. As Repository Standards resolves them, a profile
// declaration replaces the default of its ID, adds a new one, or, with
// `exclude: true`, removes it. The request names the selected profile, and a
// manifest with one profile needs no name. The manifest's block mappings are read by indentation, and only the key paths below matter:
// `defaults.declarations.<id>.<field>` and
// `profiles.<profile>.declarations.<id>.<field>`. A field that decides a
// target holds a single-line value on its own line, plain or quoted; any other
// form fails rather than being misread.
function manifestDeclarations(profile) {
  const { path: manifest, text } = readManifest();
  const unreadable = (id) =>
    fail(`${manifest} declares ${id} in a form the drafter cannot read.`);
  const defaults = new Map();
  const profiles = new Map();
  const keys = [];
  // The field read on the previous line, which no deeper line may continue.
  let readField = null;
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (readField && indent > readField.indent) unreadable(readField.id);
    readField = null;
    const entry = /^( *)([A-Za-z0-9._-]+):(?:\s+(\S.*?))?\s*$/.exec(line);
    if (!entry) {
      // A line that is not a plain key is a sequence item, a document marker
      // or directive, or continues a value above it. At the top level or
      // directly under a declaration, the declarations, or what holds them,
      // only a key in another form can be none of these.
      const parent = keys
        .filter((key) => key.indent < indent)
        .map(({ key }) => key);
      if (!/^\s*-|^\.\.\.|^%/.test(line) && holdsDeclarations(parent)) {
        const where =
          parent.length > 0 ? `under ${parent.join(".")}` : "at its top level";
        fail(
          `${manifest} has a line ${where} that the drafter cannot read: ${line.trim()}`,
        );
      }
      continue;
    }
    while (keys.length > 0 && keys.at(-1).indent >= indent) keys.pop();
    keys.push({ indent, key: entry[2] });
    const value = scalar(entry[3]);
    const keyPath = keys.map(({ key }) => key);
    // The declarations this line belongs to, and its key path below them.
    let declarations = null;
    let declarationPath = null;
    if (keyPath[0] === "defaults" && keyPath[1] === "declarations") {
      declarations = defaults;
      declarationPath = keyPath.slice(2);
    } else if (keyPath[0] === "profiles" && keyPath.length > 1) {
      if (!profiles.has(keyPath[1])) profiles.set(keyPath[1], new Map());
      if (keyPath[2] === "declarations") {
        declarations = profiles.get(keyPath[1]);
        declarationPath = keyPath.slice(3);
      }
    }
    // `defaults`, `profiles`, and each profile hold their mappings below them.
    const container =
      keyPath.length === 1
        ? ["defaults", "profiles"].includes(keyPath[0])
        : keyPath.length === 2 && keyPath[0] === "profiles";
    if (container && value !== undefined)
      fail(
        `${manifest} writes ${keyPath.join(".")} in a form the drafter cannot read.`,
      );
    if (!declarations) continue;
    const [id, field, ...deeper] = declarationPath;
    if (id === undefined) {
      if (value !== undefined && value !== "{}")
        fail(
          `${manifest} lists its declarations in a form the drafter cannot read.`,
        );
    } else if (field === undefined) {
      if (value === undefined) declarations.set(id, { id });
      else if (/^\{\s*exclude:\s*true\s*\}$/.test(value))
        declarations.set(id, { id, exclude: true });
      else unreadable(id);
    } else if (deeper.length === 0 && targetFields.includes(field)) {
      // A missing value, a block scalar, an anchor, alias, or tag, a flow
      // collection, or a quoted value the drafter does not decode. `-`, `?`,
      // and `:` are indicators only before whitespace.
      if (value == null || /^(?:[,[\]{}&*!|>%@`]|[-?:](?:\s|$))/.test(entry[3]))
        unreadable(id);
      readField = { indent, id };
      const declaration = declarations.get(id);
      if (field === "exclude") declaration.exclude = value === "true";
      else declaration[field] = value;
    }
  }
  const resolved = new Map(defaults);
  for (const [id, declaration] of selectedProfile(
    manifest,
    profiles,
    profile,
  )) {
    if (declaration.exclude) resolved.delete(id);
    else resolved.set(id, declaration);
  }
  const declarations = [...resolved.values()];
  if (
    !declarations.some(
      (candidate) =>
        candidate.id === declarationId && candidate.kind === "repository",
    )
  ) {
    fail(`${manifest} declares no ${declarationId} repository declaration.`);
  }
  return declarations;
}

// The declarations of the profile the request names, or of the manifest's one
// profile when it names none.
function selectedProfile(manifest, profiles, name) {
  const names = series([...profiles.keys()].map(code));
  if (name !== undefined) {
    if (!profiles.has(name))
      fail(
        `${manifest} declares no ${code(name)} profile; it declares ${names}.`,
      );
    return profiles.get(name);
  }
  if (profiles.size !== 1)
    fail(
      `${manifest} declares ${profiles.size} profiles (${names}); the request must name the selected one.`,
    );
  return [...profiles.values()][0];
}

// The targets the other declarations own, and the declaration that owns a
// path, or null.
function ownership(declarations) {
  const others = declarations.filter(
    (declaration) => declaration.id !== declarationId,
  );
  const paths = new Map();
  const directories = [];
  for (const declaration of others) {
    const targets = declarationTargets([declaration]);
    for (const path of targets.paths) paths.set(path, declaration.id);
    for (const directory of targets.directories)
      directories.push([directory, declaration.id]);
  }
  return {
    declaredTargets: declarationTargets(others),
    owner: (path) =>
      paths.get(path) ??
      directories.find(([directory]) => isWithin(path, directory))?.[1] ??
      null,
  };
}

// The regular files of the copy, outside the reserved paths,
// reached through real directories only, and the directories that hold them.
// The copy holds the files Git keeps, tracked or not ignored, so these are the
// paths the CLI's discovery observation offers as evidence.
function keptTree(projectRoot) {
  const files = new Set();
  const visit = (directory) => {
    for (const entry of readdirSync(absolutePath(projectRoot, directory), {
      withFileTypes: true,
    })) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      // Git metadata, which the copy never holds, is no evidence either.
      if (path === ".git" || isReserved(path)) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.add(path);
    }
  };
  visit("");
  const directories = new Set();
  for (const path of files) {
    for (
      let directory = parentOf(path);
      directory !== "";
      directory = parentOf(directory)
    )
      directories.add(directory);
  }
  return { files, directories };
}

const documentationRoot = code(repositoryDocumentationRoot);

const reasons = {
  file: `A file under the documentation root ${documentationRoot}.`,
  rootIndex: `The index of the documentation root ${documentationRoot}, to create.`,
  directoryIndex: (directory) =>
    `The index of the documentation directory ${code(directory)}, to create.`,
  developmentGuide:
    "The development guide, which the contribution guide requires, to create.",
  owned: (id) => `Owned by the ${code(id)} declaration.`,
  glossary: "The domain glossary at the repository root.",
  contextMap: "The context map at the repository root.",
  contextGlossary: `A context glossary that ${code(contextMap)} lists.`,
  outsideIndex: `A ${directoryIndex} outside the documentation roots, which the documentation check would read as a documentation root's index. If it is a Project README, the \`project-readmes\` declaration's proposal covers it.`,
};

const questions = {
  root: (candidate, directories, outer) =>
    `Is ${code(candidate)} a documentation root${outer.length > 0 ? `, if ${series(outer.map(code), "or")} is not` : ""}? Its ${series(directories.map(code))} ${directories.length === 1 ? "directory holds" : "directories hold"} Markdown documents. If it is, include its files and a new index for each of its directories without one, as this draft does for ${documentationRoot}. If it is not, its ${directoryIndex} files stay out of this scope.`,
  outside: (group, files) =>
    `Which of these Markdown files ${group === "." ? "at the repository root" : `under ${code(group)}`} are documentation this scope must cover, such as a document to move into a documentation category: ${series(files.map(code))}? Include each one, with its destination when it moves.`,
  stray: (entry) =>
    `${code(entry)} lies directly under the documentation root ${documentationRoot}, outside the ${series(documentationCategories)} categories. Which category does it move to? Include each destination path and any new directory's index; the files Git keeps in it are already included.`,
  unkept: (directory) =>
    `${code(directory)} under the documentation root ${documentationRoot} holds no file that Git keeps, but the documentation check reads it. Should it be removed, or should Git keep a file in it?`,
  special: (path) =>
    `${code(path)} under the documentation root ${documentationRoot} is a symbolic link or special file, which the scope cannot hold. Should it be replaced with a regular file or removed?`,
  glossary: (path) =>
    `Is ${code(path)} a domain glossary or context map of this repository? Include it if it is.`,
  notDirectory: (directory) =>
    `${code(directory)} must be a directory to hold its documentation index, but it is not. Should it be removed or renamed?`,
  notIndex: (path) =>
    `${code(path)} must be a file, the documentation index of its directory, but it is a directory. Should it be removed or renamed?`,
};

// What the draft covers.
function coverage() {
  return `Drafted from the repository tree by ${code("discovery/draft-documentation-scope.mjs")}: every file Git keeps under the documentation root ${documentationRoot}, a new index for each of its directories without one, the development guide, and the domain glossaries and context maps the rules identify. Paths other declarations own are left out, and so is each ${directoryIndex} outside the documentation roots. Link-repair files and move destinations enter when the work needs them.`;
}

// A draft in progress: its candidates by path, the new indexes among them by
// their directory, its questions about one path, each asked once, and its
// other questions.
class Draft {
  candidates = new Map();
  createdIndexes = new Map();
  unresolved = new Map();
  otherQuestions = [];

  include(path, reason, evidence) {
    this.candidates.set(path, { path, decision: "include", reason, evidence });
  }

  exclude(path, reason) {
    this.candidates.set(path, {
      path,
      decision: "exclude",
      reason,
      evidence: [path],
    });
  }

  ask(path, question) {
    if (!this.unresolved.has(path)) this.unresolved.set(path, question);
  }

  isAsked(path) {
    return [...this.unresolved.keys()].some((asked) => isWithin(path, asked));
  }

  included() {
    return [...this.candidates.values()]
      .filter((candidate) => candidate.decision === "include")
      .map((candidate) => candidate.path);
  }

  proposal() {
    return {
      format: proposalFormat,
      declarations: [
        {
          id: declarationId,
          coverage: coverage(),
          candidates: [...this.candidates.values()].sort(byPath),
          unresolved: [
            ...this.unresolved.values(),
            ...this.otherQuestions,
          ].sort(),
        },
      ],
    };
  }
}

// A new index cites its directory when the copy holds a regular file there,
// otherwise nothing: included missing files need no evidence. A directory path
// that is not a directory cannot hold an index, which is a question.
function createIndex(draft, context, directory) {
  const path = `${directory}/${directoryIndex}`;
  if (context.owner(path) || draft.candidates.has(path)) return;
  const entry = entryAt(context.projectRoot, directory);
  if (entry && !entry.isDirectory()) {
    draft.ask(directory, questions.notDirectory(directory));
    return;
  }
  let reason = reasons.directoryIndex(directory);
  if (path === developmentGuide) reason = reasons.developmentGuide;
  else if (directory === repositoryDocumentationRoot)
    reason = reasons.rootIndex;
  draft.include(
    path,
    reason,
    context.kept.directories.has(directory) ? [directory] : [],
  );
  draft.createdIndexes.set(path, directory);
}

// Every entry under the documentation root, by the tree walk the check uses.
// Each regular file there is one the copy holds, so Git keeps it.
function draftRoot(draft, context) {
  const { kept, owner } = context;
  const { directories } = documentationTree(
    context.projectRoot,
    repositoryDocumentationRoot,
  );
  const skipped = [];
  for (const { path: directory, entries } of directories) {
    if (skipped.some((other) => isWithin(directory, other))) continue;
    if (
      directory !== repositoryDocumentationRoot &&
      !kept.directories.has(directory)
    ) {
      draft.ask(directory, questions.unkept(directory));
      skipped.push(directory);
      continue;
    }
    let indexed = false;
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.name === directoryIndex) indexed = true;
      if (entry.isDirectory()) {
        if (entry.name === directoryIndex) {
          draft.ask(path, questions.notIndex(path));
          skipped.push(path);
        }
        continue;
      }
      const declaration = owner(path);
      if (declaration) {
        if (entry.isFile()) draft.exclude(path, reasons.owned(declaration));
      } else if (entry.isFile()) {
        draft.include(path, reasons.file, [path]);
      } else {
        draft.ask(path, questions.special(path));
      }
    }
    if (!indexed) createIndex(draft, context, directory);
  }
  if (directories.length === 0)
    createIndex(draft, context, repositoryDocumentationRoot);
}

// The repository root's glossary and context map are decided, and so is each
// context glossary that context map lists by file or directory. Any other
// glossary or context map is a question.
function draftGlossaries(draft, context, model) {
  const glossaries = [...context.kept.files]
    .filter(
      (path) =>
        [glossary, contextMap].includes(baseName(path)) &&
        !isInside(path, repositoryDocumentationRoot) &&
        !context.owner(path),
    )
    .sort();
  const listed = model.links
    .filter(
      (link) =>
        link.source === contextMap &&
        !link.broken &&
        typeof link.path === "string",
    )
    .map((link) => link.path.replace(/\/+$/, ""));
  for (const path of glossaries) {
    if (path === glossary) draft.include(path, reasons.glossary, [path]);
    else if (path === contextMap)
      draft.include(path, reasons.contextMap, [path]);
    else if (
      baseName(path) === glossary &&
      draft.candidates.has(contextMap) &&
      (listed.includes(path) || listed.includes(parentOf(path)))
    ) {
      draft.include(path, reasons.contextGlossary, [path, contextMap]);
    } else {
      draft.ask(path, questions.glossary(path));
    }
  }
}

// Top-level entries outside the categories move into one; no rule decides
// which. Their files are already included as move sources, and a moved
// directory needs no new index where it is now.
function askStrayEntries(draft, model) {
  const root = model.roots.find(
    (candidate) => candidate.path === repositoryDocumentationRoot,
  );
  for (const entry of root?.strayEntries ?? []) {
    if (draft.isAsked(entry)) continue;
    draft.ask(entry, questions.stray(entry));
    for (const path of draft.createdIndexes.keys()) {
      if (isInside(path, entry)) draft.candidates.delete(path);
    }
  }
}

// A directory outside the documentation root whose category-named directories
// hold Markdown documents may be a documentation root; no rule decides it,
// unless another declaration owns it or its index. A candidate inside another
// can be a root only if the outer one is not.
function askCandidateRoots(draft, context) {
  const { kept, owner } = context;
  const categoryDirectories = [...kept.directories]
    .filter((directory) =>
      documentationCategories.includes(baseName(directory)),
    )
    .filter(
      (directory) =>
        !isWithin(directory, repositoryDocumentationRoot) && !owner(directory),
    )
    .filter((directory) =>
      [...kept.files].some(
        (path) => isInside(path, directory) && isMarkdownPath(path),
      ),
    );
  const { candidatesWithCategories } = inferredRoots(
    categoryDirectories.map((directory) => `${directory}/${directoryIndex}`),
  );
  const candidates = candidatesWithCategories
    .filter(
      (candidate) =>
        !isWithin(candidate, repositoryDocumentationRoot) &&
        !isInside(repositoryDocumentationRoot, candidate),
    )
    .filter(
      (candidate) =>
        !owner(candidate) && !owner(`${candidate}/${directoryIndex}`),
    );
  for (const candidate of candidates) {
    const directories = categoryDirectories
      .filter((directory) => parentOf(directory) === candidate)
      .sort();
    const outer = candidates.filter((other) => isInside(candidate, other));
    draft.ask(candidate, questions.root(candidate, directories, outer));
  }
}

// A README outside the documentation root is never in this scope: the check
// reads every README in the scope as a documentation root's index. The
// question about a candidate root decides its READMEs instead. Other Markdown
// files outside the documentation root may be documentation to cover or move,
// one question per top-level directory.
function draftOutsideRoot(draft, context) {
  const groups = new Map();
  for (const path of [...context.kept.files].sort()) {
    if (
      !isMarkdownPath(path) ||
      isInside(path, repositoryDocumentationRoot) ||
      context.owner(path)
    )
      continue;
    if (baseName(path) === directoryIndex) {
      if (!draft.isAsked(path)) draft.exclude(path, reasons.outsideIndex);
      continue;
    }
    if ([glossary, contextMap].includes(baseName(path))) continue;
    const group = path.includes("/") ? path.slice(0, path.indexOf("/")) : ".";
    groups.set(group, [...(groups.get(group) ?? []), path]);
  }
  for (const [group, files] of groups)
    draft.otherQuestions.push(questions.outside(group, files));
}

function draftDocumentationScope({ projectRoot, profile }) {
  const { declaredTargets, owner } = ownership(manifestDeclarations(profile));
  const kept = keptTree(projectRoot);
  const context = { projectRoot, kept, owner };
  const draft = new Draft();

  draftRoot(draft, context);
  const guideDirectory = parentOf(developmentGuide);
  if (
    !draft.candidates.has(developmentGuide) &&
    !draft.isAsked(guideDirectory) &&
    !draft.isAsked(developmentGuide)
  ) {
    createIndex(draft, context, guideDirectory);
  }
  for (const path of [glossary, contextMap]) {
    if (kept.files.has(path) && !owner(path))
      draft.include(
        path,
        path === glossary ? reasons.glossary : reasons.contextMap,
        [path],
      );
  }

  const model = documentationModel(projectRoot, draft.included(), {
    declaredTargets,
  });
  draftGlossaries(draft, context, model);
  askStrayEntries(draft, model);
  askCandidateRoots(draft, context);
  draftOutsideRoot(draft, context);
  return draft.proposal();
}

try {
  process.stdout.write(
    `${JSON.stringify(draftDocumentationScope(readRequest(process.argv.slice(2))), null, 2)}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
