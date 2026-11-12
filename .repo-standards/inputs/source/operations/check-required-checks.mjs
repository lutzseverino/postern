import { readFileSync } from "node:fs";
import {
  readRequiredChecks,
  requiredChecksTarget,
} from "../.agents/skills/babysit/required-checks.mjs";

try {
  const request = JSON.parse(readFileSync(0, "utf8"));
  if (
    request?.format !== "repo-standards/operation/v2" ||
    request.operation?.phase !== "checks" ||
    typeof request.projectRoot !== "string" ||
    !request.projectRoot
  ) {
    throw new Error(
      "Required-check validation requires a checks operation with a project root.",
    );
  }
  let status = "passed";
  let message;
  try {
    readRequiredChecks(request.projectRoot);
    message = `${requiredChecksTarget} is valid.`;
  } catch (error) {
    status = "failed";
    message = `Correct ${requiredChecksTarget} to match the github-repository-configuration rules: ${error.message}`;
  }
  process.stdout.write(
    `${JSON.stringify({ format: "repo-standards/result/v2", status, message })}\n`,
  );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
