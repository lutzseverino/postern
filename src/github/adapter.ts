// The GitHub adapter: the four ports over GitHub's REST and GraphQL APIs.
// Reads that need GraphQL-only facts use GraphQL, which GitHub serves only to
// authenticated callers; everything else uses REST, which also serves
// anonymous reads of public repositories.

import type { AdapterContext, AdapterPorts } from "../connection.ts";
import { PlatformError } from "../errors.ts";
import type {
  Access,
  Account,
  CheckResult,
  Comment,
  Issue,
  IssueReference,
  IssueTracker,
  Label,
  LabelChange,
  PullRequest,
  PullRequests,
  Release,
  ReleaseSource,
  Review,
  ReviewThread,
} from "../ports.ts";
import { GitHubTransport, invalid } from "./transport.ts";

type Json = Record<string, unknown>;

export function githubAdapter(context: AdapterContext): AdapterPorts {
  const transport = new GitHubTransport(context);
  const [owner, name] = context.repository.path.split("/") as [string, string];
  const repo = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const coordinates = { owner, name };
  return {
    issueTracker: issueTracker(transport, repo, coordinates),
    pullRequests: pullRequests(transport, repo, coordinates),
    releaseSource: releaseSource(transport, repo),
    access: access(transport, context, repo),
  };
}

// Issues

const referenceFields = "number state repository { nameWithOwner }";

const issueFields = `
  number fullDatabaseId id url state title body createdAt lastEditedAt
  author { __typename login }
  labels(first: 100) { nodes { name } pageInfo { hasNextPage endCursor } }
  parent { ${referenceFields} }
  subIssues(first: 100) { nodes { ${referenceFields} } pageInfo { hasNextPage endCursor } }
  blockedBy(first: 100) { nodes { ${referenceFields} } pageInfo { hasNextPage endCursor } }
  timelineItems(itemTypes: [SUB_ISSUE_ADDED_EVENT], last: 1) { nodes { ... on SubIssueAddedEvent { createdAt } } }`;

const issuesQuery = `query PosternIssues($owner: String!, $name: String!, $states: [IssueState!], $labels: [String!], $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 50, after: $after, states: $states, labels: $labels, orderBy: { field: CREATED_AT, direction: ASC }) {
      nodes { ${issueFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const issueQuery = `query PosternIssue($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $number) { ${issueFields} } }
}`;

const issueConnectionQueries = {
  labels: `query PosternIssueLabels($id: ID!, $after: String) {
  node(id: $id) { ... on Issue { connection: labels(first: 100, after: $after) { nodes { name } pageInfo { hasNextPage endCursor } } } }
}`,
  subIssues: `query PosternSubIssues($id: ID!, $after: String) {
  node(id: $id) { ... on Issue { connection: subIssues(first: 100, after: $after) { nodes { ${referenceFields} } pageInfo { hasNextPage endCursor } } } }
}`,
  blockedBy: `query PosternBlockedBy($id: ID!, $after: String) {
  node(id: $id) { ... on Issue { connection: blockedBy(first: 100, after: $after) { nodes { ${referenceFields} } pageInfo { hasNextPage endCursor } } } }
}`,
};

function issueTracker(transport: GitHubTransport, repo: string, coordinates: Json): IssueTracker {
  // The remaining pages of an issue's nested connections, when it has more than one.
  const complete = async (node: Json): Promise<Issue> => {
    for (const key of ["labels", "subIssues", "blockedBy"] as const) {
      const connection = node[key] as { nodes?: unknown[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } | null;
      if (!connection?.pageInfo?.hasNextPage) continue;
      const rest = await transport.graphqlPages<unknown>(
        issueConnectionQueries[key],
        { id: node.id },
        (data) => (data.node as Json | null)?.connection as never,
      );
      // The first page is already held; the follow-up query starts from it again.
      node[key] = { nodes: rest, pageInfo: { hasNextPage: false } };
    }
    return mapIssue(node);
  };
  return {
    capabilities: { nativeParent: true, nativeBlockers: true, bodyEditTime: true, linkTime: true, botMarking: true },
    async issues(filter = {}) {
      const nodes = await transport.graphqlPages<Json>(
        issuesQuery,
        {
          ...coordinates,
          states: [(filter.state ?? "open").toUpperCase()],
          labels: filter.label === undefined ? null : [filter.label],
        },
        (data) => (data.repository as Json | null)?.issues as never,
      );
      const issues: Issue[] = [];
      for (const node of nodes) issues.push(await complete(node));
      return issues;
    },
    async issue(number) {
      const data = await transport.graphql<Json>(issueQuery, { ...coordinates, number });
      const node = (data.repository as Json | null)?.issue as Json | null | undefined;
      if (!node) throw new PlatformError("notFound", `Issue #${number} was not found.`);
      return complete(node);
    },
    async labelChanges(number) {
      const events = await transport.restPages<Json>(`${repo}/issues/${number}/events`);
      return events
        .filter((event) => event.event === "labeled" || event.event === "unlabeled")
        .map((event): LabelChange => ({
          id: integer(event.id),
          action: event.event === "labeled" ? "added" : "removed",
          label: text((event.label as Json | null)?.name),
          actor: restAccount(event.actor),
          time: text(event.created_at),
        }));
    },
    async comments(number) {
      return (await transport.restPages<Json>(`${repo}/issues/${number}/comments`)).map(mapComment);
    },
    async addLabels(number, labels) {
      await transport.rest(`${repo}/issues/${number}/labels`, { method: "POST", body: { labels } });
    },
    async removeLabel(number, label) {
      await transport.rest(`${repo}/issues/${number}/labels/${segment(label)}`, { method: "DELETE" });
    },
    async createLabel(label) {
      const response = await transport.rest(`${repo}/labels`, { method: "POST", body: label });
      return mapLabel(response.data);
    },
    async createComment(number, body) {
      return mapComment((await transport.rest(`${repo}/issues/${number}/comments`, { method: "POST", body: { body } })).data);
    },
    async updateComment(id, body) {
      return mapComment((await transport.rest(`${repo}/issues/comments/${id}`, { method: "PATCH", body: { body } })).data);
    },
    async closeIssue(number) {
      await transport.rest(`${repo}/issues/${number}`, { method: "PATCH", body: { state: "closed" } });
    },
  };
}

function mapIssue(node: Json): Issue {
  const timeline = (node.timelineItems as { nodes?: Json[] } | null)?.nodes ?? [];
  return {
    number: integer(node.number),
    id: bigInteger(node.fullDatabaseId),
    nodeId: text(node.id),
    url: text(node.url),
    state: issueState(node.state),
    title: text(node.title),
    body: text(node.body),
    author: graphqlAccount(node.author),
    labels: nodes(node.labels).map((label) => text(label.name)),
    createdAt: text(node.createdAt),
    parent: node.parent ? mapReference(node.parent as Json) : null,
    subIssues: nodes(node.subIssues).map(mapReference),
    blockedBy: nodes(node.blockedBy).map(mapReference),
    bodyEditTime: optionalText(node.lastEditedAt),
    linkTime: optionalText(timeline.at(-1)?.createdAt),
  };
}

function mapReference(node: Json): IssueReference {
  return {
    repository: text((node.repository as Json | null)?.nameWithOwner),
    number: integer(node.number),
    state: issueState(node.state),
  };
}

function mapComment(value: unknown): Comment {
  const comment = object(value);
  return {
    id: integer(comment.id),
    nodeId: text(comment.node_id),
    url: text(comment.html_url),
    author: restAccount(comment.user),
    body: text(comment.body ?? ""),
    createdAt: text(comment.created_at),
    updatedAt: text(comment.updated_at),
  };
}

function mapLabel(value: unknown): Label {
  const label = object(value);
  return { name: text(label.name), color: text(label.color), description: text(label.description ?? "") };
}

// Pull requests

const pullRequestFields = `
  number fullDatabaseId id url state title body createdAt
  author { __typename login }
  headRefName headRefOid baseRefName isCrossRepository
  repository { nameWithOwner }`;

const byHeadQuery = `query PosternPullRequestsByHead($owner: String!, $name: String!, $branch: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $after, headRefName: $branch, orderBy: { field: CREATED_AT, direction: ASC }) {
      nodes { ${pullRequestFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const closingQuery = `query PosternClosingPullRequests($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      closedByPullRequestsReferences(first: 100, after: $after, includeClosedPrs: true) {
        nodes { ${pullRequestFields} }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

const pullRequestQuery = `query PosternPullRequest($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { ${pullRequestFields} } }
}`;

const reviewThreadsQuery = `query PosternReviewThreads($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        nodes { id isResolved isOutdated path comments(first: 1) { nodes { author { __typename login } } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

const mergeQueueQuery = `query PosternMergeQueue($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { isMergeQueueEnabled } }
}`;

function pullRequests(transport: GitHubTransport, repo: string, coordinates: Json): PullRequests {
  const pullRequestNode = async (query: string, number: number): Promise<Json> => {
    const data = await transport.graphql<Json>(query, { ...coordinates, number });
    const node = (data.repository as Json | null)?.pullRequest as Json | null | undefined;
    if (!node) throw new PlatformError("notFound", `Pull request #${number} was not found.`);
    return node;
  };
  return {
    capabilities: { closingReferences: true, reviewCommits: true },
    async byHeadBranch(branch) {
      const found = await transport.graphqlPages<Json>(
        byHeadQuery,
        { ...coordinates, branch },
        (data) => (data.repository as Json | null)?.pullRequests as never,
      );
      return found.map(mapPullRequest);
    },
    async closing(issueNumber) {
      const found = await transport.graphqlPages<Json>(closingQuery, { ...coordinates, number: issueNumber }, (data) => {
        const issue = (data.repository as Json | null)?.issue as Json | null | undefined;
        if (!issue) throw new PlatformError("notFound", `Issue #${issueNumber} was not found.`);
        return issue.closedByPullRequestsReferences as never;
      });
      return found.map(mapPullRequest);
    },
    async pullRequest(number) {
      return mapPullRequest(await pullRequestNode(pullRequestQuery, number));
    },
    async reviews(number) {
      return (await transport.restPages<Json>(`${repo}/pulls/${number}/reviews`)).map((review): Review => ({
        id: integer(review.id),
        author: restAccount(review.user),
        state: text(review.state),
        body: text(review.body ?? ""),
        commit: optionalText(review.commit_id),
        submittedAt: optionalText(review.submitted_at),
      }));
    },
    async reviewThreads(number) {
      const threads = await transport.graphqlPages<Json>(reviewThreadsQuery, { ...coordinates, number }, (data) => {
        const pull = (data.repository as Json | null)?.pullRequest as Json | null | undefined;
        if (!pull) throw new PlatformError("notFound", `Pull request #${number} was not found.`);
        return pull.reviewThreads as never;
      });
      return threads.map((thread): ReviewThread => ({
        id: text(thread.id),
        resolved: boolean(thread.isResolved),
        outdated: boolean(thread.isOutdated),
        path: text(thread.path),
        author: graphqlAccount(nodes(thread.comments)[0]?.author),
      }));
    },
    async checks(commit) {
      const ref = segment(commit);
      const [runs, statuses] = await Promise.all([
        transport.restPages<Json>(`${repo}/commits/${ref}/check-runs`, { items: "check_runs" }),
        transport.restPages<Json>(`${repo}/commits/${ref}/status`, { items: "statuses" }),
      ]);
      return [
        ...runs.map((run): CheckResult => ({
          name: text(run.name),
          status: text(run.status),
          conclusion: optionalText(run.conclusion),
          completedAt: optionalText(run.completed_at),
        })),
        ...statuses.map((status): CheckResult => ({
          name: text(status.context),
          status: text(status.state),
          conclusion: null,
          completedAt: null,
        })),
      ];
    },
    async mergesThroughQueue(number) {
      return boolean((await pullRequestNode(mergeQueueQuery, number)).isMergeQueueEnabled);
    },
    async comment(number, body) {
      return mapComment((await transport.rest(`${repo}/issues/${number}/comments`, { method: "POST", body: { body } })).data);
    },
    async squashMerge(number, merge) {
      const response = await transport.rest(`${repo}/pulls/${number}/merge`, {
        method: "PUT",
        body: { merge_method: "squash", sha: merge.expectedHead, commit_title: merge.title, commit_message: merge.body },
      });
      return text(object(response.data).sha);
    },
  };
}

function mapPullRequest(node: Json): PullRequest {
  return {
    repository: text((node.repository as Json | null)?.nameWithOwner),
    number: integer(node.number),
    id: bigInteger(node.fullDatabaseId),
    nodeId: text(node.id),
    url: text(node.url),
    state: pullRequestState(node.state),
    title: text(node.title),
    body: text(node.body),
    author: graphqlAccount(node.author),
    createdAt: text(node.createdAt),
    headBranch: text(node.headRefName),
    headCommit: text(node.headRefOid),
    baseBranch: text(node.baseRefName),
    crossRepository: boolean(node.isCrossRepository),
  };
}

// Releases

function releaseSource(transport: GitHubTransport, repo: string): ReleaseSource {
  return {
    capabilities: { drafts: true, prereleases: true },
    async releases() {
      return (await transport.restPages<Json>(`${repo}/releases`)).map((release): Release => ({
        id: integer(release.id),
        tag: text(release.tag_name),
        name: text(release.name ?? ""),
        draft: boolean(release.draft),
        prerelease: boolean(release.prerelease),
        publishedAt: optionalText(release.published_at),
      }));
    },
    async tagCommit(tag) {
      let target = object(object((await transport.rest(`${repo}/git/ref/tags/${encodeTag(tag)}`)).data).object);
      // An annotated tag points to a tag object, which may itself point to another tag.
      for (let depth = 0; target.type === "tag"; depth++) {
        if (depth === 10) throw invalid(`Tag ${tag} nests too many annotated tags.`);
        target = object(object((await transport.rest(`${repo}/git/tags/${sha(target.sha)}`)).data).object);
      }
      if (target.type !== "commit") {
        throw new PlatformError("notFound", `Tag ${tag} points to a ${String(target.type)}, not a commit.`);
      }
      return text(target.sha);
    },
  };
}

const encodeTag = (tag: string) => tag.split("/").map(segment).join("/");

// One request path segment. A URL resolves "." and "..", even percent-encoded,
// against the path before it, which would send the request to another resource.
function segment(value: string): string {
  if (value === "." || value === "..") {
    throw new PlatformError("rejected", `GitHub's API cannot address "${value}" as a path segment.`);
  }
  return encodeURIComponent(value);
}

// Access

function access(transport: GitHubTransport, context: AdapterContext, repo: string): Access {
  return {
    capabilities: {},
    async viewer() {
      if (context.credentials.anonymous) return null;
      return restAccount((await transport.rest("/user")).data);
    },
    async role(login) {
      const response = await transport.rest(`${repo}/collaborators/${segment(login)}/permission`);
      const permission = object(response.data);
      return permission.permission === "none" ? null : text(permission.role_name);
    },
    async request(request) {
      const response = await transport.rest(request.path, {
        method: request.method ?? "GET",
        query: request.query,
        body: request.body,
        headers: request.headers,
      });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        data: response.data,
      };
    },
  };
}

// Reading GitHub's values; anything unexpected is an unreadable response.

function restAccount(value: unknown): Account | null {
  if (value === null || value === undefined) return null;
  const account = object(value);
  return { login: text(account.login), bot: account.type === "Bot" };
}

// GraphQL names a bot without the `[bot]` suffix REST uses; Postern reports the REST login.
function graphqlAccount(value: unknown): Account | null {
  if (value === null || value === undefined) return null;
  const account = object(value);
  const bot = account.__typename === "Bot";
  const login = text(account.login);
  return { login: bot && !login.endsWith("[bot]") ? `${login}[bot]` : login, bot };
}

function nodes(connection: unknown): Json[] {
  const list = (connection as { nodes?: unknown } | null)?.nodes;
  if (!Array.isArray(list)) throw invalid("GitHub returned a connection without nodes.");
  return list.map(object);
}

function issueState(value: unknown): "open" | "closed" {
  if (value === "OPEN") return "open";
  if (value === "CLOSED") return "closed";
  throw invalid(`GitHub returned an unknown issue state ${String(value)}.`);
}

function pullRequestState(value: unknown): "open" | "closed" | "merged" {
  if (value === "OPEN") return "open";
  if (value === "CLOSED") return "closed";
  if (value === "MERGED") return "merged";
  throw invalid(`GitHub returned an unknown pull request state ${String(value)}.`);
}

function object(value: unknown): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid("GitHub returned an unreadable object.");
  return value as Json;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw invalid("GitHub returned a missing or unreadable text field.");
  return value;
}

// A Git object ID GitHub returned, checked before it becomes part of a request path.
function sha(value: unknown): string {
  const id = text(value);
  if (!/^[0-9a-f]+$/i.test(id)) throw invalid("GitHub returned an unreadable object ID.");
  return id;
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value)) throw invalid("GitHub returned a missing or unreadable number.");
  return value as number;
}

// A GraphQL `BigInt`, which GitHub sends as a decimal string. Postern reports
// IDs as numbers, so one past `Number.MAX_SAFE_INTEGER` is unreadable, as it
// already is from REST, whose JSON numbers lose digits beyond that bound.
function bigInteger(value: unknown): number {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalid("GitHub returned a missing or unreadable number.");
  }
  return integer(Number(value));
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalid("GitHub returned a missing or unreadable flag.");
  return value;
}
