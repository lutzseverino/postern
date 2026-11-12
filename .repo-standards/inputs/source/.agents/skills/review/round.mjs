#!/usr/bin/env node

// Usage: node round.mjs <number> [--issue <number>]... [--repo <owner/name>]
//        node round.mjs <number> --post <file> [--repo <owner/name>]
//        node round.mjs <number> --ready [--repo <owner/name>]
//
// Rounds are the standing (submitted, undismissed) reviews in the comment
// rules' template that the account running this command posted; no other
// account's review counts. Without an action, prints the pull request's
// round: its head, the round number, whether that head already has this
// account's review, whether the review held (this account's latest review is
// of the head and leaves no open finding), whether the PR is a draft, the
// issues it closes (plus each --issue) and every owner gate (`gate:` label)
// on the PR or those issues.
// --post posts the file as this round's review of the current head, once it is
// a complete review of that head and the head has none of this account's yet.
// --ready marks the draft PR ready for review once the review held.
// Exit 0: done. 1: invocation or platform error. 2: the file is not a complete
// review of the current head (--post), or the review has not held (--ready).
// 3: the current head already has this account's review (--post).
import { readFileSync } from "node:fs";
import {
  connectionFor,
  executedAsScript,
  requestData,
} from "../babysit/platform.mjs";
import {
  completeReview,
  holdingReview,
  reviewedHead,
  reviewsSection,
} from "../babysit/review-outcome.mjs";

const usage =
  "Usage: round.mjs <number> [--issue <number>]... [--post <file> | --ready] [--repo <owner/name>]";
const positive = /^[1-9]\d*$/;

const closingIssuesQuery = `query ReviewRoundIssues($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      closingIssuesReferences(first: 50) {
        nodes { number labels(first: 100) { nodes { name } pageInfo { hasNextPage } } }
        pageInfo { hasNextPage }
      }
    }
  }
}`;

// The account this command runs as, the identity whose holding review it
// trusts. GraphQL's viewer serves App installation tokens too; it names a Bot
// without the `[bot]` suffix that REST review authors carry.
const viewerQuery = "query ReviewRoundViewer { viewer { __typename login } }";

const readyMutation = `mutation ReviewRoundReady($id: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } }
}`;

function options(argv) {
  const [number, ...flags] = argv;
  if (!positive.test(number ?? "")) throw new Error(usage);
  const parsed = { number: Number(number), issues: [], action: null };
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (flag === "--issue" && positive.test(value ?? "")) {
      parsed.issues.push(Number(value));
      index++;
    } else if (flag === "--post" && value && !parsed.action) {
      parsed.action = { post: value };
      index++;
    } else if (flag === "--ready" && !parsed.action) parsed.action = "ready";
    else if (flag === "--repo" && value) {
      parsed.repository = value;
      index++;
    } else throw new Error(usage);
  }
  return parsed;
}

// A complete review names its own head, the commit it was posted on; count it
// against that head.
export function completedReviews(reviews) {
  return reviews.flatMap((review) => {
    const head = reviewedHead(review.body);
    return head &&
      (review.commit ?? head) === head &&
      completeReview(review.body, head)
      ? [{ head, holds: holdingReview(review.body, head) }]
      : [];
  });
}

const labelNames = (labels) => labels.map((label) => label.name);

async function closingIssues(connection, number) {
  const [owner, name] = connection.repository.path.split("/");
  const response = await requestData(connection, {
    method: "POST",
    path: "/graphql",
    body: { query: closingIssuesQuery, variables: { owner, name, number } },
  });
  const references =
    response?.data?.repository?.pullRequest?.closingIssuesReferences;
  if (response?.errors?.length || !references)
    throw new Error(`Could not read the issues pull request #${number} closes.`);
  if (
    references.pageInfo.hasNextPage ||
    references.nodes.some((issue) => issue.labels.pageInfo.hasNextPage)
  )
    throw new Error(
      `Pull request #${number} closes more issues or labels than one read holds.`,
    );
  return references.nodes.map((issue) => ({
    number: issue.number,
    labels: labelNames(issue.labels.nodes),
  }));
}

async function viewerLogin(connection) {
  const response = await requestData(connection, {
    method: "POST",
    path: "/graphql",
    body: { query: viewerQuery },
  });
  const viewer = response?.data?.viewer;
  if (
    response?.errors?.length ||
    !["User", "Bot"].includes(viewer?.__typename) ||
    !viewer.login?.trim()
  )
    throw new Error("Could not read the account this command runs as.");
  return viewer.__typename === "Bot" && !viewer.login.endsWith("[bot]")
    ? `${viewer.login}[bot]`
    : viewer.login;
}

async function round(connection, { number, issues: extra }) {
  const repository = connection.repository.path;
  const pull = await requestData(connection, {
    method: "GET",
    path: `/repos/${repository}/pulls/${number}`,
  });
  const head = pull?.head?.sha;
  if (!/^[0-9a-f]{40}$/.test(head ?? "") || pull.state !== "open")
    throw new Error(`Pull request #${number} is not open with a readable head.`);
  const issues = await closingIssues(connection, number);
  for (const issue of extra.filter(
    (candidate) => !issues.some(({ number }) => number === candidate),
  )) {
    const read = await requestData(connection, {
      method: "GET",
      path: `/repos/${repository}/issues/${issue}`,
    });
    issues.push({ number: issue, labels: labelNames(read.labels ?? []) });
  }
  const gates = [
    ...labelNames(pull.labels ?? []).map((label) => [label, "the PR"]),
    ...issues.flatMap(({ number, labels }) =>
      labels.map((label) => [label, `#${number}`]),
    ),
  ]
    .filter(([label]) => label.startsWith("gate:"))
    .map(([label, where]) => `${label} on ${where}`);
  // Only this account's standing reviews record rounds, oldest first. Each
  // reviewed head is one round; the current head's round is the next one until
  // its review is posted. The review held when the latest one is a holding
  // review of the current head.
  const viewer = (await viewerLogin(connection)).toLowerCase();
  const rounds = completedReviews(
    (await connection.pullRequests.reviews(number)).filter(
      (review) =>
        !["PENDING", "DISMISSED"].includes(review.state) &&
        review.author?.login?.toLowerCase() === viewer,
    ),
  );
  const heads = new Set(rounds.map((entry) => entry.head));
  const latest = rounds.at(-1);
  return {
    pull,
    head,
    round: heads.size + (heads.has(head) ? 0 : 1),
    reviewed: heads.has(head),
    held: latest?.head === head && latest.holds,
    issues,
    gates,
  };
}

const report = (facts) =>
  [
    `head ${facts.head}`,
    `round ${facts.round}`,
    `reviewed ${facts.reviewed ? "yes" : "no"}`,
    `held ${facts.held ? "yes" : "no"}`,
    `draft ${facts.pull.draft ? "yes" : "no"}`,
    `issues ${facts.issues.map(({ number }) => `#${number}`).join(" ") || "none"}`,
    `gates ${facts.gates.join(", ") || "none"}`,
  ].join("\n") + "\n";

export const main = async (argv = process.argv.slice(2), connection) => {
  try {
    const parsed = options(argv);
    connection ??= connectionFor(parsed.repository);
    const facts = await round(connection, parsed);
    const { number, action } = parsed;
    if (action === null) {
      process.stdout.write(report(facts));
      return 0;
    }
    if (action === "ready") {
      if (!facts.held) {
        process.stderr.write(
          `round.mjs: the review of ${facts.head} has not held for this account; a round holds only once this account's review, posted as ${reviewsSection} describes, leaves no open finding.\n`,
        );
        return 2;
      }
      if (facts.pull.draft)
        await requestData(connection, {
          method: "POST",
          path: "/graphql",
          body: {
            query: readyMutation,
            variables: { id: facts.pull.node_id },
          },
        }).then((response) => {
          if (
            response?.errors?.length ||
            response?.data?.markPullRequestReadyForReview?.pullRequest
              ?.isDraft !== false
          )
            throw new Error(`Could not mark #${number} ready for review.`);
        });
      process.stdout.write(`${facts.head}: #${number} is ready for review\n`);
      return 0;
    }
    const body = readFileSync(action.post, "utf8");
    if (!completeReview(body, facts.head)) {
      process.stderr.write(
        `round.mjs: the file is not a complete review of ${facts.head}; fill the template ${reviewsSection} gives, with that head.\n`,
      );
      return 2;
    }
    if (facts.reviewed) {
      process.stderr.write(
        `round.mjs: ${facts.head} already has this account's review; post none for it.\n`,
      );
      return 3;
    }
    const posted = await requestData(connection, {
      method: "POST",
      path: `/repos/${connection.repository.path}/pulls/${number}/reviews`,
      body: { commit_id: facts.head, body, event: "COMMENT" },
    });
    process.stdout.write(
      `${facts.head}: posted round ${facts.round} review ${posted?.html_url ?? ""}\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(`round.mjs: ${error.message}\n`);
    return 1;
  }
};

if (import.meta.main ?? executedAsScript(import.meta.url)) {
  process.exitCode = await main();
}
