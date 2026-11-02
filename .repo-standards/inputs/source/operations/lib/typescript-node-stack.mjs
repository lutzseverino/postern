import { lstatSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { localPathExists } from "./local-markdown-links.mjs";

// The facts of the `typescript-node` stack that a Project's manifests show,
// shared by the stack's check and its scope drafter so that both read a
// Project the same way. A Project is one `package.json`; its workspace root is
// the nearest directory at or above it whose workspace configuration lists
// it, or its own directory. Workspace-shared facts (`packageManager`, the
// lockfile and `engines`) are read at that root.

export const manifestName = "package.json";
export const lockfileName = "pnpm-lock.yaml";
export const pnpmWorkspaceName = "pnpm-workspace.yaml";
// Why an unreadable `pnpm-workspace.yaml` can hold a supported member list:
// the reader validates the whole document, not only its `packages` value.
export const unreadableWorkspaceYamlCause =
  "unsupported or malformed YAML anywhere in the document can prevent reading its members, even when `packages` is a supported list of plain or quoted patterns";
export const nodeMajors = [24, 26];
// The development tools a Project or its workspace root declares, with their
// major versions.
export const declaredTools = [
  { name: "oxlint", major: 1 },
  { name: "prettier", major: 3 },
];

const dependencyFields = ["dependencies", "devDependencies"];

function absolutePath(projectRoot, path) {
  return join(projectRoot, ...path.split("/"));
}

// The directory that holds a path, or '' for a path at the repository root.
export function parentOf(path) {
  const end = path.lastIndexOf("/");
  return end < 0 ? "" : path.slice(0, end);
}

export function joinPath(directory, name) {
  return directory === "" ? name : `${directory}/${name}`;
}

function code(text) {
  return `\`${text}\``;
}

function series(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

// Whether a path is a project-relative `package.json` path, at the root or in a
// directory.
export function isManifestPath(path) {
  return (
    typeof path === "string" &&
    path !== "" &&
    !posix.isAbsolute(path) &&
    !path.includes("\\") &&
    posix.normalize(path) === path &&
    path !== ".." &&
    !path.startsWith("../") &&
    posix.basename(path) === manifestName
  );
}

// Whether a regular file, not a symbolic link, lies at a path inside the
// project. Every file the module reads passes through here: the shared
// local-path policy refuses a path whose directories leave the project
// through a symbolic link, as the Project README check does.
export function isRegularFile(projectRoot, path) {
  try {
    return (
      localPathExists(projectRoot, path) &&
      lstatSync(absolutePath(projectRoot, path)).isFile()
    );
  } catch {
    return false;
  }
}

// The parsed manifest at a path: `{ manifest }`, or `{ missing: true }` when no
// regular file lies there, or `{ unreadable: true }` when it is not a JSON
// object.
export function readManifest(projectRoot, path) {
  if (!isRegularFile(projectRoot, path)) return { missing: true };
  try {
    const manifest = JSON.parse(
      readFileSync(absolutePath(projectRoot, path), "utf8"),
    );
    if (
      manifest === null ||
      typeof manifest !== "object" ||
      Array.isArray(manifest)
    )
      return { unreadable: true };
    return { manifest };
  } catch {
    return { unreadable: true };
  }
}

// Preserve non-string scalar types without making them string patterns or
// versions. Their exact values are irrelevant to the manifest readers.
const nonStringYamlScalar = Symbol("non-string YAML scalar");

// YAML separation uses ASCII spaces (and line breaks in flow sequences),
// not JavaScript's broader whitespace set. Tabs are rejected document-wide.
function trimYamlSpace(text) {
  return text.replace(/^[ \n]+|[ \n]+$/g, "");
}

// A string without quotes/comments, a non-string marker, or null for a form
// this reader does not decode. Single quotes decode `''`, and double quotes
// decode only `\\"`, `\\\\` and `\\/`. A plain scalar may not start with an
// indicator or hold a mapping's `: `, and inside a flow collection it may not
// hold a flow indicator.
function yamlScalar(value, { flow = false } = {}) {
  const text = trimYamlSpace(value);
  if (text === "" || text.startsWith("#")) return null;
  const single = /^'((?:[^']|'')*)'(?: +#.*| *)$/.exec(text);
  if (single) return single[1].replaceAll("''", "'");
  const double = /^"((?:[^"\\]|\\["\\/])*)"(?: +#.*| *)$/.exec(text);
  if (double) return double[1].replace(/\\(["\\/])/g, "$1");
  if (/^(?:["'&*!|>%@`[\]{},#]|[-?:](?: |$))/.test(text)) return null;
  const plain = text.replace(/ +#.*$/, "");
  if (/:(?: |$)/.test(plain) || (flow && /[[\]{},]/.test(plain))) return null;
  // YAML's core schema gives these unquoted scalars non-string values.
  if (
    /^(?:null|true|false|~|[-+]?(?:\.inf|\.nan|0o[0-7]+|0x[\da-f]+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?))$/i.test(
      plain,
    )
  )
    return nonStringYamlScalar;
  return plain;
}

// The items of a flow sequence that opens at the start of `text`, which may
// span lines: `{ items, rest }`, with the text after its closing bracket, or
// null for a form this reader does not decode. Items split only at commas
// outside quoted scalars and outside nested brackets and braces, a `#` after
// whitespace outside quotes starts a comment, and one trailing comma is
// allowed. A nested collection or an item spanning lines is not decoded.
function flowSequence(text) {
  const items = [];
  let item = "";
  let depth = 0;
  let quote = null;
  for (let index = 1; index < text.length; index++) {
    const character = text[index];
    if (quote === "'") {
      item += character;
      if (character === "'") {
        if (text[index + 1] === "'") item += text[++index];
        else quote = null;
      }
      continue;
    }
    if (quote === '"') {
      item += character;
      if (character === "\\") item += text[++index] ?? "";
      else if (character === '"') quote = null;
      continue;
    }
    if (character === "#" && (index === 1 || /[ \n]/.test(text[index - 1]))) {
      while (index + 1 < text.length && text[index + 1] !== "\n") index++;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "[" || character === "{") depth++;
    else if ((character === "]" || character === "}") && depth > 0) depth--;
    else if (character === "]") {
      items.push(item);
      const last = trimYamlSpace(items.at(-1));
      // `[]` and `[a, b,]` end with one empty item, which is no entry.
      if (last === "") items.pop();
      if (
        items.some(
          (entry) =>
            trimYamlSpace(entry) === "" || trimYamlSpace(entry).includes("\n"),
        )
      )
        return null;
      const scalars = items.map((entry) => yamlScalar(entry, { flow: true }));
      if (scalars.includes(null)) return null;
      return { items: scalars, rest: text.slice(index + 1) };
    } else if (character === "}") return null;
    else if (character === "," && depth === 0) {
      items.push(item);
      item = "";
      continue;
    }
    item += character;
  }
  return null;
}

// A mapping separator must precede any comment outside a quoted key. A colon
// inside comment text cannot turn a scalar into a mapping entry.
function yamlMappingEntry(text) {
  let quote = null;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quote) {
      if (quote === '"' && character === "\\") index++;
      else if (character === quote) {
        if (quote === "'" && text[index + 1] === "'") index++;
        else quote = null;
      }
    } else if (index === 0 && (character === "'" || character === '"'))
      quote = character;
    else if (character === "#" && (index === 0 || text[index - 1] === " "))
      return null;
    else if (
      character === ":" &&
      (index + 1 === text.length || text[index + 1] === " ")
    )
      return [text, text.slice(0, index), text.slice(index + 1)];
  }
  return null;
}

// Decode only the block mappings/sequences and scalar flow sequences used by
// workspace settings. Validate the whole document before trusting any entry:
// duplicate keys, uneven indentation and multiline continuations must not
// silently change membership or move catalog entries into another mapping.
function workspaceYaml(text) {
  if (
    text.startsWith("\uFEFF") ||
    [...text.replaceAll("\r\n", "\n")].some(
      (character) => character.codePointAt(0) < 32 && character !== "\n",
    )
  )
    return null;
  const lines = text
    .split(/\r?\n/)
    .filter(
      (line) =>
        trimYamlSpace(line) !== "" && !line.replace(/^ +/, "").startsWith("#"),
    );
  if (/^---(?: +#.*)?$/.test(lines[0] ?? "")) lines.shift();
  if (/^\.\.\.(?: +#.*)?$/.test(lines.at(-1) ?? "")) lines.pop();
  // Only standalone markers around one document are supported. An inline
  // marker must not become an ordinary key and hide malformed workspace YAML.
  if (lines.some((line) => /^(?:---|\.\.\.)(?: |$)/.test(line))) return null;
  let index = 0;
  const indentation = (line) => line.length - line.replace(/^ +/, "").length;
  function block(indent, sequence = false) {
    /** @type {any} */
    const result = sequence ? [] : new Map();
    while (index < lines.length) {
      const line = lines[index];
      const column = indentation(line);
      if (column < indent) break;
      if (column !== indent) throw new Error("Uneven indentation");
      const content = line.slice(column);
      const item = /^- +(.*)$/.exec(content);
      if (sequence && !item) break;
      const entry = sequence ? item : yamlMappingEntry(content);
      if (!entry) throw new Error("Unsupported entry");
      const key = sequence ? null : yamlScalar(entry[1]);
      if (!sequence && (typeof key !== "string" || result.has(key)))
        throw new Error("Unsupported or duplicate key");
      const raw = trimYamlSpace(sequence ? entry[1] : (entry[2] ?? ""));
      let value;
      if (raw.startsWith("[")) {
        const input = [raw, ...lines.slice(index + 1)].join("\n");
        const flow = flowSequence(input);
        if (!flow || !/^(?: *| +#.*)$/.test(flow.rest.split("\n")[0]))
          throw new Error("Unsupported flow sequence");
        const consumed = input
          .slice(0, input.length - flow.rest.length)
          .split("\n").length;
        if (
          lines
            .slice(index + 1, index + consumed)
            .some(
              (continuation) =>
                indentation(continuation) < indent ||
                (indentation(continuation) === indent &&
                  !continuation.replace(/^ +/, "").startsWith("]")),
            )
        )
          throw new Error("Unindented flow continuation");
        index += consumed;
        value = flow.items;
      } else {
        index++;
        if (raw === "" || raw.startsWith("#")) {
          const next = lines[index];
          const nextIndent = next === undefined ? -1 : indentation(next);
          const nextSequence = /^- +/.test(next?.replace(/^ +/, "") ?? "");
          if (
            nextIndent > indent ||
            (!sequence && nextIndent === indent && nextSequence)
          )
            value = block(nextIndent, nextSequence);
          else value = null;
        } else {
          value = yamlScalar(raw);
          if (value === null) throw new Error("Unsupported scalar");
        }
      }
      if (sequence) result.push(value);
      else result.set(key, value);
    }
    return result;
  }
  try {
    const document = block(0);
    return index === lines.length ? document : null;
  } catch {
    return null;
  }
}

// An ordered string list, [] without a packages key, or null for unsupported
// YAML. Unsupported input stays unreadable rather than changing membership.
// Quoted packages keys remain outside the reader's supported subset.
export function pnpmWorkspacePackages(text) {
  if (text.split(/\r?\n/).some((line) => /^["']packages["'] *:/.test(line)))
    return null;
  const document = workspaceYaml(text);
  if (!document) return null;
  if (!document.has("packages")) return [];
  const patterns = document.get("packages");
  return Array.isArray(patterns) &&
    patterns.every((item) => typeof item === "string")
    ? patterns
    : null;
}

// Return only string catalog entries at their exact mapping depth. Nested
// values and unsupported documents leave specifiers unresolved.
export function pnpmCatalogs(text) {
  const document = workspaceYaml(text);
  const catalogs = new Map();
  if (!document) return catalogs;
  const add = (name, entries) => {
    if (typeof name !== "string" || !(entries instanceof Map)) return;
    catalogs.set(
      name,
      new Map([...entries].filter(([, value]) => typeof value === "string")),
    );
  };
  add("default", document.get("catalog"));
  const named = document.get("catalogs");
  if (named instanceof Map)
    for (const [name, entries] of named)
      if (name !== "default" || !catalogs.has(name)) add(name, entries);
  return catalogs;
}

// The workspace configuration of a directory: `null` when it configures no
// workspace, or `{ patterns, sources }` with its member patterns and the files
// that state them, or `{ unreadable, sources }` when a file states them in a
// form this reader does not decode. A `pnpm-workspace.yaml` takes precedence
// over the `workspaces` field of the directory's `package.json`, as pnpm reads
// it.
export function workspaceConfiguration(projectRoot, directory) {
  const pnpmWorkspace = joinPath(directory, pnpmWorkspaceName);
  if (isRegularFile(projectRoot, pnpmWorkspace)) {
    const patterns = pnpmWorkspacePackages(
      readFileSync(absolutePath(projectRoot, pnpmWorkspace), "utf8"),
    );
    return patterns === null
      ? { unreadable: true, sources: [pnpmWorkspace] }
      : { patterns, sources: [pnpmWorkspace] };
  }
  const manifestPath = joinPath(directory, manifestName);
  const { manifest } = readManifest(projectRoot, manifestPath);
  if (!manifest || manifest.workspaces === undefined) return null;
  const workspaces = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : manifest.workspaces?.packages;
  if (
    !Array.isArray(workspaces) ||
    workspaces.some((pattern) => typeof pattern !== "string")
  )
    return { unreadable: true, sources: [manifestPath] };
  return { patterns: workspaces, sources: [manifestPath] };
}

// Whether a directory matches a workspace glob, through Node's own
// `path.matchesGlob`, after the `./` prefix and trailing slashes pnpm and npm
// tolerate. A leading `**` also matches zero directories.
function matchesWorkspaceGlob(relativeDirectory, pattern) {
  return posix.matchesGlob(
    relativeDirectory,
    pattern.replace(/^\.\//, "").replace(/\/+$/, ""),
  );
}

// Whether a directory, relative to a workspace root, is a member that the
// workspace's patterns list: one positive pattern matches it and no `!`
// pattern does. `node_modules` directories are never members.
export function isWorkspaceMember(patterns, relativeDirectory) {
  if (
    relativeDirectory === "" ||
    relativeDirectory.split("/").includes("node_modules")
  )
    return false;
  const negated = patterns.filter((pattern) => pattern.startsWith("!"));
  const positive = patterns.filter((pattern) => !pattern.startsWith("!"));
  return (
    positive.some((pattern) =>
      matchesWorkspaceGlob(relativeDirectory, pattern),
    ) &&
    !negated.some((pattern) =>
      matchesWorkspaceGlob(relativeDirectory, pattern.slice(1)),
    )
  );
}

function relativeTo(directory, ancestor) {
  return ancestor === "" ? directory : directory.slice(ancestor.length + 1);
}

// The workspace root of the Project whose manifest lies at a path: its own
// directory when that configures a workspace, else the nearest ancestor whose
// workspace configuration lists it, else its own directory. Returns
// `{ root, sources }`, with the files that configure that workspace, or
// `{ unreadable }` naming the configuration file this reader cannot decode
// on the way.
export function workspaceRootOf(projectRoot, manifestPath) {
  const directory = parentOf(manifestPath);
  const own = workspaceConfiguration(projectRoot, directory);
  if (own?.unreadable) return { unreadable: own.sources[0] };
  if (own) return { root: directory, sources: own.sources };
  let ancestor = directory;
  while (ancestor !== "") {
    ancestor = parentOf(ancestor);
    const configuration = workspaceConfiguration(projectRoot, ancestor);
    if (!configuration) continue;
    if (configuration.unreadable)
      return { unreadable: configuration.sources[0] };
    if (
      isWorkspaceMember(configuration.patterns, relativeTo(directory, ancestor))
    )
      return { root: ancestor, sources: configuration.sources };
  }
  return { root: directory, sources: [] };
}

// A version or partial version, such as `24`, `24.1` or `24.1.2`, with an
// optional `v` or `=` prefix and prerelease or build suffix: its numeric
// parts, or null. `x`, `X` and `*` parts end a partial version.
function parseVersion(text) {
  const match =
    /^[v=]?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      text,
    );
  if (!match) return null;
  const parts = [];
  for (const part of match.slice(1)) {
    if (part === undefined || /^[xX*]$/.test(part)) break;
    parts.push(Number(part));
  }
  return parts;
}

function padded(parts) {
  return [...parts, 0, 0, 0].slice(0, 3);
}

// The first version after every version a partial version names.
function after(parts) {
  const next = [...parts];
  next[next.length - 1] += 1;
  return padded(next);
}

function compare(left, right) {
  for (let index = 0; index < 3; index++)
    if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}

const everything = { low: null, high: null };

// The interval of versions one comparator admits: `low` and `high` bounds,
// each `{ version, inclusive }` or null for none. Null when it cannot be read.
function comparatorInterval(token) {
  if (/^[xX*]?$/.test(token)) return everything;
  const match = /^(<=|>=|<|>|=|\^|~)?(.+)$/.exec(token);
  const [, operator = "", rest] = match;
  const parts = parseVersion(rest);
  if (parts === null) return null;
  if (parts.length === 0)
    return operator === "<" ? { empty: true } : everything;
  const full = parts.length === 3;
  const low = padded(parts);
  switch (operator) {
    case "":
    case "=":
      return full
        ? {
            low: { version: low, inclusive: true },
            high: { version: low, inclusive: true },
          }
        : {
            low: { version: low, inclusive: true },
            high: { version: after(parts), inclusive: false },
          };
    case ">=":
      return { low: { version: low, inclusive: true }, high: null };
    case ">":
      return full
        ? { low: { version: low, inclusive: false }, high: null }
        : { low: { version: after(parts), inclusive: true }, high: null };
    case "<":
      return { low: null, high: { version: low, inclusive: false } };
    case "<=":
      return full
        ? { low: null, high: { version: low, inclusive: true } }
        : { low: null, high: { version: after(parts), inclusive: false } };
    case "^": {
      const leading = parts.findIndex((part) => part !== 0);
      const significant =
        leading === -1 ? parts.length - 1 : Math.min(leading, parts.length - 1);
      return {
        low: { version: low, inclusive: true },
        high: {
          version: after(parts.slice(0, significant + 1)),
          inclusive: false,
        },
      };
    }
    case "~":
      return {
        low: { version: low, inclusive: true },
        high: {
          version: after(parts.slice(0, Math.min(parts.length, 2))),
          inclusive: false,
        },
      };
  }
  return null;
}

function tighterLow(left, right) {
  if (left === null) return right;
  if (right === null) return left;
  const order = compare(left.version, right.version);
  if (order !== 0) return order > 0 ? left : right;
  return left.inclusive ? right : left;
}

function tighterHigh(left, right) {
  if (left === null) return right;
  if (right === null) return left;
  const order = compare(left.version, right.version);
  if (order !== 0) return order < 0 ? left : right;
  return left.inclusive ? right : left;
}

// The interval of versions a comparator set admits, or null when one of its
// comparators cannot be read. A hyphen range is one set.
function comparatorSetInterval(text) {
  const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(text);
  if (hyphen) {
    const from = parseVersion(hyphen[1]);
    const to = parseVersion(hyphen[2]);
    if (!from?.length || !to?.length) return null;
    return {
      low: { version: padded(from), inclusive: true },
      high:
        to.length === 3
          ? { version: to, inclusive: true }
          : { version: after(to), inclusive: false },
    };
  }
  const tokens = text
    .replace(/(<=|>=|<|>|=|\^|~)\s+/g, "$1")
    .split(/\s+/)
    .filter(Boolean);
  let interval = everything;
  for (const token of tokens.length > 0 ? tokens : [""]) {
    const next = comparatorInterval(token);
    if (next === null) return null;
    if (next.empty) return { empty: true };
    interval = {
      low: tighterLow(interval.low, next.low),
      high: tighterHigh(interval.high, next.high),
    };
  }
  return interval;
}

// The majors an interval admits, or `{ from }` when it admits every major
// from one on.
/** @param {{ low?: any, high?: any, empty?: boolean }} interval */
function intervalMajors({ low, high, empty }) {
  if (empty) return [];
  if (low && high) {
    const order = compare(low.version, high.version);
    if (order > 0 || (order === 0 && !(low.inclusive && high.inclusive)))
      return [];
  }
  const from = low ? low.version[0] : 0;
  if (high === null) return { from };
  const [major, minor, patch] = high.version;
  const to = !high.inclusive && minor === 0 && patch === 0 ? major - 1 : major;
  const majors = [];
  for (let current = from; current <= to; current++) majors.push(current);
  return majors;
}

// The majors a semantic version range admits: `{ majors }`, sorted, with
// `unboundedFrom` set when it admits every major from that one on, or null
// when it is not a range this reader understands.
export function admittedMajors(range) {
  if (typeof range !== "string") return null;
  const majors = new Set();
  let unboundedFrom = null;
  for (const set of range.split("||").map((part) => part.trim())) {
    const interval = comparatorSetInterval(set);
    if (interval === null) return null;
    const admitted = intervalMajors(interval);
    if (Array.isArray(admitted))
      for (const major of admitted) majors.add(major);
    else
      unboundedFrom =
        unboundedFrom === null
          ? admitted.from
          : Math.min(unboundedFrom, admitted.from);
  }
  return { majors: [...majors].sort((a, b) => a - b), unboundedFrom };
}

function admittedText({ majors, unboundedFrom }, prefix = "") {
  const finite = majors
    .filter((major) => unboundedFrom === null || major < unboundedFrom)
    .map((major) => `${prefix}${major}`);
  const parts = [...finite];
  if (unboundedFrom !== null)
    parts.push(`every major from ${prefix}${unboundedFrom} on`);
  return parts.length === 0 ? "no version" : series(parts);
}

// Whether a range admits only the given majors and at least one of them.
function admitsOnly(admitted, allowed) {
  return (
    admitted.unboundedFrom === null &&
    admitted.majors.length > 0 &&
    admitted.majors.every((major) => allowed.includes(major))
  );
}

function packageManagerDifference(rootManifestPath, manifest) {
  const value = manifest?.packageManager;
  if (
    typeof value === "string" &&
    /^pnpm@11\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(value)
  )
    return null;
  const current =
    value === undefined ? "it is missing" : `it is ${code(String(value))}`;
  return `Set ${code("packageManager")} to ${code("pnpm@11.x.y")} in the workspace root ${code(rootManifestPath)}; ${current}.`;
}

function nodeEnginesDifference(rootManifestPath, manifest) {
  const range = manifest?.engines?.node;
  const wanted = `Make ${code("engines.node")} in the workspace root ${code(rootManifestPath)} admit only Node.js 24 or 26`;
  if (range === undefined) return `${wanted}; it is missing.`;
  const admitted = admittedMajors(range);
  if (admitted === null)
    return `${wanted}; ${code(String(range))} is not a version range the check reads.`;
  if (admitsOnly(admitted, nodeMajors)) return null;
  return `${wanted}; ${code(range)} admits ${admittedText(admitted, "Node.js ")}.`;
}

function declaredVersion(manifest, name) {
  for (const field of dependencyFields) {
    const version = manifest?.[field]?.[name];
    if (version !== undefined) return { field, version };
  }
  return null;
}

// The Project's own declaration of a tool, else its workspace root's.
function toolDeclaration(tool, project, root) {
  for (const { path, manifest } of [project, root]) {
    const declared = declaredVersion(manifest, tool.name);
    if (declared) return { ...declared, path };
  }
  return null;
}

export function toolDifference(tool, project, root) {
  const shared = project.path !== root.path;
  const where = shared
    ? `${code(project.path)} or its workspace root ${code(root.path)}`
    : code(project.path);
  const wanted = `Declare ${code(tool.name)}${tool.major === undefined ? "" : ` at major ${tool.major}`} in ${where}`;
  const declared = toolDeclaration(tool, project, root);
  if (declared === null)
    return `${wanted}; ${shared ? "neither declares it" : "it is not declared"}.`;
  const { path } = declared;
  let { version } = declared;
  let declares = `${code(path)} declares ${code(String(version))}`;
  const catalogName =
    typeof version === "string" && version.startsWith("catalog:")
      ? version.slice("catalog:".length) || "default"
      : null;
  if (catalogName !== null) {
    const resolved = root.catalogs.get(catalogName)?.get(tool.name);
    if (resolved === undefined)
      return `${wanted}; ${declares}, which no catalog of the workspace root's ${code(pnpmWorkspaceName)} defines for ${code(tool.name)}.`;
    version = resolved;
    declares = `${declares}, which its catalog resolves to ${code(resolved)}`;
  }
  if (
    tool.major === undefined &&
    typeof version === "string" &&
    version.trim() !== ""
  )
    return null;
  const admitted = admittedMajors(version);
  if (admitted !== null && admitsOnly(admitted, [tool.major])) return null;
  const current =
    admitted === null
      ? `${declares}, which is not a version range the check reads`
      : `${declares}, which admits ${admittedText(admitted, "major ")}`;
  return `${wanted}; ${current}.`;
}

function validateScriptDifference(manifestPath, manifest) {
  const script = manifest?.scripts?.validate;
  if (typeof script === "string" && script.trim() !== "") return null;
  return `Add a ${code("validate")} script to ${code(manifestPath)} that runs the Project's checks.`;
}

// How the Project whose manifest lies at a path differs from the stack's
// manifest facts: `{ differences, evidence, workspaceRoot }`, with one
// correction per difference, in a fixed order, and the existing files that
// show them. TypeScript, the test runner, the pull request checks and the
// development guide are not manifest facts and are not read.
export function stackDifferences(projectRoot, manifestPath) {
  const project = readManifest(projectRoot, manifestPath);
  if (!project.manifest)
    return {
      differences: [
        `${code(manifestPath)} is ${project.missing ? "missing, or is not a regular file inside the project" : "not a JSON object"}; a Project is one readable ${code(manifestName)}.`,
      ],
      evidence: project.missing ? [] : [manifestPath],
      workspaceRoot: null,
    };
  const workspace = workspaceRootOf(projectRoot, manifestPath);
  if (workspace.unreadable)
    return {
      differences: [
        workspace.unreadable.endsWith(pnpmWorkspaceName)
          ? `Cannot read workspace configuration from ${code(workspace.unreadable)}: ${unreadableWorkspaceYamlCause}. Use the limited YAML forms described under Supported workspace YAML in the retained ${code("guidance/typescript-node-stack.md")}; flow mappings such as ${code("overrides: {}")} are unsupported.`
          : `State the workspace members of ${code(workspace.unreadable)} as a list of plain or quoted patterns, which the check reads.`,
      ],
      evidence: [manifestPath, workspace.unreadable],
      workspaceRoot: null,
    };
  const rootManifestPath = joinPath(workspace.root, manifestName);
  const root =
    rootManifestPath === manifestPath
      ? { path: manifestPath, manifest: project.manifest }
      : {
          path: rootManifestPath,
          manifest: readManifest(projectRoot, rootManifestPath).manifest,
        };
  const pnpmWorkspace = joinPath(workspace.root, pnpmWorkspaceName);
  root.catalogs = isRegularFile(projectRoot, pnpmWorkspace)
    ? pnpmCatalogs(
        readFileSync(absolutePath(projectRoot, pnpmWorkspace), "utf8"),
      )
    : new Map();
  const lockfile = joinPath(workspace.root, lockfileName);
  const differences = [
    packageManagerDifference(rootManifestPath, root.manifest),
    isRegularFile(projectRoot, lockfile)
      ? null
      : `Add ${code(lockfileName)} at the workspace root, ${code(lockfile)}.`,
    nodeEnginesDifference(rootManifestPath, root.manifest),
    ...declaredTools.map((tool) =>
      toolDifference(
        tool,
        { path: manifestPath, manifest: project.manifest },
        root,
      ),
    ),
    validateScriptDifference(manifestPath, project.manifest),
  ].filter(Boolean);
  const evidence = [
    manifestPath,
    ...(root.manifest && root.path !== manifestPath ? [root.path] : []),
    ...(isRegularFile(projectRoot, lockfile) ? [lockfile] : []),
    ...workspace.sources,
  ];
  return {
    differences,
    evidence: [...new Set(evidence)],
    workspaceRoot: workspace.root,
  };
}
