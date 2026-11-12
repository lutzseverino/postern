import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  connect,
  detectPlatform,
  PlatformError,
} from "../../../vendor/postern/postern.mjs";

// The only credential is the GitHub CLI's currently authenticated credential.
export function connectionFor(repository) {
  let remote = repository ?? process.env.GH_REPO ?? defaultRemote();
  if (!remote.includes(":")) {
    // CLI selectors accept [HOST/]OWNER/REPO; retain an explicit host.
    const selector =
      /^(?:([a-z0-9.-]+)\/)?([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/i.exec(remote);
    if (!selector)
      throw new PlatformError(
        "unsupported",
        "Repository selector must use [HOST/]OWNER/REPO.",
      );
    remote = `https://${selector[1] ?? "github.com"}/${selector[2]}/${selector[3]}`;
  }
  const identity = detectPlatform(remote);
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
  return connect(identity, { credential, timeoutMs: 45_000 });
}

// --view deliberately omits the host. Recover it from the configured remote,
// without asking a platform API (which could already target the wrong host).
function defaultRemote() {
  const selected = execFileSync("gh", ["repo", "set-default", "--view"], {
    encoding: "utf8",
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const git = (...args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  if (!selected) return git("remote", "get-url", "origin");

  const candidates = new Map();
  const configuration = git(
    "config",
    "--null",
    "--get-regexp",
    "^remote\\..*\\.gh-resolved$",
  );
  for (const entry of configuration.split("\0")) {
    const match = /^remote\.(.+)\.gh-resolved\n([\s\S]+)$/.exec(entry);
    if (!match) continue;
    const [, name, resolution] = match;
    const remote = git("remote", "get-url", name);
    const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(remote);
    const url = new URL(scp ? `ssh://${scp[1]}/${scp[2]}` : remote);
    if (url.protocol === "ssh:" || url.protocol === "git+ssh:") {
      const configuration = execFileSync("ssh", ["-G", url.hostname], {
        encoding: "utf8",
        timeout: 15_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const hostname = /^hostname (\S+)$/m.exec(configuration)?.[1];
      if (!hostname)
        throw new Error("Could not resolve the configured SSH remote host.");
      url.hostname = hostname;
    }
    const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
    const destination =
      resolution === "base" ? path : resolution.split("/").slice(-2).join("/");
    if (destination.toLowerCase() !== selected.toLowerCase()) continue;
    const host =
      url.protocol !== "https:" && url.hostname === "ssh.github.com"
        ? "github.com"
        : url.hostname;
    if (process.env.GH_HOST && host !== process.env.GH_HOST.toLowerCase())
      continue;
    url.pathname = `/${selected}`;
    candidates.set(host, url.href);
  }
  if (candidates.size !== 1)
    throw new Error(
      "Could not establish the configured GitHub CLI default repository host.",
    );
  return [...candidates.values()][0];
}

export async function requestData(connection, request) {
  return (await connection.access.request(request)).data;
}

// Paths are named by the caller. An existing snapshot keeps later reads at the
// same immutable revision, including the merge guard's final configuration read.
export async function pinnedFiles(connection, paths, snapshot) {
  const repository = connection.repository.path;
  const [owner, name] = repository.split("/");
  const query = async (source, variables = {}) => {
    const response = await requestData(connection, {
      method: "POST",
      path: "/graphql",
      body: { query: source, variables: { owner, name, ...variables } },
    });
    if (response?.errors?.length || !response?.data?.repository)
      throw new Error(`Could not read pinned files for ${repository}.`);
    return response.data.repository;
  };
  if (!snapshot) {
    const destination =
      await query(`query PinnedFilesRevision($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        nameWithOwner
        defaultBranchRef { name target { __typename oid } }
      }
    }`);
    const branch = destination.defaultBranchRef;
    const revision = branch?.target?.oid;
    if (
      destination.nameWithOwner?.toLowerCase() !== repository.toLowerCase() ||
      typeof branch?.name !== "string" ||
      !branch.name ||
      branch.target?.__typename !== "Commit" ||
      !/^[0-9a-f]{40}$/i.test(revision ?? "")
    )
      throw new Error(
        `Could not resolve the default-branch commit for ${repository}.`,
      );
    snapshot = {
      revision,
      evidence: `${repository} default branch ${branch.name}@${revision}`,
    };
  }
  const { revision, evidence } = snapshot;
  try {
    const entries = Object.entries(paths);
    const result = await query(
      `query PinnedFiles($owner: String!, $name: String!, $revision: GitObjectID!${entries.map(([key]) => `, $${key}: String!`).join("")}) {
        repository(owner: $owner, name: $name) {
          commit: object(oid: $revision) { __typename oid }
          ${entries.map(([key]) => `${key}: object(expression: $${key}) { __typename ... on Blob { text isTruncated } }`).join("\n")}
        }
      }`,
      {
        revision,
        ...Object.fromEntries(
          entries.map(([key, path]) => [key, `${revision}:${path}`]),
        ),
      },
    );
    if (
      result.commit?.__typename !== "Commit" ||
      result.commit.oid !== revision
    )
      throw new Error("Could not read the pinned commit.");
    const files = Object.fromEntries(
      entries.map(([key, path]) => {
        const blob = result[key];
        // Only explicit null in a successful response proves optional absence.
        if (blob === null) return [key, null];
        if (
          blob?.__typename !== "Blob" ||
          blob.isTruncated !== false ||
          typeof blob.text !== "string"
        )
          throw new Error(`Could not read complete ${path}.`);
        return [key, blob.text];
      }),
    );
    return { revision, files, evidence };
  } catch (error) {
    if (error instanceof PlatformError) {
      error.message = `${evidence}: ${error.message}`;
      throw error;
    }
    throw new Error(`${evidence}: ${error.message}`, { cause: error });
  }
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
            nodes { __typename ... on CheckRun { name status conclusion detailsUrl startedAt checkSuite { workflowRun { workflow { name } } } } ... on StatusContext { context state targetUrl createdAt } }
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
  const total = pages[0]?.total_count;
  if (
    total !== undefined &&
    (!Number.isSafeInteger(total) ||
      total < 0 ||
      total !== runs.length ||
      pages.some((page) => page.total_count !== total))
  )
    unreadable("complete workflow runs");
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

// Read the complete transition history each time; a resumed wait uses the same
// platform time, and returning to draft does not erase an earlier ready event.
export async function readyForReviewTime(connection, number) {
  let latest = null;
  for (const page of await pages(
    connection,
    `/repos/${connection.repository.path}/issues/${number}/timeline?per_page=100`,
  )) {
    if (!Array.isArray(page)) unreadable("ready-for-review history");
    for (const event of page) {
      if (event?.event !== "ready_for_review") continue;
      const time = Date.parse(event.created_at);
      if (!Number.isFinite(time)) unreadable("a ready-for-review time");
      latest = latest === null ? time : Math.max(latest, time);
    }
  }
  return latest;
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

// Thread resolution is a platform fact, independent of replies or review state.
// The first comment identifies the opener; query all threads, including outdated.
export async function unresolvedReviewerThreads(connection, number, reviewer) {
  if (!reviewer) return [];
  const [owner, name] = connection.repository.path.split("/");
  const unresolved = [];
  const cursors = new Set();
  let after = null;
  for (;;) {
    const result = await requestData(connection, {
      method: "POST",
      path: "/graphql",
      body: {
        query: `query BabysitReviewThreads($owner: String!, $name: String!, $number: Int!, $after: String) {
          repository(owner: $owner, name: $name) { pullRequest(number: $number) {
            reviewThreads(first: 100, after: $after) {
              nodes { id isResolved comments(first: 1) { nodes { author { __typename login } } } }
              pageInfo { hasNextPage endCursor }
            }
          } }
        }`,
        variables: { owner, name, number, after },
      },
    });
    const page = result?.data?.repository?.pullRequest?.reviewThreads;
    if (
      result?.errors?.length ||
      !Array.isArray(page?.nodes) ||
      typeof page.pageInfo?.hasNextPage !== "boolean"
    )
      throw new Error("Could not read complete configured-reviewer threads.");
    for (const thread of page.nodes) {
      const comments = thread?.comments?.nodes;
      if (
        typeof thread?.id !== "string" ||
        !thread.id ||
        typeof thread.isResolved !== "boolean" ||
        !Array.isArray(comments) ||
        comments.length !== 1 ||
        typeof comments[0]?.author?.__typename !== "string" ||
        !comments[0].author.__typename ||
        typeof comments[0]?.author?.login !== "string" ||
        !comments[0].author.login
      )
        throw new Error(
          "Could not read a configured-reviewer thread opener or resolution.",
        );
      const author = comments[0].author;
      // GraphQL omits the bot suffix that REST and reviewer declarations use,
      // matching Postern's GraphQL account interpretation.
      const login =
        author.__typename === "Bot" && !author.login.endsWith("[bot]")
          ? `${author.login}[bot]`
          : author.login;
      if (
        login.toLowerCase() === reviewer.account.toLowerCase() &&
        !thread.isResolved
      )
        unresolved.push(thread.id);
    }
    if (!page.pageInfo.hasNextPage) return unresolved;
    const cursor = page.pageInfo.endCursor;
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor))
      throw new Error("Could not read complete configured-reviewer threads.");
    cursors.add(cursor);
    after = cursor;
  }
}
