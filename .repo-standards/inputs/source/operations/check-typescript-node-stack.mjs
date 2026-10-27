import { readFileSync } from "node:fs";
import {
  isManifestPath,
  stackDifferences,
} from "./lib/typescript-node-stack.mjs";

// Checks the manifest facts of each confirmed `typescript-node` Project, one
// `package.json` per Project, at the Project and its workspace root. It reads
// the project and writes only its result.

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
    failProcess(
      "typescript-node stack validation must run as a checks operation.",
    );
  }
  const { paths, directories } = request.allowedTargets ?? {};
  if (
    !Array.isArray(paths) ||
    !Array.isArray(directories) ||
    directories.length !== 0 ||
    paths.some((path) => !isManifestPath(path))
  ) {
    failProcess(
      "typescript-node stack validation requires individual package.json paths and no directory targets.",
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

function result(status, message) {
  process.stdout.write(
    `${JSON.stringify({ format: resultFormat, status, message })}\n`,
  );
}

// Every correction of every confirmed path, each naming its path, so a
// workspace-root fact that several Projects share is reported for each.
function validate(projectRoot, paths) {
  return paths.flatMap((path) =>
    stackDifferences(projectRoot, path).differences.map(
      (difference) => `\`${path}\`: ${difference}`,
    ),
  );
}

try {
  const request = readRequest();
  const { paths } = request.allowedTargets;
  const corrections = validate(request.projectRoot, paths);
  result(
    corrections.length === 0 ? "passed" : "failed",
    corrections.length === 0
      ? `The pnpm, lockfile, Node.js, oxlint, Prettier and validate script facts of the typescript-node stack are valid for ${paths.length} Project${paths.length === 1 ? "" : "s"}; TypeScript 7, node --test, required pull request checks running validate, and each Project's Setup and validation section still require the contextual assessment.`
      : `The typescript-node stack needs correction: ${corrections.join(" ")}`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
