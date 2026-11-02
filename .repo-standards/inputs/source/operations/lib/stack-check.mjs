import { readFileSync } from "node:fs";
import { isManifestPath } from "./typescript-node-stack.mjs";
import { keptFiles, webStackDifferences } from "./typescript-web-stack.mjs";

export function runWebStackCheck(stack) {
  try {
    const request = JSON.parse(readFileSync(0, "utf8"));
    if (
      request?.format !== "repo-standards/operation/v2" ||
      request.operation?.phase !== "checks"
    )
      throw new Error(
        "Expected a repo-standards/operation/v2 checks operation.",
      );
    const { paths, directories } = request.allowedTargets ?? {};
    if (
      !Array.isArray(paths) ||
      !Array.isArray(directories) ||
      directories.length ||
      paths.some((path) => !isManifestPath(path))
    )
      throw new Error(
        `typescript-${stack} stack validation requires individual package.json paths and no directory targets.`,
      );
    if (typeof request.projectRoot !== "string" || !request.projectRoot)
      throw new Error("Operation input must identify the project root.");
    const files = keptFiles(request.projectRoot);
    const corrections = paths.flatMap((path) =>
      webStackDifferences(
        request.projectRoot,
        path,
        stack,
        files,
      ).differences.map((difference) => `\`${path}\`: ${difference}`),
    );
    process.stdout.write(
      `${JSON.stringify({ format: "repo-standards/result/v2", status: corrections.length ? "failed" : "passed", message: corrections.length ? `The typescript-${stack} stack needs correction: ${corrections.join(" ")}` : `The typescript-${stack} stack manifest facts are valid for ${paths.length} Project${paths.length === 1 ? "" : "s"}; framework, React, Tailwind, TypeScript and test-runner majors, actual astro check/ui:check execution by validate, CI coverage, Setup and validation, integrity, wrappers and theme behavior still require contextual assessment.` })}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
