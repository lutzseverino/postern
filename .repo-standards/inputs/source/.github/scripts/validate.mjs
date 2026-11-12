#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { connect } from "../../vendor/postern/postern.mjs";
import {
  validate,
  executedAsScript,
} from "../../vendor/repo-canon/validate.mjs";

// Only this trusted trigger reads GitHub's event. PR metadata remains the
// pull_request_target snapshot: no later read or proposed-head code is used.
export async function githubValidation(
  kind,
  environment = process.env,
  options = {},
) {
  const payload = JSON.parse(
    await readFile(environment.GITHUB_EVENT_PATH, "utf8"),
  );
  if (kind === "pr-metadata") {
    return validate({
      kind,
      pullRequest: {
        title: payload.pull_request?.title,
        body: payload.pull_request?.body,
      },
    });
  }
  const connectionOptions = {
    credential: environment.GITHUB_TOKEN,
    relationshipSections: { parent: "Parent", blockedBy: "Blocked by" },
    ...options,
  };
  const connection = connect(
    `https://github.com/${environment.GITHUB_REPOSITORY}`,
    connectionOptions,
  );
  let event;
  if (environment.GITHUB_EVENT_NAME === "repository_dispatch") {
    const number = payload.client_payload?.issue;
    if (
      payload.action !== "repo-canon-issue-contract" ||
      !Number.isSafeInteger(number) ||
      number < 1
    )
      throw new Error(
        "Contract evaluation dispatch needs a positive issue number.",
      );
    event = {
      platform: "github",
      repository: environment.GITHUB_REPOSITORY,
      issue: number,
      kind: "edited",
      actor: {
        login: payload.sender?.login ?? null,
        bot: payload.sender?.type === "Bot",
      },
      label: null,
      openingLabels: null,
      bodyChanged: null,
      comment: null,
    };
  } else {
    event = await connection.issueTracker.issueEvent({
      name: environment.GITHUB_EVENT_NAME,
      payload,
    });
  }
  return validate(
    { kind, event },
    connection,
    (reference) =>
      connect(
        `https://github.com/${reference.repository}`,
        connectionOptions,
      ).issueTracker.issue(reference.number),
    options.resolveBoundary,
  );
}

if (import.meta.main ?? executedAsScript(import.meta.url)) {
  try {
    process.exitCode = await githubValidation(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
