#!/usr/bin/env node

// Usage: node merge.mjs <number> <head SHA>, from the repository root.
// Exit codes: 0 merged, 1 usage or platform error, 2 head changed or validation not successful; wait again,
// 3 not merged; needs the owner, 4 stale base; update and validate,
// 5 missing review outcome; post the completed record and rerun,
// 6 unresolved configured-reviewer threads; resolve and rerun,
// 9 repository or release hold; leave open and resume after the hold ends.
import {
  connectionFor,
  executedAsScript,
  pages,
  requestData,
  pinnedFiles,
  checkRollup,
  workflowRuns,
  unresolvedReviewerThreads,
} from "./platform.mjs";
import {
  InvalidTrustedReviewConfiguration,
  trustedReviewConfiguration,
} from "./trusted-review-config.mjs";
import { skipsExternalReview } from "./review-policy.mjs";
import { completeReview, reviewsSection } from "./review-outcome.mjs";

import { decide } from "./wait.mjs";
import { validationCheckStates } from "./required-checks.mjs";

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

function planLimited(error) {
  return (
    error.status === 403 &&
    /Upgrade to GitHub .+ or make this repository public/i.test(
      error.platformMessage ?? "",
    )
  );
}

// Active branch rules include inherited rulesets. Read the ruleset details too:
// the merging credential must be unable to bypass the final platform guard.
async function enforcedFreshness(connection, branch, privateRepository) {
  const path = `/repos/${connection.repository.path}`;
  let rulePages;
  try {
    rulePages = await pages(
      connection,
      `${path}/rules/branches/${encodeURIComponent(branch)}?per_page=100`,
    );
  } catch (error) {
    if (!privateRepository || !planLimited(error)) throw error;
    // A branch-rule refusal alone does not establish both capabilities.
    for (const endpoint of [
      `${path}/branches/${encodeURIComponent(branch)}/protection`,
      `${path}/rulesets?per_page=100`,
    ]) {
      try {
        await requestData(connection, { path: endpoint });
        return false;
      } catch (capabilityError) {
        if (!planLimited(capabilityError)) throw capabilityError;
      }
    }
    return "plan-limited";
  }
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

// Seam (deferred): Scriptorium configuration reads; consumers: 6; extraction proposed in https://github.com/lutzseverino/repo-canon/issues/967.
// This last preflight shares the review snapshot, never the proposed PR tree.
async function mergeHolds(connection, revision, number) {
  const { files } = await pinnedFiles(
    connection,
    {
      factory: ".scriptorium/config.json",
    },
    { revision, evidence: `${connection.repository.path}@${revision}` },
  );
  if (files.factory === null) return [];
  const config = JSON.parse(files.factory);
  if (
    !config ||
    Array.isArray(config) ||
    ![1, 2, 3].includes(config.version) ||
    (config.labels !== undefined &&
      (!config.labels ||
        typeof config.labels !== "object" ||
        Array.isArray(config.labels)))
  )
    throw new Error(
      "Invalid .scriptorium/config.json: expected version 1, 2 or 3 and a labels object when present.",
    );
  const holds = new Map();
  for (const key of ["hold", "releaseHold"]) {
    const label = config.labels?.[key];
    if (label === undefined) continue;
    if (typeof label !== "string" || !label.trim() || label !== label.trim())
      throw new Error(
        `Invalid .scriptorium/config.json labels.${key}: expected a nonempty, trimmed label.`,
      );
    const issuePages = await pages(
      connection,
      `/repos/${connection.repository.path}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`,
    );
    if (!issuePages.every(Array.isArray))
      throw new Error("Could not read merge-hold issues and pull requests.");
    const issues = issuePages.flat();
    if (
      issues.some(
        (issue) =>
          !Number.isSafeInteger(issue?.number) ||
          issue.number <= 0 ||
          !["open", "closed"].includes(issue.state),
      )
    )
      throw new Error("Could not read a merge-hold issue or pull request.");
    for (const issue of issues) {
      if (
        (key === "hold" || issue.pull_request) &&
        issue.state === "open" &&
        issue.number !== number
      )
        holds.set(issue.number, issue);
    }
  }
  return [...holds.values()];
}

async function held(connection, revision, number) {
  try {
    const holds = await mergeHolds(connection, revision, number);
    if (holds.length) {
      console.error(
        `Repository or release merge hold: ${holds.map((pull) => `#${pull.number}`).join(", ")}. Leave this PR open and resume after the hold ends.`,
      );
      process.exitCode = 9;
      return true;
    }
  } catch (error) {
    if (["forbidden", "unauthenticated"].includes(error.reason)) throw error;
    needsOwner(
      `Could not confirm merge holds at ${revision}: ${error.message}`,
    );
    return true;
  }
  return false;
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
    configuration = await trustedReviewConfiguration(connection, {
      requiredChecks: true,
    });
  } catch (error) {
    if (error instanceof InvalidTrustedReviewConfiguration)
      return needsOwner(error.message);
    throw error;
  }
  if (skipsExternalReview(configuration.policy, pullRequest.author?.login)) {
    const reviews = await connection.pullRequests.reviews(Number(number));
    if (
      !reviews.some(
        (review) =>
          review.state !== "PENDING" && completeReview(review.body, head),
      )
    ) {
      console.error(
        `Post a complete review of ${head} as ${reviewsSection} describes, then rerun merge.mjs; ${configuration.evidence}.`,
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
  let freshness;
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
    freshness = await enforcedFreshness(
      connection,
      branch,
      repository.private === true,
    );
    if (!freshness)
      return needsOwner(
        "Required-check freshness is unconfirmed or bypassable; unattended merging stops until GitHub enforcement is fixed by the owner.",
      );
    if (await baseIsStale(connection, branch, head)) return staleBase();
  } catch (error) {
    return unreadableFreshness(error);
  }
  if (await held(connection, configuration.revision, Number(number))) return;
  try {
    if (freshness === "plan-limited") {
      const workflowPath = ".github/workflows/pr-metadata.yml";
      const workflow = await requestData(connection, {
        path: `/repos/${connection.repository.path}/contents/${workflowPath}?ref=${encodeURIComponent(branch)}`,
      });
      if (workflow?.type !== "file" || workflow.path !== workflowPath)
        return needsOwner(
          "Could not confirm the default-branch PR metadata workflow; needs the owner.",
        );
    }
    const rollup = await checkRollup(connection, head);
    const runs = workflowRuns(
      await pages(
        connection,
        `/repos/${connection.repository.path}/actions/runs?head_sha=${head}&per_page=100`,
      ),
    );
    const checks = validationCheckStates(
      rollup,
      configuration.requiredChecks,
      runs,
    );
    const required = checks.filter((check) =>
      configuration.requiredChecks.includes(check.name),
    );
    const now = Date.now();
    const validation = decide({
      checks,
      runs,
      head,
      now,
      startedAt: now,
      limitMs: 0,
      comments: [],
      requestedAt: now,
      pushedAt: now,
      reviewer: null,
      policy: null,
      author: pullRequest.author?.login,
    });
    if (validation.code !== 0) {
      console.error(
        `Current-head validation has not succeeded for ${head}; required checks: ${
          required
            .filter((check) => check.state !== "pass")
            .map((check) => `${check.name} (${check.state})`)
            .join(", ") || "observed checks/workflow attempts"
        }; ${configuration.evidence}.`,
      );
      process.exitCode = 2;
      return;
    }
    const threads = await unresolvedReviewerThreads(
      connection,
      Number(number),
      configuration.reviewer,
    );
    if (threads.length) {
      console.error(
        `Unresolved configured-reviewer threads: ${threads.join(", ")}; ${configuration.evidence}. Resolve the threads and rerun merge.mjs.`,
      );
      process.exitCode = 6;
      return;
    }
  } catch (error) {
    if (["forbidden", "unauthenticated"].includes(error.reason)) throw error;
    return needsOwner(
      `Could not establish required-check or reviewer-thread evidence for ${head}; required names: ${configuration.requiredChecks.join(", ")}; ${configuration.evidence}: ${error.message}`,
    );
  }
  if (await held(connection, configuration.revision, Number(number))) return;
  // All slow gates precede this final head, live destination and ancestry read.
  try {
    const finalPull = await connection.pullRequests.pullRequest(Number(number));
    if (finalPull.headCommit !== head) return retry();
    const finalRepository = await requestData(connection, {
      path: `/repos/${connection.repository.path}`,
    });
    if (
      finalRepository?.default_branch !== branch ||
      finalPull.baseBranch !== branch ||
      (freshness === "plan-limited" && finalRepository.private !== true)
    )
      return needsOwner("The PR destination changed; needs the owner.");
    if (await baseIsStale(connection, branch, head)) return staleBase();
  } catch (error) {
    return unreadableFreshness(error);
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
