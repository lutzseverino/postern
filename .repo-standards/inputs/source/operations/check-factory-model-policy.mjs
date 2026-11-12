import { readFileSync } from "node:fs";
import { readModelPolicy } from "./lib/factory-model-policy.mjs";

const target = ".github/factory-model-policy.json";

try {
  const request = JSON.parse(readFileSync(0, "utf8"));
  if (
    request?.format !== "repo-standards/operation/v2" ||
    request.operation?.phase !== "checks" ||
    typeof request.projectRoot !== "string" ||
    !request.projectRoot
  ) {
    throw new Error(
      "Factory model policy validation requires a checks operation with a project root.",
    );
  }
  let status = "passed";
  let message = "No factory model policy is configured.";
  try {
    if (readModelPolicy(request.projectRoot)) message = `${target} is valid.`;
  } catch (error) {
    status = "failed";
    const prefix = `${target}: `;
    const reason = error.message.startsWith(prefix)
      ? error.message.slice(prefix.length)
      : error.message;
    message = `Correct ${target} to match the factory-workflow rules: ${reason}`;
  }
  process.stdout.write(
    `${JSON.stringify({ format: "repo-standards/result/v2", status, message })}\n`,
  );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
