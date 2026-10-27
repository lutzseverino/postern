#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { connect } from "../vendor/postern/postern.mjs";
import { runIssueContractValidation } from "./validate-issue-contract.mjs";
import { validatePullRequestMetadata } from "../.github/scripts/validate-pr-metadata.mjs";

// Both paths consume neutral input; the trusted trigger owns event decoding.
export async function validate(input, connection, resolveIssue) {
  if (input.kind === "issue-contract")
    return runIssueContractValidation(input.event, connection, resolveIssue);
  if (input.kind === "pr-metadata")
    return validatePullRequestMetadata(input.pullRequest);
  throw new Error("Choose issue-contract or pr-metadata validation.");
}

export function executedAsScript(url) {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url));
}

export async function main(
  argv = process.argv.slice(2),
  connectionOptions = {},
) {
  if (argv.length !== 1)
    throw new Error("Usage: node scripts/validate.mjs <neutral-input.json>");
  const input = JSON.parse(await readFile(argv[0], "utf8"));
  const options = {
    credential: process.env.POSTERN_TOKEN,
    ...connectionOptions,
    relationshipSections: { parent: "Parent", blockedBy: "Blocked by" },
  };
  const connection =
    input.kind === "issue-contract"
      ? connect(input.repository, options)
      : undefined;
  return validate(input, connection, (reference) =>
    connect(
      { ...connection.repository, path: reference.repository },
      options,
    ).issueTracker.issue(reference.number),
  );
}

if (import.meta.main ?? executedAsScript(import.meta.url)) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
