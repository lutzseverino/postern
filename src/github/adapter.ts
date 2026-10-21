// The GitHub adapter: the four ports over GitHub's REST and GraphQL APIs.
// Reads that need GraphQL-only facts use GraphQL, which GitHub serves only to
// authenticated callers; everything else uses REST, which also serves
// anonymous reads of public repositories. Every response is mapped inside the
// `read` the transport runs in that response's scope.

import type { AdapterContext, AdapterPorts } from "../connection.ts";
import { isGitHubRepositoryPath } from "../detect.ts";
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
import { GitHubTransport, connectionPage, invalid } from "./transport.ts";

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

const ignore = () => undefined;

function issueTracker(transport: GitHubTransport, repo: string, coordinates: Json): IssueTracker {
  // An issue with every page of its nested connections. A follow-up query
  // starts from the first page again and replaces what the issue held.
  const complete = async (value: unknown): Promise<Issue> => {
    const { issue, more } = mapIssue(object(value));
    const rest = <T>(key: keyof typeof issueConnectionQueries, read: (node: unknown) => T) =>
      transport.graphqlPages(
        issueConnectionQueries[key],
        { id: issue.nodeId },
        (data) => object(data.node).connection,
        read,
      );
    if (more.labels) issue.labels = await rest("labels", labelName);
    if (more.subIssues) issue.subIssues = await rest("subIssues", mapReference);
    if (more.blockedBy) issue.blockedBy = await rest("blockedBy", mapReference);
    return issue;
  };
  return {
    capabilities: { nativeParent: true, nativeBlockers: true, bodyEditTime: true, linkTime: true, botMarking: true },
    async issues(filter = {}) {
      return transport.graphqlPages(
        issuesQuery,
        {
          ...coordinates,
          states: [(filter.state ?? "open").toUpperCase()],
          labels: filter.label === undefined ? null : [filter.label],
        },
        (data) => (data.repository as Json | null)?.issues,
        complete,
      );
    },
    async issue(number) {
      return transport.graphql(issueQuery, { ...coordinates, number }, (data) => {
        const node = found(object(data.repository).issue, `Issue #${number} was not found.`);
        return complete(node);
      });
    },
    async labelChanges(number) {
      const changes = await transport.restPages(`${repo}/issues/${number}/events`, {}, (value): LabelChange | null => {
        const event = object(value);
        const kind = word(event.event);
        if (kind !== "labeled" && kind !== "unlabeled") return null;
        return {
          id: id(event.id),
          action: kind === "labeled" ? "added" : "removed",
          label: word(object(event.label).name),
          actor: restAccount(event.actor),
          time: time(event.created_at),
        };
      });
      return changes.filter((change) => change !== null);
    },
    async comments(number) {
      return transport.restPages(`${repo}/issues/${number}/comments`, {}, mapComment);
    },
    async addLabels(number, labels) {
      await transport.rest(`${repo}/issues/${number}/labels`, { method: "POST", body: { labels } }, ignore);
    },
    async removeLabel(number, label) {
      await transport.rest(`${repo}/issues/${number}/labels/${segment(label)}`, { method: "DELETE" }, ignore);
    },
    async createLabel(label) {
      return transport.rest(`${repo}/labels`, { method: "POST", body: label }, ({ data }) => mapLabel(data));
    },
    async createComment(number, body) {
      return transport.rest(`${repo}/issues/${number}/comments`, { method: "POST", body: { body } }, ({ data }) =>
        mapComment(data),
      );
    },
    async updateComment(id, body) {
      return transport.rest(`${repo}/issues/comments/${id}`, { method: "PATCH", body: { body } }, ({ data }) =>
        mapComment(data),
      );
    },
    async closeIssue(number) {
      // Pull requests share the issue number space and GitHub's Issues API,
      // which would close one. Its issue object marks a pull request with
      // `pull_request`, so the number is read before the write, as GitHub
      // offers no issue write conditional on what the number names.
      await transport.rest(`${repo}/issues/${number}`, {}, ({ data }) => {
        const pullRequest = object(data).pull_request;
        if (pullRequest === undefined || pullRequest === null) return;
        object(pullRequest);
        throw new PlatformError("notFound", `#${number} is a pull request, not an issue.`);
      });
      await transport.rest(`${repo}/issues/${number}`, { method: "PATCH", body: { state: "closed" } }, ignore);
    },
  };
}

// An issue with the first page of each nested connection, and which of them
// have more pages.
function mapIssue(node: Json): { issue: Issue; more: Record<keyof typeof issueConnectionQueries, boolean> } {
  const labels = connectionPage(node.labels);
  const subIssues = connectionPage(node.subIssues);
  const blockedBy = connectionPage(node.blockedBy);
  const linked = nodes(node.timelineItems).at(-1);
  const issue: Issue = {
    number: id(node.number),
    id: bigInteger(node.fullDatabaseId),
    nodeId: word(node.id),
    url: link(node.url),
    state: issueState(node.state),
    title: text(node.title),
    body: text(node.body),
    author: graphqlAccount(node.author),
    labels: labels.nodes.map(labelName),
    createdAt: time(node.createdAt),
    parent: nullable(node.parent, mapReference),
    subIssues: subIssues.nodes.map(mapReference),
    blockedBy: blockedBy.nodes.map(mapReference),
    bodyEditTime: nullable(node.lastEditedAt, time),
    linkTime: linked === undefined ? null : time(linked.createdAt),
  };
  const more = { labels: labels.after !== null, subIssues: subIssues.after !== null, blockedBy: blockedBy.after !== null };
  return { issue, more };
}

function mapReference(value: unknown): IssueReference {
  const node = object(value);
  return {
    repository: repositoryPath(object(node.repository).nameWithOwner),
    number: id(node.number),
    state: issueState(node.state),
  };
}

function mapComment(value: unknown): Comment {
  const comment = object(value);
  return {
    id: id(comment.id),
    nodeId: word(comment.node_id),
    url: link(comment.html_url),
    author: restAccount(comment.user),
    body: comment.body === null ? "" : text(comment.body),
    createdAt: time(comment.created_at),
    updatedAt: time(comment.updated_at),
  };
}

const labelName = (value: unknown) => word(object(value).name);

function mapLabel(value: unknown): Label {
  const label = object(value);
  const color = text(label.color);
  if (!/^[0-9a-fA-F]{6}$/.test(color)) throw invalid("GitHub returned an unreadable label color.");
  return { name: word(label.name), color, description: label.description === null ? "" : text(label.description) };
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
  const readPullRequest = <T>(query: string, number: number, read: (node: Json) => T) =>
    transport.graphql(query, { ...coordinates, number }, (data) =>
      read(found(object(data.repository).pullRequest, `Pull request #${number} was not found.`)),
    );
  return {
    capabilities: { closingReferences: true, reviewCommits: true },
    async byHeadBranch(branch) {
      return transport.graphqlPages(
        byHeadQuery,
        { ...coordinates, branch },
        (data) => object(data.repository).pullRequests,
        mapPullRequest,
      );
    },
    async closing(issueNumber) {
      return transport.graphqlPages(
        closingQuery,
        { ...coordinates, number: issueNumber },
        (data) => found(object(data.repository).issue, `Issue #${issueNumber} was not found.`).closedByPullRequestsReferences,
        mapPullRequest,
      );
    },
    async pullRequest(number) {
      return readPullRequest(pullRequestQuery, number, mapPullRequest);
    },
    async reviews(number) {
      return transport.restPages(`${repo}/pulls/${number}/reviews`, {}, (value): Review => {
        const review = object(value);
        const state = word(review.state);
        return {
          id: id(review.id),
          author: restAccount(review.user),
          state,
          body: review.body === null ? "" : text(review.body),
          commit: nullable(review.commit_id, sha),
          // A pending review is not yet submitted, and GitHub omits the field.
          submittedAt: state === "PENDING" && review.submitted_at === undefined ? null : nullable(review.submitted_at, time),
        };
      });
    },
    async reviewThreads(number) {
      return transport.graphqlPages(
        reviewThreadsQuery,
        { ...coordinates, number },
        (data) => found(object(data.repository).pullRequest, `Pull request #${number} was not found.`).reviewThreads,
        (value): ReviewThread => {
          const thread = object(value);
          const [first] = nodes(thread.comments);
          return {
            id: word(thread.id),
            resolved: boolean(thread.isResolved),
            outdated: boolean(thread.isOutdated),
            path: word(thread.path),
            author: first === undefined ? null : graphqlAccount(first.author),
          };
        },
      );
    },
    async checks(commit) {
      const ref = segment(commit);
      const [runs, statuses] = await Promise.all([
        transport.restPages(`${repo}/commits/${ref}/check-runs`, { items: "check_runs" }, (value): CheckResult => {
          const run = object(value);
          return {
            name: word(run.name),
            status: word(run.status),
            conclusion: nullable(run.conclusion, word),
            completedAt: nullable(run.completed_at, time),
          };
        }),
        transport.restPages(`${repo}/commits/${ref}/status`, { items: "statuses" }, (value): CheckResult => {
          const status = object(value);
          return { name: word(status.context), status: word(status.state), conclusion: null, completedAt: null };
        }),
      ]);
      return [...runs, ...statuses];
    },
    async mergesThroughQueue(number) {
      return readPullRequest(mergeQueueQuery, number, (node) => boolean(node.isMergeQueueEnabled));
    },
    async comment(number, body) {
      return transport.rest(`${repo}/issues/${number}/comments`, { method: "POST", body: { body } }, ({ data }) =>
        mapComment(data),
      );
    },
    async squashMerge(number, merge) {
      return transport.rest(
        `${repo}/pulls/${number}/merge`,
        {
          method: "PUT",
          body: { merge_method: "squash", sha: merge.expectedHead, commit_title: merge.title, commit_message: merge.body },
        },
        ({ data }) => {
          const result = object(data);
          // GitHub answers a merge it made with `merged: true`; anything else claims no merge.
          if (boolean(result.merged) !== true) throw invalid("GitHub answered the merge without merging.");
          return sha(result.sha);
        },
      );
    },
  };
}

function mapPullRequest(value: unknown): PullRequest {
  const node = object(value);
  return {
    repository: repositoryPath(object(node.repository).nameWithOwner),
    number: id(node.number),
    id: bigInteger(node.fullDatabaseId),
    nodeId: word(node.id),
    url: link(node.url),
    state: pullRequestState(node.state),
    title: text(node.title),
    body: text(node.body),
    author: graphqlAccount(node.author),
    createdAt: time(node.createdAt),
    headBranch: word(node.headRefName),
    headCommit: sha(node.headRefOid),
    baseBranch: word(node.baseRefName),
    crossRepository: boolean(node.isCrossRepository),
  };
}

// Releases

function releaseSource(transport: GitHubTransport, repo: string): ReleaseSource {
  return {
    capabilities: { drafts: true, prereleases: true },
    async releases() {
      return transport.restPages(`${repo}/releases`, {}, (value): Release => {
        const release = object(value);
        return {
          id: id(release.id),
          tag: word(release.tag_name),
          name: release.name === null ? "" : text(release.name),
          draft: boolean(release.draft),
          prerelease: boolean(release.prerelease),
          publishedAt: nullable(release.published_at, time),
        };
      });
    },
    async tagCommit(tag) {
      // An annotated tag points to a tag object, which may itself point to
      // another tag. Each tag object is followed once, so a chain that leads
      // back to one already followed fails instead of looping, and at most
      // `tagObjectLimit` are followed, so a chain that never ends cannot send
      // requests without end.
      const followed = new Set<string>();
      let path = `${repo}/git/ref/tags/${encodeTag(tag)}`;
      for (;;) {
        const next = await transport.rest(path, {}, ({ data }): { commit: string } | { tagObject: string } => {
          const target = object(object(data).object);
          const type = word(target.type);
          if (type === "commit") return { commit: sha(target.sha) };
          if (type !== "tag") throw new PlatformError("notFound", `Tag ${tag} points to a ${type}, not a commit.`);
          const tagObject = sha(target.sha);
          // Object IDs are hexadecimal, which GitHub may send in either case.
          const key = tagObject.toLowerCase();
          if (followed.has(key)) throw invalid(`Tag ${tag} leads back to a tag object it already passed.`);
          if (followed.size === tagObjectLimit) throw invalid(`Tag ${tag} passes more than ${tagObjectLimit} tag objects.`);
          followed.add(key);
          return { tagObject };
        });
        if ("commit" in next) return next.commit;
        path = `${repo}/git/tags/${next.tagObject}`;
      }
    },
  };
}

// Git sets no limit on how many annotated tags a chain passes before its
// commit, but a real chain is short, and every tag object is one request.
const tagObjectLimit = 1000;

const encodeTag = (tag: string) => tag.split("/").map(segment).join("/");

// One request path segment. A URL resolves "." and "..", even percent-encoded,
// against the path before it, which would send the request to another resource,
// and a value with an unpaired surrogate has no encoding at all.
function segment(value: string): string {
  if (value === "." || value === "..") {
    throw new PlatformError("rejected", `GitHub's API cannot address "${value}" as a path segment.`);
  }
  try {
    return encodeURIComponent(value);
  } catch {
    throw new PlatformError("rejected", "A request path segment holds text that cannot be encoded.");
  }
}

// Access

function access(transport: GitHubTransport, context: AdapterContext, repo: string): Access {
  return {
    capabilities: {},
    async viewer() {
      if (context.credentials.anonymous) return null;
      // An authenticated request always has an account; `null` here would read as anonymous.
      return transport.rest("/user", {}, ({ data }) => restAccount(object(data)));
    },
    async role(login) {
      return transport.rest(`${repo}/collaborators/${segment(login)}/permission`, {}, ({ data }) => {
        const permission = object(data);
        return word(permission.permission) === "none" ? null : word(permission.role_name);
      });
    },
    async request(request) {
      return transport.rest(
        request.path,
        { method: request.method ?? "GET", query: request.query, body: request.body, headers: request.headers },
        (response) => ({ status: response.status, headers: Object.fromEntries(response.headers), data: response.data }),
      );
    },
    async requestPages(request) {
      return transport.restPageResponses(request.path, request, (response) => ({
        status: response.status, headers: Object.fromEntries(response.headers), data: response.data,
      }));
    },
  };
}

// Reading GitHub's values; anything unexpected is an unreadable response.

// GitHub reports a deleted account as `null`.
function restAccount(value: unknown): Account | null {
  return nullable(value, (account) => {
    const fields = object(account);
    return { login: word(fields.login), bot: word(fields.type) === "Bot" };
  });
}

// GraphQL names a bot without the `[bot]` suffix REST uses; Postern reports the REST login.
function graphqlAccount(value: unknown): Account | null {
  return nullable(value, (account) => {
    const fields = object(account);
    const bot = word(fields.__typename) === "Bot";
    const login = word(fields.login);
    return { login: bot && !login.endsWith("[bot]") ? `${login}[bot]` : login, bot };
  });
}

// A resource a query looked up: `null` when GitHub found none. A missing field
// is an unreadable response, not an absent resource.
function found(value: unknown, message: string): Json {
  if (value === null) throw new PlatformError("notFound", message);
  return object(value);
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

// A name, login, identifier or platform word, which is never empty.
function word(value: unknown): string {
  const read = text(value);
  if (read === "") throw invalid("GitHub returned an empty name or identifier.");
  return read;
}

// A Git object ID, SHA-1 or SHA-256, checked before it becomes part of a request path.
function sha(value: unknown): string {
  const read = text(value);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(read)) throw invalid("GitHub returned an unreadable object ID.");
  return read;
}

// An ISO 8601 time with its offset, in the shape GitHub reports times.
const isoTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

// A time that exists: its date is on the calendar, and its time and offset
// within the day. A Date moves a day, hour, minute or second out of range into
// the next one, as `Date.parse` does with February 30, so a Date built from the
// components must give back the same components.
function time(value: unknown): string {
  const read = text(value);
  const match = isoTime.exec(read);
  if (!match) throw invalid("GitHub returned an unreadable time.");
  const parts = match.slice(1).map((part) => Number(part ?? 0));
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0, offsetHour = 0, offsetMinute = 0] = parts;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second);
  const kept = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ].every((component, index) => component === parts[index]);
  if (!kept || offsetHour > 23 || offsetMinute > 59) throw invalid("GitHub returned a time that does not exist.");
  return read;
}

// A web URL GitHub reports for a resource.
function link(value: unknown): string {
  const read = text(value);
  const protocol = URL.canParse(read) ? new URL(read).protocol : "";
  if (protocol !== "https:" && protocol !== "http:") throw invalid("GitHub returned an unreadable URL.");
  return read;
}

// A repository's owner and name.
function repositoryPath(value: unknown): string {
  const read = text(value);
  if (!isGitHubRepositoryPath(read)) throw invalid("GitHub returned an unreadable repository name.");
  return read;
}

// A field GitHub reports as `null` when it has no value; a missing field is unreadable.
function nullable<T>(value: unknown, read: (value: unknown) => T): T | null {
  return value === null ? null : read(value);
}

// An issue or pull request number, or a database ID: a positive integer.
function id(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw invalid("GitHub returned a missing or unreadable number.");
  return value as number;
}

// A GraphQL `BigInt`, which GitHub sends as a decimal string. Postern reports
// IDs as numbers, so one past `Number.MAX_SAFE_INTEGER` is unreadable, as it
// already is from REST, whose JSON numbers lose digits beyond that bound.
function bigInteger(value: unknown): number {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalid("GitHub returned a missing or unreadable number.");
  }
  return id(Number(value));
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalid("GitHub returned a missing or unreadable flag.");
  return value;
}
