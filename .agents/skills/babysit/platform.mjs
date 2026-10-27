import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { connect, PlatformError } from "../../../vendor/postern/postern.mjs";

// The only credential is the GitHub CLI's currently authenticated credential.
export function connectionFor(repository) {
  const remote =
    repository ??
    process.env.GH_REPO ??
    execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      timeout: 15_000,
    }).trim();
  let credential;
  try {
    credential = execFileSync(
      "gh",
      ["auth", "token", "--hostname", "github.com"],
      { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error(
      "Could not read the currently authenticated GitHub CLI credential.",
    );
  }
  if (!credential)
    throw new Error(
      "The currently authenticated GitHub CLI credential is empty.",
    );
  return connect(
    remote.includes(":") ? remote : `https://github.com/${remote}`,
    { credential, timeoutMs: 45_000 },
  );
}

export async function requestData(connection, request) {
  return (await connection.access.request(request)).data;
}

export async function pages(connection, path) {
  return (await connection.access.requestPages({ path })).map(
    (page) => page.data,
  );
}

// CheckResult omits links, workflow identity and start time. Access retains
// those GitHub facts so the existing check/attempt ordering stays unchanged.
export async function checkRollup(connection, head) {
  const [owner, name] = connection.repository.path.split("/");
  const items = [];
  const seen = new Set();
  let after = null;
  for (;;) {
    const data = await requestData(connection, {
      method: "POST",
      path: "/graphql",
      body: {
        query: `query BabysitChecks($owner: String!, $name: String!, $head: String!, $after: String) {
          repository(owner: $owner, name: $name) { object(expression: $head) { ... on Commit { statusCheckRollup { contexts(first: 100, after: $after) {
            nodes { __typename ... on CheckRun { name status conclusion detailsUrl startedAt checkSuite { workflowRun { workflow { name } } } } ... on StatusContext { context state targetUrl } }
            pageInfo { hasNextPage endCursor }
          } } } } }
        }`,
        variables: { owner, name, head, after },
      },
    });
    if (data?.errors?.length)
      throw new PlatformError(
        "invalidResponse",
        "Could not read pull request checks.",
      );
    const rollup = data?.data?.repository?.object?.statusCheckRollup;
    if (rollup === null && after === null) return [];
    const page = rollup?.contexts;
    if (
      !Array.isArray(page?.nodes) ||
      typeof page.pageInfo?.hasNextPage !== "boolean"
    )
      throw new PlatformError(
        "invalidResponse",
        "Could not read complete pull request checks.",
      );
    for (const item of page.nodes) {
      const valid =
        item?.__typename === "CheckRun"
          ? typeof item.name === "string" &&
            item.name.length > 0 &&
            checkStatuses.has(item.status) &&
            (item.status !== "COMPLETED" ||
              (checkConclusions.has(item.conclusion) &&
                Number.isFinite(Date.parse(item.startedAt))))
          : item?.__typename === "StatusContext" &&
            typeof item.context === "string" &&
            item.context.length > 0 &&
            statusStates.has(item.state);
      if (!valid)
        throw new PlatformError(
          "invalidResponse",
          "Could not read a pull request check.",
        );
      items.push({
        ...item,
        workflowName:
          item.checkSuite?.workflowRun?.workflow?.name ?? item.workflowName,
      });
    }
    if (!page.pageInfo.hasNextPage) return items;
    const cursor = page.pageInfo.endCursor;
    if (typeof cursor !== "string" || !cursor || seen.has(cursor))
      throw new PlatformError(
        "invalidResponse",
        "Could not read complete pull request checks.",
      );
    seen.add(cursor);
    after = cursor;
  }
}

export function executedAsScript(url) {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url));
}

const checkStatuses = new Set([
  "QUEUED",
  "IN_PROGRESS",
  "COMPLETED",
  "WAITING",
  "REQUESTED",
  "PENDING",
]);
const checkConclusions = new Set([
  "SUCCESS",
  "FAILURE",
  "NEUTRAL",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STALE",
  "STARTUP_FAILURE",
  "SKIPPED",
]);
const statusStates = new Set([
  "ERROR",
  "EXPECTED",
  "FAILURE",
  "PENDING",
  "SUCCESS",
]);

function unreadable(fact) {
  throw new PlatformError("invalidResponse", `Could not read ${fact}.`);
}

export function workflowRuns(pages) {
  const runs = [];
  for (const page of pages) {
    if (!Array.isArray(page?.workflow_runs)) unreadable("workflow runs");
    for (const run of page.workflow_runs) {
      if (
        !Number.isSafeInteger(run?.workflow_id) ||
        run.workflow_id <= 0 ||
        typeof run.name !== "string" ||
        !run.name ||
        !checkStatuses.has(run.status?.toUpperCase()) ||
        (run.status === "completed" &&
          (!checkConclusions.has(run.conclusion?.toUpperCase()) ||
            !Number.isFinite(Date.parse(run.run_started_at))))
      )
        unreadable("a workflow run");
      runs.push(run);
    }
  }
  return runs;
}

export function reviewComments(pages) {
  const comments = [];
  for (const page of pages) {
    if (!Array.isArray(page)) unreadable("review comments");
    for (const comment of page) {
      if (
        !Number.isSafeInteger(comment?.pull_request_review_id) ||
        comment.pull_request_review_id <= 0 ||
        (comment.in_reply_to_id != null &&
          (!Number.isSafeInteger(comment.in_reply_to_id) ||
            comment.in_reply_to_id <= 0))
      )
        unreadable("a review comment");
      comments.push(comment);
    }
  }
  return comments;
}

export function pushActivity(pages) {
  const activity = [];
  for (const page of pages) {
    if (!Array.isArray(page)) unreadable("push activity");
    for (const entry of page) {
      if (
        !/^[a-f0-9]{40}$/i.test(entry?.after ?? "") ||
        !Number.isFinite(Date.parse(entry.timestamp))
      )
        unreadable("a push activity entry");
      activity.push(entry);
    }
  }
  return activity;
}

export function conversationComments(pages) {
  const comments = [];
  for (const page of pages) {
    if (!Array.isArray(page)) unreadable("pull request comments");
    for (const comment of page) {
      if (
        typeof comment?.body !== "string" ||
        !Number.isFinite(Date.parse(comment.created_at)) ||
        (comment.user != null &&
          (typeof comment.user.login !== "string" || !comment.user.login))
      )
        unreadable("a pull request comment");
      comments.push({
        login: comment.user?.login,
        createdAt: comment.created_at,
        body: comment.body,
      });
    }
  }
  return comments;
}

// Whether GitHub recorded the push of the pull request's head, with its time
// for the reviewer: the recorded time, else the committer date, never before
// opening.
export const pushTime = async (pull, connection) => {
  const head = pull.headCommit;
  const path = `/repos/${connection.repository.path}`;
  const activity = pushActivity(
    await pages(
      connection,
      `${path}/activity?ref=${encodeURIComponent(`refs/heads/${pull.headBranch}`)}&per_page=100`,
    ).catch(() => []),
  );
  const recorded = activity.find((entry) => entry.after === head);
  const pushedAt =
    recorded?.timestamp ??
    (await requestData(connection, { path: `${path}/commits/${head}` })).commit
      .committer.date;
  if (!Number.isFinite(Date.parse(pushedAt)))
    throw new Error("The head push time is unavailable.");
  return {
    pushedAt: Math.max(Date.parse(pushedAt), Date.parse(pull.createdAt)),
    pushRecorded: Boolean(recorded),
  };
};
