import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, posix, sep } from "node:path";
import {
  declarationTargets,
  documentationModel,
  documentationRuleViolations,
} from "./lib/documentation-model.mjs";

const resultFormat = "repo-standards/result/v2";

function failProcess(message) {
  throw new Error(message);
}

function isSafeFilePath(projectRoot, path) {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    isAbsolute(path) ||
    path === "." ||
    path.endsWith("/") ||
    path.includes("\\") ||
    posix.normalize(path) !== path ||
    path.startsWith("../")
  )
    return false;
  let existingDirectory = false;
  try {
    existingDirectory = lstatSync(
      absolutePath(projectRoot, path),
    ).isDirectory();
  } catch {
    // Missing intended files are valid concrete targets.
  }
  return !existingDirectory;
}

function readRequest() {
  let request;
  try {
    request = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    failProcess("Operation input must be one JSON object.");
  }
  if (request?.format !== "repo-standards/operation/v2") {
    failProcess(
      "Unsupported operation input format; expected repo-standards/operation/v2.",
    );
  }
  if (request.operation?.phase !== "checks") {
    failProcess("Documentation validation must run as a checks operation.");
  }
  if (
    typeof request.projectRoot !== "string" ||
    request.projectRoot.length === 0
  ) {
    failProcess("Operation input must identify the project root.");
  }
  const { paths, directories } = request.allowedTargets ?? {};
  if (
    !Array.isArray(paths) ||
    paths.some((path) => !isSafeFilePath(request.projectRoot, path)) ||
    !Array.isArray(directories) ||
    directories.length !== 0
  ) {
    failProcess(
      "Documentation validation requires individual repository-relative file paths and no directory targets.",
    );
  }
  return request;
}

function absolutePath(projectRoot, path) {
  return `${projectRoot}${sep}${path.split("/").join(sep)}`;
}

// Projects the documentation model onto its corrections, in order: the
// development guide, then each root's index, stray entries, directory indexes
// and confirmed category indexes, then broken links, then each documentation
// rule violation, naming its file and its rule.
function navigationCorrections(model) {
  const corrections = [];
  const guide = model.developmentGuide;
  if (guide.state === "missing") {
    corrections.push(
      `Create ${guide.path} with the project's prerequisites, setup, development commands, and required validation.`,
    );
  } else if (guide.state === "empty") {
    corrections.push(
      `Populate ${guide.path} with the project's prerequisites, setup, development commands, and required validation.`,
    );
  }
  if (!guide.confirmed) {
    corrections.push(
      `Include ${guide.path} in the confirmed documentation scope.`,
    );
  }

  for (const root of model.roots) {
    const { index } = root;
    if (index.state === "missing") {
      corrections.push(
        `Create ${index.path} to map the documentation categories and their placement rules.`,
      );
    } else if (index.state === "empty") {
      corrections.push(
        `Populate ${index.path} with the documentation map and placement rules.`,
      );
    }
    if (!index.confirmed) {
      corrections.push(
        `Include ${index.path} in the confirmed documentation scope.`,
      );
    }
    for (const entry of root.strayEntries) {
      corrections.push(
        `Move ${entry} into usage, development, adr, or agents, preserving useful content and affected links.`,
      );
    }
    for (const directory of root.directories) {
      const directoryIndex = directory.index;
      if (directoryIndex.state === "missing")
        corrections.push(
          `Create ${directoryIndex.path} to explain this documentation directory and link its useful contents.`,
        );
      else if (directoryIndex.state === "empty")
        corrections.push(
          `Populate ${directoryIndex.path} with the directory purpose and links to useful contents.`,
        );
    }
    for (const confirmedIndex of root.confirmedIndexes) {
      if (confirmedIndex.state === "missing") {
        corrections.push(
          `Create ${confirmedIndex.path} to explain this documentation directory and link its useful contents.`,
        );
      }
    }
  }
  for (const link of model.links) {
    if (link.broken)
      corrections.push(`${link.source} links to missing ${link.target}.`);
  }
  for (const { rule, path, correction } of documentationRuleViolations(model)) {
    corrections.push(`${path} breaks the ${rule} rule: ${correction}`);
  }
  return [...new Set(corrections)];
}

function result(status, message) {
  process.stdout.write(
    `${JSON.stringify({ format: resultFormat, status, message })}\n`,
  );
}

try {
  const request = readRequest();
  const model = documentationModel(
    request.projectRoot,
    request.allowedTargets.paths,
    {
      declaredTargets: declarationTargets(request.declarations),
    },
  );
  const corrections = navigationCorrections(model);
  if (model.ambiguousRoots.length > 0) {
    const ambiguity = model.ambiguousRoots
      .map(
        (root) =>
          `Cannot determine whether ${root} is a documentation root from the confirmed paths; include its root README and at least one confirmed category README under usage, development, adr, or agents, or remove the unrelated index from this declaration.`,
      )
      .join(" ");
    const otherCorrections =
      corrections.length > 0
        ? ` Other documentation corrections: ${corrections.join(" ")}`
        : "";
    result(
      "blocked",
      `Documentation root selection is ambiguous: ${ambiguity}${otherCorrections}`,
    );
  } else {
    result(
      corrections.length === 0 ? "passed" : "failed",
      corrections.length === 0
        ? "Documentation navigation is valid; content placement and usefulness still require maintainer or agent review."
        : `Documentation navigation needs correction: ${corrections.join(" ")}`,
    );
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
