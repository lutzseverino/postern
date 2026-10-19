import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, posix, sep } from "node:path";
import { interpretMarkdown } from "./lib/rendered-markdown.mjs";
import {
  brokenLocalLinks,
  localLinks,
  localPathExists,
} from "./lib/local-markdown-links.mjs";

const resultFormat = "repo-standards/result/v2";

function failProcess(message) {
  throw new Error(message);
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
    failProcess("Project README validation must run as a checks operation.");
  }
  const { paths, directories } = request.allowedTargets ?? {};
  if (
    !Array.isArray(paths) ||
    !Array.isArray(directories) ||
    directories.length !== 0 ||
    paths.some((path) => !isProjectReadmePath(path))
  ) {
    failProcess(
      "Project README validation requires individual non-root README.md paths and no directory targets.",
    );
  }
  if (
    typeof request.projectRoot !== "string" ||
    request.projectRoot.length === 0
  ) {
    failProcess("Operation input must identify the project root.");
  }
  return request;
}

function isProjectReadmePath(path) {
  return (
    typeof path === "string" &&
    path !== "README.md" &&
    !isAbsolute(path) &&
    !path.includes("\\") &&
    posix.normalize(path) === path &&
    !path.startsWith("../") &&
    posix.basename(path) === "README.md"
  );
}

function isFile(projectRoot, path) {
  try {
    const absolute = `${projectRoot}${sep}${path.split("/").join(sep)}`;
    return localPathExists(projectRoot, path) && lstatSync(absolute).isFile();
  } catch {
    return false;
  }
}

function result(status, message) {
  process.stdout.write(
    `${JSON.stringify({ format: resultFormat, status, message })}\n`,
  );
}

function validate(projectRoot, paths) {
  const corrections = [];
  for (const path of paths) {
    if (!isFile(projectRoot, path)) {
      corrections.push(`Create ${path} for the maintained Project.`);
      continue;
    }
    const absolute = `${projectRoot}${sep}${path.split("/").join(sep)}`;
    const document = interpretMarkdown(readFileSync(absolute, "utf8"));
    const renderedHeadings = document.headings;
    const headings = renderedHeadings.filter((event) => event.level === 1);
    if (
      headings.length !== 1 ||
      headings[0].centered ||
      headings[0].source !== "markdown" ||
      renderedHeadings[0] !== headings[0]
    ) {
      corrections.push(
        `Give ${path} one non-centered level-one title as its first heading.`,
      );
    }
    for (const link of brokenLocalLinks(
      projectRoot,
      path,
      document.content.elements,
    )) {
      corrections.push(`${path} links to missing ${link.target}.`);
    }
    const sharedLinks = localLinks(
      projectRoot,
      path,
      document.content.elements.filter(
        (element) =>
          element.type === "link" && (element.text || element.containsMedia),
      ),
    );
    for (const sharedPath of [
      "CONTRIBUTING.md",
      "docs/development/README.md",
    ]) {
      if (
        !sharedLinks.some((link) => link.path === sharedPath && !link.broken)
      ) {
        corrections.push(`Link ${path} to the root ${sharedPath}.`);
      }
    }
  }
  return [...new Set(corrections)];
}

try {
  const request = readRequest();
  const corrections = validate(
    request.projectRoot,
    request.allowedTargets.paths,
  );
  result(
    corrections.length === 0 ? "passed" : "failed",
    corrections.length === 0
      ? `Project README structure and shared setup and contribution links are valid for ${request.allowedTargets.paths.length} concrete target${request.allowedTargets.paths.length === 1 ? "" : "s"}; Project membership, purpose, commands, configuration, documentation, and duplication of shared instructions still require maintainer or agent review.`
      : `Project README structure needs correction: ${corrections.join(" ")}`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
