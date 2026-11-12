#!/usr/bin/env node

// Waits for a pull request's checks and the configured reviewer's review of
// its head commit, polling through Postern. It prints nothing while waiting and one line when
// it exits, starting with the head's full SHA, plus one line per failing
// check or a copyable outcome template on exit 6. Its exit code names the outcome:
//
//   0  checks settled and the reviewer reviewed the head, or none is configured
//   1  usage or platform error
//   2  one or more checks failed, including a workflow whose latest run failed
//      with no check from that run or attempt
//   3  checks settled and the configured reviewer is unavailable
//   4  checks settled and the configured reviewer did not review this head
//   5  still waiting at the invocation limit; run it again
//   6  checks settled; external review skipped by app-author policy
//   7  invalid trusted review configuration; owner handoff, keep the PR open
//
// Checks settled means every declared required name has positive success and
// no observed check or workflow attempt remains unfinished or failed.
// A workflow whose latest run failed with no check from that run or attempt
// counts as a failed check.
//
// Usage: node wait.mjs <number> [--repo <owner/name>] [--limit <seconds>]
//        [--interval <seconds>]
//
// The default polling limit is 540 seconds. Each platform request has a
// 45-second timeout; paginated reads retain their request bounds.
// One invocation covers 9 minutes waited; repository data sets review bounds.
// Both review configurations come from one destination default-branch commit.
// A head with no recorded push and no check or run never settles its checks.
import {
  connectionFor,
  executedAsScript,
  pages,
  checkRollup,
  workflowRuns,
  reviewComments,
  pushTime,
  conversationComments,
  readyForReviewTime,
} from "./platform.mjs";

import {
  InvalidTrustedReviewConfiguration,
  trustedReviewConfiguration,
} from "./trusted-review-config.mjs";
import { reviewsSection, reviewTemplate } from "./review-outcome.mjs";
import { skipsExternalReview } from "./review-policy.mjs";
import {
  reviewRequestedAt,
  reviewerState,
  reviewerPhrase,
} from "./reviewer.mjs";
export { reviewRequestedAt } from "./reviewer.mjs";

import {
  validationCheckStates,
  failedConclusions,
} from "./required-checks.mjs";
export { checkStates } from "./required-checks.mjs";

const settledCodes = {
  skipped: 6,
  reviewed: 0,
  unavailable: 3,
  "not requested": 4,
  "request bound reached": 4,
  "no response": 4,
  "not reviewing": 4,
};

// A job or attempt link and its run link share this Actions run URL.
const workflowRunLink = (link) =>
  /^(.*\/actions\/runs\/\d+)(?:[/?#]|$)/.exec(link ?? "")?.[1];

// Decides the outcome from one look at the pull request. `checks` holds
// `{ name, state: "pass" | "fail" | "pending", link, workflowName?,
//    checkRunStartedAt? }`, with the check run's start in `checkRunStartedAt`;
// `runs` holds the head's GitHub Actions workflow runs as
// `{ workflow_id, name, status, conclusion, run_started_at, html_url }`, with
// the latest attempt's start in `run_started_at`. Check links identify their
// workflow through its runs; a workflow name also identifies it when unique.
// A check settles that workflow's latest run only if it started at or after
// the run's latest attempt. A workflow whose latest run failed with no check
// from that run or attempt joins the failed checks under its name and run link;
// `requestedAt` is the effective review request time; `evidenceRequestedAt`
// retains the opening/explicit-request cutoff for completion and unavailability.
// `pushedAt` is the head's push
// time or its committer-date fallback, used for reviewer timing. An empty
// check set remains pending regardless of push age. Failed checks end the wait
// immediately. It
// returns `code: null` while the outcome is unsettled and the invocation limit
// is not reached.
export const decide = ({
  reviewer,
  policy,
  author,
  head,
  checks,
  runs = [],
  requestedAt,
  evidenceRequestedAt = requestedAt,
  pushedAt,
  comments,
  reviews = [],
  now,
  startedAt,
  limitMs,
}) => {
  const state = reviewerState(reviewer, {
    policy,
    author,
    head,
    requestedAt,
    evidenceRequestedAt,
    pushedAt,
    comments,
    reviews,
    now,
  });
  const review = state
    ? { reviewer: state, reviewerPhrase: reviewerPhrase(reviewer, state) }
    : {};
  const latestRuns = new Map();
  const workflowsByLink = new Map();
  const workflowsByName = new Map();
  for (const run of runs) {
    const known = latestRuns.get(run.workflow_id);
    if (!known || run.run_started_at > known.run_started_at) {
      latestRuns.set(run.workflow_id, run);
    }
    const link = workflowRunLink(run.html_url);
    if (link) workflowsByLink.set(link, run.workflow_id);
    const ids = workflowsByName.get(run.name) ?? new Set();
    ids.add(run.workflow_id);
    workflowsByName.set(run.name, ids);
  }
  const checkedWorkflows = new Set();
  for (const check of checks) {
    if (!check.workflowName) continue;
    const linkedId = workflowsByLink.get(workflowRunLink(check.link));
    const namedIds = workflowsByName.get(check.workflowName);
    const workflowId =
      linkedId ?? (namedIds?.size === 1 ? [...namedIds][0] : undefined);
    const run = latestRuns.get(workflowId);
    if (
      run &&
      Date.parse(check.checkRunStartedAt) >= Date.parse(run.run_started_at)
    ) {
      checkedWorkflows.add(workflowId);
    }
  }
  const failingRuns = [...latestRuns.values()]
    .filter(
      (run) =>
        !checkedWorkflows.has(run.workflow_id) &&
        run.status === "completed" &&
        failedConclusions.has(run.conclusion?.toUpperCase()),
    )
    .map((run) => ({ name: run.name, state: "fail", link: run.html_url }));
  const failing = [
    ...checks.filter((check) => check.state === "fail"),
    ...failingRuns,
  ];
  const checksPending =
    (checks.length === 0 && failingRuns.length === 0) ||
    checks.some((check) => check.state === "pending") ||
    runs.some((run) => run.status !== "completed");
  if (failing.length > 0) {
    return { code: 2, ...review, failing };
  }
  if (!checksPending && !state) {
    return { code: 0, failing };
  }
  if (!checksPending && state in settledCodes) {
    return { code: settledCodes[state], ...review, failing };
  }
  if (now - startedAt >= limitMs) {
    return { code: 5, ...review, failing, checksPending };
  }
  return { code: null, ...review, failing, checksPending };
};

// The lines the script prints for a decided outcome.
export const report = (outcome, head) => {
  const count = outcome.failing.length;
  const failed = `${count} check${count === 1 ? "" : "s"} failed`;
  let line;
  if (outcome.code === 5) {
    const pending = [
      outcome.checksPending && "checks",
      outcome.reviewer && !(outcome.reviewer in settledCodes) && "reviewer",
    ].filter(Boolean);
    const waiting = `still waiting on ${pending.join(" and ")}; run again`;
    line = count === 0 ? waiting : `${failed}, ${waiting}`;
  } else {
    const checks = count === 0 ? "checks passed" : failed;
    line = [checks, outcome.reviewerPhrase].filter(Boolean).join(", ");
  }
  return [
    `${head}: ${line}`,
    ...outcome.failing.map((check) => `${check.name} ${check.link}`),
    ...(outcome.code === 6
      ? [
          "",
          `Post this pull request review, as ${reviewsSection} describes, after replacing every placeholder:`,
          "",
          ...reviewTemplate(head),
        ]
      : []),
  ];
};

class UsageError extends Error {}

const parseArguments = (argv) => {
  const options = { limit: 540, interval: 30 };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = /^--(repo|limit|interval)$/.exec(argv[index])?.[1];
    if (!flag) {
      positional.push(argv[index]);
      continue;
    }
    const value = argv[(index += 1)];
    if (value === undefined) throw new UsageError(`--${flag} needs a value`);
    options[flag] = flag === "repo" ? value : Number(value);
    if (
      flag !== "repo" &&
      (!(options[flag] > 0) || !Number.isFinite(options[flag] * 1000))
    ) {
      throw new UsageError(
        `--${flag} must be a finite positive number of seconds with finite milliseconds`,
      );
    }
  }
  if (positional.length !== 1 || !/^[1-9]\d*$/.test(positional[0])) {
    throw new UsageError(
      "usage: wait.mjs <number> [--repo <owner/name>] [--limit <seconds>] [--interval <seconds>]",
    );
  }
  return { number: positional[0], ...options };
};

const pause = async (durationMs) => {
  const startedAt = Date.now();
  let remaining = durationMs;
  while (remaining > 0) {
    // Node turns delays above its signed 32-bit timer maximum into 1 ms.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(remaining, 2_147_483_647)),
    );
    remaining = durationMs - (Date.now() - startedAt);
  }
};

const look = async (
  number,
  pushTimes,
  reviewer,
  policy,
  requiredChecks,
  connection,
) => {
  const path = `/repos/${connection.repository.path}`;
  if (reviewer && !connection.pullRequests.capabilities.reviewCommits)
    throw new Error(
      "Review commits are unavailable; cannot establish latest-head review.",
    );
  const pull = await connection.pullRequests.pullRequest(Number(number));
  const [rollup, comments, reviews, reviewCommentPages, runs, push, readyAt] =
    await Promise.all([
      checkRollup(connection, pull.headCommit),
      reviewer
        ? pages(connection, `${path}/issues/${number}/comments?per_page=100`)
        : [],
      reviewer ? connection.pullRequests.reviews(Number(number)) : [],
      reviewer
        ? pages(connection, `${path}/pulls/${number}/comments?per_page=100`)
        : [],
      pages(
        connection,
        `${path}/actions/runs?head_sha=${pull.headCommit}&per_page=100`,
      ),
      pushTimes.get(pull.headCommit) ?? pushTime(pull, connection),
      reviewer?.request.onOpen &&
      !skipsExternalReview(policy, pull.author?.login)
        ? readyForReviewTime(connection, number)
        : null,
    ]);
  const commentsByReview = new Map();
  for (const comment of reviewComments(reviewCommentPages)) {
    const group = commentsByReview.get(comment.pull_request_review_id) ?? [];
    group.push(comment);
    commentsByReview.set(comment.pull_request_review_id, group);
  }
  const neutralComments = conversationComments(comments);
  if (push.pushRecorded) pushTimes.set(pull.headCommit, push);
  return {
    head: pull.headCommit,
    checks: validationCheckStates(rollup, requiredChecks, workflowRuns(runs)),
    runs: workflowRuns(runs),
    reviewer,
    policy,
    author: pull.author?.login,
    reviews: reviews.map((review) => ({
      user: review.author,
      commit_id: review.commit,
      state: review.state,
      body: review.body,
      comments: commentsByReview.get(review.id) ?? [],
    })),
    // Ready adjusts bounds and head freshness, while the original request
    // cutoff keeps already-recognized completion and unavailability valid.
    evidenceRequestedAt: reviewRequestedAt(
      Date.parse(pull.createdAt),
      neutralComments,
      reviewer,
      { policy, author: pull.author?.login },
    ),
    requestedAt: reviewRequestedAt(
      Date.parse(pull.createdAt),
      neutralComments,
      reviewer,
      { policy, author: pull.author?.login, readyAt },
    ),
    ...push,
    comments: neutralComments,
  };
};

export const main = async (argv = process.argv.slice(2), connection) => {
  const startedAt = Date.now();
  let options;
  let reviewer;
  let policy;
  let evidence;
  let requiredChecks;
  try {
    options = parseArguments(argv);
    connection ??= connectionFor(options.repo);
    ({ reviewer, policy, evidence, requiredChecks } =
      await trustedReviewConfiguration(connection, { requiredChecks: true }));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return error instanceof InvalidTrustedReviewConfiguration ? 7 : 1;
  }
  const limitMs = options.limit * 1000;
  const pushTimes = new Map();
  for (;;) {
    let state;
    try {
      state = await look(
        options.number,
        pushTimes,
        reviewer,
        policy,
        requiredChecks,
        connection,
      );
    } catch (error) {
      process.stderr.write(
        `wait.mjs: ${error.message}; required checks: ${requiredChecks.join(", ")}; ${evidence}\n`,
      );
      return 1;
    }
    const outcome = decide({ ...state, now: Date.now(), startedAt, limitMs });
    if (outcome.code !== null) {
      const lines = report(outcome, state.head);
      lines[0] += `; ${evidence}`;
      process.stdout.write(`${lines.join("\n")}\n`);
      return outcome.code;
    }
    const remaining = startedAt + limitMs - Date.now();
    await pause(Math.max(0, Math.min(options.interval * 1000, remaining)));
  }
};

if (import.meta.main ?? executedAsScript(import.meta.url)) {
  process.exitCode = await main();
}
