#!/usr/bin/env node

// Usage: node merge.mjs <number> <head SHA>, from the repository root.
// Exit codes: 0 merged, 1 usage or platform error, 2 head changed; wait again,
// 3 not merged; needs the owner, 4 stale base; update and validate,
// 5 missing review outcome; post the completed record and rerun,
// 9 release hold; leave open and resume after the hold ends.
import {
  connectionFor,
  executedAsScript,
  pages,
  requestData,
} from "./platform.mjs";
import {
  InvalidTrustedReviewConfiguration,
  trustedReviewConfiguration,
} from "./trusted-review-config.mjs";
import { skipsExternalReview } from "./review-policy.mjs";
import { completeReviewOutcome } from "./review-outcome.mjs";

function needsOwner(message) {
  console.error(message);
  process.exitCode = 3;
}

function unreadableFreshness(error) {
  if (["forbidden", "unauthenticated"].includes(error.reason)) throw error;
  return needsOwner(
    `Could not confirm required-check freshness (${error.message}); unattended merging stops until the owner fixes GitHub enforcement.`,
  );
}

function retry() {
  console.error("PR head changed; wait again before merging.");
  process.exitCode = 2;
}

function staleBase() {
  console.error(
    "The base branch advanced; update the PR branch, validate the integrated change, and wait again before merging.",
  );
  process.exitCode = 4;
}

// Active branch rules include inherited rulesets. Read the ruleset details too:
// the merging credential must be unable to bypass the final platform guard.
async function enforcedFreshness(connection, branch) {
  const path = `/repos/${connection.repository.path}`;
  const rulePages = await pages(
    connection,
    `${path}/rules/branches/${encodeURIComponent(branch)}?per_page=100`,
  );
  if (!rulePages.every(Array.isArray))
    throw new Error("Could not read required-check freshness rules.");
  for (const rule of rulePages.flat()) {
    if (
      rule?.type !== "required_status_checks" ||
      rule.parameters?.strict_required_status_checks_policy !== true ||
      !Array.isArray(rule.parameters?.required_status_checks) ||
      !rule.parameters.required_status_checks.length
    )
      continue;
    if (!Number.isSafeInteger(rule.ruleset_id))
      throw new Error(
        "Could not read required-check freshness ruleset identity.",
      );
    const detail = await requestData(connection, {
      path: `${path}/rulesets/${rule.ruleset_id}`,
    });
    if (
      detail?.id === rule.ruleset_id &&
      detail.current_user_can_bypass === "never"
    )
      return true;
  }
  let protection;
  try {
    protection = await requestData(connection, {
      path: `${path}/branches/${encodeURIComponent(branch)}/protection`,
    });
  } catch (error) {
    if (
      error.status === 404 &&
      /Branch not protected/i.test(error.platformMessage ?? "")
    )
      return false;
    throw error;
  }
  const checks = protection?.required_status_checks;
  return (
    checks?.strict === true &&
    protection?.enforce_admins?.enabled === true &&
    ((Array.isArray(checks.contexts) && checks.contexts.length > 0) ||
      (Array.isArray(checks.checks) && checks.checks.length > 0))
  );
}

async function baseIsStale(connection, branch, head) {
  const comparison = await requestData(connection, {
    path: `/repos/${connection.repository.path}/compare/${encodeURIComponent(branch)}...${head}`,
  });
  if (
    !Number.isSafeInteger(comparison?.behind_by) ||
    comparison.behind_by < 0 ||
    !["ahead", "behind", "diverged", "identical"].includes(comparison.status)
  )
    throw new Error(
      "Could not confirm PR branch freshness against the current base.",
    );
  return comparison.behind_by > 0;
}

// This last preflight shares the review snapshot, never the proposed PR tree.
async function releaseHolds(connection, revision, number) {
  const [owner, name] = connection.repository.path.split("/");
  const response = await requestData(connection, {
    method: "POST",
    path: "/graphql",
    body: {
      query: `query BabysitReleaseHold($owner: String!, $name: String!, $revision: GitObjectID!, $factory: String!) {
        repository(owner: $owner, name: $name) {
          commit: object(oid: $revision) { __typename oid }
          factory: object(expression: $factory) { __typename ... on Blob { text isTruncated } }
        }
      }`,
      variables: {
        owner,
        name,
        revision,
        factory: `${revision}:.factory/config.json`,
      },
    },
  });
  const files = response?.data?.repository;
  if (
    response?.errors?.length ||
    files?.commit?.__typename !== "Commit" ||
    files.commit.oid !== revision
  )
    throw new Error("Could not read the pinned factory configuration commit.");
  const blob = files.factory;
  if (blob === null) return [];
  if (
    blob?.__typename !== "Blob" ||
    blob.isTruncated !== false ||
    typeof blob.text !== "string"
  )
    throw new Error("Could not read complete .factory/config.json.");
  const config = JSON.parse(blob.text);
  if (
    !config ||
    Array.isArray(config) ||
    ![1, 2].includes(config.version) ||
    (config.labels !== undefined &&
      (!config.labels ||
        typeof config.labels !== "object" ||
        Array.isArray(config.labels)))
  )
    throw new Error(
      "Invalid .factory/config.json: expected version 1 or 2 and a labels object when present.",
    );
  const label = config.labels?.releaseHold;
  if (label === undefined) return [];
  if (typeof label !== "string" || !label.trim() || label !== label.trim())
    throw new Error(
      "Invalid .factory/config.json labels.releaseHold: expected a nonempty, trimmed label.",
    );
  const issuePages = await pages(
    connection,
    `/repos/${connection.repository.path}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`,
  );
  if (!issuePages.every(Array.isArray))
    throw new Error("Could not read release-hold pull requests.");
  const issues = issuePages.flat();
  if (
    issues.some(
      (issue) =>
        !Number.isSafeInteger(issue?.number) ||
        issue.number <= 0 ||
        !["open", "closed"].includes(issue.state),
    )
  )
    throw new Error("Could not read a release-hold pull request.");
  return issues.filter(
    (issue) =>
      issue.pull_request && issue.state === "open" && issue.number !== number,
  );
}

export async function main(argv = process.argv.slice(2), connection) {
  const [number, head, ...extra] = argv;
  if (
    !/^[1-9]\d*$/.test(number ?? "") ||
    !/^[a-f0-9]{40}$/i.test(head ?? "") ||
    extra.length
  ) {
    throw new Error("Usage: node merge.mjs <number> <head SHA>");
  }
  connection ??= connectionFor();
  const pullRequest = await connection.pullRequests.pullRequest(Number(number));
  if (pullRequest.headCommit !== head) return retry();
  let configuration;
  try {
    configuration = await trustedReviewConfiguration(connection);
  } catch (error) {
    if (error instanceof InvalidTrustedReviewConfiguration)
      return needsOwner(error.message);
    throw error;
  }
  if (skipsExternalReview(configuration.policy, pullRequest.author?.login)) {
    const comments = await pages(
      connection,
      `/repos/${connection.repository.path}/issues/${number}/comments?per_page=100`,
    );
    if (
      !comments
        .flat()
        .some((comment) => completeReviewOutcome(comment.body, head))
    ) {
      console.error(
        `Post a complete current-head review outcome comment for ${head}, then rerun merge.mjs; ${configuration.evidence}.`,
      );
      process.exitCode = 5;
      return;
    }
  }
  if (await connection.pullRequests.mergesThroughQueue(Number(number))) {
    return needsOwner(
      "The base branch requires a merge queue, which cannot apply the explicit squash message CONTRIBUTING.md requires; needs the owner.",
    );
  }
  let branch;
  try {
    const repository = await requestData(connection, {
      path: `/repos/${connection.repository.path}`,
    });
    branch = repository?.default_branch;
    if (
      typeof branch !== "string" ||
      !branch ||
      pullRequest.baseBranch !== branch
    )
      return needsOwner(
        "Could not confirm the PR targets the current default branch; needs the owner.",
      );
    if (!(await enforcedFreshness(connection, branch)))
      return needsOwner(
        "Required-check freshness is unconfirmed or bypassable; unattended merging stops until GitHub enforcement is fixed by the owner.",
      );
    if (await baseIsStale(connection, branch, head)) return staleBase();
  } catch (error) {
    return unreadableFreshness(error);
  }
  try {
    const holds = await releaseHolds(
      connection,
      configuration.revision,
      Number(number),
    );
    if (holds.length) {
      console.error(
        `Release merge hold: ${holds.map((pull) => `#${pull.number}`).join(", ")}. Leave this PR open and resume after the hold ends.`,
      );
      process.exitCode = 9;
      return;
    }
  } catch (error) {
    if (["forbidden", "unauthenticated"].includes(error.reason)) throw error;
    return needsOwner(
      `Could not confirm the release hold at ${configuration.revision}: ${error.message}`,
    );
  }
  let mergedCommit;
  try {
    mergedCommit = await connection.pullRequests.squashMerge(Number(number), {
      expectedHead: head,
      title: `${pullRequest.title} (#${number})`,
      body: pullRequest.body ?? "",
    });
  } catch (error) {
    // A permission refusal stands; no further requests or alternate identity.
    if (["forbidden", "unauthenticated"].includes(error.reason)) throw error;
    if (
      (await connection.pullRequests.pullRequest(Number(number))).headCommit !==
      head
    )
      return retry();
    try {
      if (await baseIsStale(connection, branch, head)) return staleBase();
    } catch (readError) {
      return unreadableFreshness(readError);
    }
    if (
      error.reason === "invalidResponse" &&
      error.message === "GitHub answered the merge without merging."
    )
      return needsOwner("The pull request did not merge; needs the owner.");
    throw error;
  }
  if (
    (await connection.pullRequests.pullRequest(Number(number))).state !==
    "merged"
  ) {
    return needsOwner("The pull request did not merge; needs the owner.");
  }
  process.stdout.write(`${mergedCommit}\n`);
}

if (import.meta.main ?? executedAsScript(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
