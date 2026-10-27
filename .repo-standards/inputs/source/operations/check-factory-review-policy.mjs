import { readFileSync } from "node:fs";
import { readReviewPolicy } from "./lib/review-policy.mjs";

const target = ".github/factory-review-policy.json";

try {
  const request = JSON.parse(readFileSync(0, "utf8"));
  if (
    request?.format !== "repo-standards/operation/v2" ||
    request.operation?.phase !== "checks" ||
    typeof request.projectRoot !== "string" ||
    !request.projectRoot
  ) {
    throw new Error(
      "Factory review policy validation requires a checks operation with a project root.",
    );
  }
  let status = "passed";
  let message = "No factory review policy is configured.";
  try {
    if (readReviewPolicy(request.projectRoot)) message = `${target} is valid.`;
  } catch (error) {
    status = "failed";
    const prefix = `${target}: `;
    const reason = error.message.startsWith(prefix)
      ? error.message.slice(prefix.length)
      : error.message;
    message = `Correct ${target} to match the github-repository-configuration rules: ${reason}`;
  }
  process.stdout.write(
    `${JSON.stringify({ format: "repo-standards/result/v2", status, message })}\n`,
  );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
