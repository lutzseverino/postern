#!/usr/bin/env node

// Usage: node request.mjs <number> [--fixes-review] [--repo <owner/name>]
// Run before every wait, including resumed runs. --fixes-review says this
// head fixes a finding requiring another request under the installed rules.
// Exit 0 means the request rule was applied (which may require no request);
// exit 1 is an invocation or platform error; exit 7 requires an owner handoff
// to correct invalid trusted review configuration on the default branch.
import {
  connectionFor,
  executedAsScript,
  pages,
  conversationComments,
  pushTime,
  requestData,
} from "./platform.mjs";
import { skipsExternalReview } from "./review-policy.mjs";
import {
  InvalidTrustedReviewConfiguration,
  trustedReviewConfiguration,
} from "./trusted-review-config.mjs";
import { reviewRequestedAt, reviewRequestCount } from "./reviewer.mjs";

export const main = async (argv = process.argv.slice(2), connection) => {
  try {
    const [number, ...flags] = argv;
    let repository;
    let fixesReview = false;
    for (let index = 0; index < flags.length; index++) {
      if (flags[index] === "--fixes-review") fixesReview = true;
      else if (flags[index] === "--repo" && flags[index + 1])
        repository = flags[++index];
      else throw new Error("Unknown or incomplete request option.");
    }
    if (!/^[1-9]\d*$/.test(number ?? ""))
      throw new Error(
        "Usage: request.mjs <number> [--fixes-review] [--repo <owner/name>]",
      );
    connection ??= connectionFor(repository);
    const { policy, reviewer, evidence } =
      await trustedReviewConfiguration(connection);
    const pull = await connection.pullRequests.pullRequest(Number(number));
    const author = pull.author?.login;
    const result = (phrase) => {
      process.stdout.write(`${pull.headCommit}: ${phrase}; ${evidence}\n`);
      return 0;
    };
    if (skipsExternalReview(policy, author))
      return result("external review skipped by app-author policy");
    if (!reviewer) return result("no reviewer configured");

    const path = `/repos/${connection.repository.path}/issues/${number}/comments`;
    const comments = conversationComments(
      await pages(connection, `${path}?per_page=100`),
    );
    const requestedAt = reviewRequestedAt(
      Date.parse(pull.createdAt),
      comments,
      reviewer,
      { policy, author },
    );
    if (requestedAt !== null) {
      if (
        reviewRequestCount(comments, reviewer) >= reviewer.bounds.reviewRequests
      )
        return result("review request bound reached");
      if (!fixesReview) return result("request rule requires no new request");
      const { pushedAt } = await pushTime(pull, connection);
      if (requestedAt >= pushedAt)
        return result("review already requested for this head");
    }
    await requestData(connection, {
      method: "POST",
      path,
      body: { body: reviewer.request.comment },
    });
    return result("review requested");
  } catch (error) {
    process.stderr.write(`request.mjs: ${error.message}\n`);
    return error instanceof InvalidTrustedReviewConfiguration ? 7 : 1;
  }
};

if (import.meta.main ?? executedAsScript(import.meta.url)) {
  process.exitCode = await main();
}
