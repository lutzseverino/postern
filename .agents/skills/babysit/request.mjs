#!/usr/bin/env node

// Usage: node request.mjs <number> [--fixes-review] [--repo <owner/name>]
//        [--updated-from <base>:<head>:<new base>]
// Run before every wait, including resumed runs. --fixes-review says this
// head fixes a finding requiring another request under the installed rules.
// Exit 0 means the request rule was applied (which may require no request);
// exit 1 is an invocation or platform error; exit 7 requires an owner handoff
// to correct invalid trusted review configuration on the default branch.
// Exit 8 lists own-head file links: correct the PR body and rerun.
import {
  connectionFor,
  executedAsScript,
  pages,
  conversationComments,
  pushTime,
  requestData,
  readyForReviewTime,
  reviewComments,
} from "./platform.mjs";
import { skipsExternalReview } from "./review-policy.mjs";
import {
  InvalidTrustedReviewConfiguration,
  trustedReviewConfiguration,
} from "./trusted-review-config.mjs";
import {
  reviewRequestedAt,
  reviewRequestCount,
  reviewerState,
} from "./reviewer.mjs";
import { checkBodyLinks, HeadBranchLinks } from "./body-links.mjs";
import { unchangedUpdate } from "./branch-update.mjs";

export const main = async (argv = process.argv.slice(2), connection) => {
  try {
    const [number, ...flags] = argv;
    let repository;
    let fixesReview = false;
    let updatedFrom;
    for (let index = 0; index < flags.length; index++) {
      if (flags[index] === "--fixes-review") fixesReview = true;
      else if (flags[index] === "--repo" && flags[index + 1])
        repository = flags[++index];
      else if (flags[index] === "--updated-from" && flags[index + 1])
        updatedFrom = flags[++index];
      else throw new Error("Unknown or incomplete request option.");
    }
    if (!/^[1-9]\d*$/.test(number ?? ""))
      throw new Error(
        "Usage: request.mjs <number> [--fixes-review] [--repo <owner/name>] [--updated-from <base>:<head>:<new base>]",
      );
    connection ??= connectionFor(repository);
    const { policy, reviewer, evidence } =
      await trustedReviewConfiguration(connection);
    const pull = await connection.pullRequests.pullRequest(Number(number));
    await checkBodyLinks(pull, connection);
    const previous = unchangedUpdate(updatedFrom, pull.headCommit);
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
      {
        policy,
        author,
        readyAt: reviewer.request.onOpen
          ? await readyForReviewTime(connection, number)
          : null,
      },
    );
    if (previous) {
      const [reviews, inline] = await Promise.all([
        connection.pullRequests.reviews(Number(number)),
        pages(
          connection,
          `/repos/${connection.repository.path}/pulls/${number}/comments?per_page=100`,
        ),
      ]);
      const reviewThreads = reviewComments(inline);
      const state = reviewerState(reviewer, {
        policy,
        author,
        head: previous,
        requestedAt,
        evidenceRequestedAt: reviewRequestedAt(
          Date.parse(pull.createdAt),
          comments,
          reviewer,
          { policy, author },
        ),
        pushedAt: Date.parse(pull.createdAt),
        comments,
        now: Date.now(),
        reviews: reviews.map((review) => ({
          user: review.author,
          commit_id: review.commit,
          state: review.state,
          body: review.body,
          comments: reviewThreads.filter(
            (comment) => comment.pull_request_review_id === review.id,
          ),
        })),
      });
      if (state === "reviewed")
        return result(
          `unchanged non-overlapping update; retain review of ${previous}`,
        );
    }
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
    return error instanceof InvalidTrustedReviewConfiguration
      ? 7
      : error instanceof HeadBranchLinks
        ? 8
        : 1;
  }
};

if (import.meta.main ?? executedAsScript(import.meta.url)) {
  process.exitCode = await main();
}
