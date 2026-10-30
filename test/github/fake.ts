// A local fake of the GitHub REST and GraphQL APIs, reached through an
// injected `fetch`. It holds GitHub-shaped state for any number of
// repositories, serves the operations the adapter uses with GitHub's
// pagination and authentication behavior, and can fail the next request.

type Json = Record<string, unknown>;

export interface FakeUser {
  login: string;
  type: "User" | "Bot";
}

export interface FakeIssue {
  repository: string;
  number: number;
  databaseId: number;
  nodeId: string;
  state: "OPEN" | "CLOSED";
  title: string;
  body: string;
  author: FakeUser | null;
  labels: string[];
  createdAt: string;
  lastEditedAt: string | null;
  /** The parent's key, `owner/name#number`. */
  parent: string | null;
  blockedBy: string[];
  /** Recorded additions, independent of current relationships. */
  subIssueLinkAdditions: Json[];
  events: Json[];
}

export interface FakePullRequest {
  repository: string;
  number: number;
  databaseId: number;
  nodeId: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  title: string;
  body: string;
  author: FakeUser | null;
  createdAt: string;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  isCrossRepository: boolean;
  /** Keys of the issues it closes. */
  closes: string[];
  reviews: Json[];
  threads: Json[];
  isMergeQueueEnabled: boolean;
  merge: { title: string; message: string; sha: string } | null;
  /** A pull request shares an issue's labels and label events. */
  labels: string[];
  events: Json[];
}

export type Injected =
  | { status: number; headers?: Record<string, string>; body: string }
  | { network: true }
  | { hang: true };

/** A change to the response the fake would send. */
export interface Malformed {
  status: number;
  headers?: Record<string, string>;
  body(json: unknown): unknown;
}

export interface FakeRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

const origin = "https://api.github.com";

export class GitHubFake {
  readonly issues = new Map<string, FakeIssue>();
  readonly pullRequests = new Map<string, FakePullRequest>();
  readonly comments = new Map<number, Json & { key: string }>();
  readonly labels = new Map<string, Map<string, Json>>();
  readonly checks = new Map<string, { runs: Json[]; statuses: Json[] }>();
  readonly releases: Json[] = [];
  readonly tagRefs = new Map<string, { type: string; sha: string }>();
  readonly tagObjects = new Map<string, { type: string; sha: string }>();
  readonly collaborators = new Map<
    string,
    { permission: string; role_name: string }
  >();
  readonly users = new Map<string, FakeUser>();
  /** Tokens the fake accepts, with the account each authenticates. */
  readonly tokens = new Map<string, FakeUser>();
  readonly requests: FakeRequest[] = [];
  /** Responses served by the contract suite's authenticated transport fixture. */
  readonly transportPages: {
    status: number;
    data: unknown;
    headers: Record<string, string>;
  }[] = [];
  /** The largest page the fake serves, whatever size a request asks for. */
  maxPageSize = 100;
  readonly #injected: Injected[] = [];
  readonly #malformations: (Malformed | null)[] = [];
  readonly #numbers = new Map<string, number>();
  // Past the 32-bit range, as GitHub's newer IDs are.
  #ids = 2 ** 32;

  readonly repository: string;

  constructor(repository: string) {
    this.repository = repository;
  }

  nextId(): number {
    return ++this.#ids;
  }

  nextNumber(repository: string): number {
    const number = (this.#numbers.get(repository) ?? 0) + 1;
    this.#numbers.set(repository, number);
    return number;
  }

  /** Answers the next request with this response instead. */
  inject(response: Injected): void {
    this.#injected.push(response);
  }

  /** Answers the next request, or the one after `skip` others, with its own response, changed this way. */
  malformNext(change: Malformed, skip = 0): void {
    for (let skipped = 0; skipped < skip; skipped++)
      this.#malformations.push(null);
    this.#malformations.push(change);
  }

  readonly fetch = async (
    input: string | URL | Request,
    init: RequestInit = {},
  ): Promise<Response> => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const headers = new Headers(init.headers);
    const method = (init.method ?? "GET").toUpperCase();
    const body =
      typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    this.requests.push({ method, url, headers, body });
    const injected = this.#injected.shift();
    if (injected)
      return this.#injectedResponse(injected, init.signal ?? undefined);
    if (url.origin !== origin)
      throw new TypeError(`fetch failed: the fake serves only ${origin}`);
    const authorization = headers.get("authorization");
    let viewer: FakeUser | null = null;
    if (authorization !== null) {
      viewer = this.tokens.get(authorization.replace(/^Bearer /, "")) ?? null;
      if (!viewer) return json(401, { message: "Bad credentials" });
    }
    let response: Response;
    try {
      response = this.#route(method, url, body, viewer);
    } catch (error) {
      if (!(error instanceof Response)) throw error;
      response = error;
    }
    const change = this.#malformations.shift();
    if (!change) return response;
    return new Response(JSON.stringify(change.body(await response.json())), {
      status: change.status,
      headers: { ...Object.fromEntries(response.headers), ...change.headers },
    });
  };

  async #injectedResponse(
    injected: Injected,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    if ("network" in injected) throw new TypeError("fetch failed");
    if ("hang" in injected) {
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    }
    return new Response(injected.body, {
      status: injected.status,
      headers: injected.headers ?? {},
    });
  }

  #route(
    method: string,
    url: URL,
    body: unknown,
    viewer: FakeUser | null,
  ): Response {
    if (url.pathname === "/contract-pages" && method === "GET") {
      if (!viewer) return json(401, { message: "Requires authentication" });
      const page = this.transportPages[Number(url.searchParams.get("page"))];
      return page ? json(page.status, page.data, page.headers) : notFound();
    }
    if (url.pathname === "/graphql" && method === "POST") {
      if (!viewer)
        return json(401, {
          message: "This endpoint requires you to be authenticated.",
        });
      return this.#graphql(body as { query: string; variables: Json });
    }
    if (method !== "GET" && !viewer)
      return json(401, { message: "Requires authentication" });
    if (url.pathname === "/user" && method === "GET") {
      if (!viewer) return json(401, { message: "Requires authentication" });
      return json(200, user(viewer));
    }
    const match = /^\/repos\/([^/]+)\/([^/]+)(\/.*)$/.exec(url.pathname);
    if (!match) return notFound();
    const repository = `${decodeURIComponent(match[1]!)}/${decodeURIComponent(match[2]!)}`;
    if (repository !== this.repository) return notFound();
    const path = match[3]!;
    let parts: RegExpExecArray | null;
    const route = (pattern: RegExp, verb: string) =>
      method === verb && (parts = pattern.exec(path)) !== null;
    const arg = (index: number) => decodeURIComponent(parts![index]!);

    if (route(/^\/issues\/(\d+)\/events$/, "GET")) {
      return this.#page(
        url,
        this.#issueOrPull(repository, Number(arg(1))).events,
      );
    }
    if (route(/^\/issues\/(\d+)\/comments$/, "GET")) {
      const key = this.#issueOrPullKey(repository, Number(arg(1)));
      return this.#page(
        url,
        [...this.comments.values()]
          .filter((comment) => comment.key === key)
          .map(publicComment),
      );
    }
    if (route(/^\/issues\/(\d+)\/comments$/, "POST")) {
      const key = this.#issueOrPullKey(repository, Number(arg(1)));
      const text = (body as Json).body;
      if (typeof text !== "string" || text === "")
        return json(422, { message: "Validation Failed" });
      return json(
        201,
        publicComment(
          this.addComment(key, viewer!, text, "2026-05-01T00:00:00Z"),
        ),
      );
    }
    if (route(/^\/issues\/comments\/(\d+)$/, "PATCH")) {
      const comment = this.comments.get(Number(arg(1)));
      if (!comment) return notFound();
      comment.body = (body as Json).body;
      comment.updated_at = "2026-05-02T00:00:00Z";
      return json(200, publicComment(comment));
    }
    if (route(/^\/issues\/(\d+)\/labels$/, "POST")) {
      const issue = this.#issueOrPull(repository, Number(arg(1)));
      for (const label of (body as { labels: string[] }).labels) {
        if (!issue.labels.includes(label)) issue.labels.push(label);
      }
      return json(
        200,
        issue.labels.map((name) => ({ name })),
      );
    }
    if (route(/^\/issues\/(\d+)\/labels\/(.+)$/, "DELETE")) {
      const issue = this.#issueOrPull(repository, Number(arg(1)));
      const index = issue.labels.indexOf(arg(2));
      if (index === -1) return json(404, { message: "Label does not exist" });
      issue.labels.splice(index, 1);
      return json(
        200,
        issue.labels.map((name) => ({ name })),
      );
    }
    if (route(/^\/labels$/, "POST")) {
      const label = body as Json;
      const labels = this.labels.get(repository) ?? new Map<string, Json>();
      this.labels.set(repository, labels);
      if (labels.has(String(label.name)))
        return json(422, { message: "Validation Failed" });
      const created = {
        id: this.nextId(),
        name: label.name,
        color: label.color,
        description: label.description,
        default: false,
      };
      labels.set(String(label.name), created);
      return json(201, created);
    }
    if (route(/^\/labels$/, "GET")) {
      return this.#page(url, [
        ...(this.labels.get(repository)?.values() ?? []),
      ]);
    }
    if (route(/^\/labels\/(.+)$/, "PATCH")) {
      const labels = this.labels.get(repository);
      const selected = arg(1);
      const label = labels?.get(selected);
      if (!labels || !label) return notFound();
      const desired = body as Json;
      const name = String(desired.new_name);
      if (name !== selected && labels.has(name))
        return json(422, { message: "Validation Failed" });
      const updated = {
        ...label,
        name,
        color: desired.color,
        description: desired.description,
      };
      labels.delete(selected);
      labels.set(name, updated);
      return json(200, updated);
    }
    // GitHub's Issues API serves pull requests too, and closes one it is asked to.
    if (route(/^\/issues\/(\d+)$/, "GET")) {
      return json(
        200,
        restIssue(this.#issueOrPull(repository, Number(arg(1)))),
      );
    }
    if (route(/^\/issues\/(\d+)$/, "PATCH")) {
      const issue = this.#issueOrPull(repository, Number(arg(1)));
      if ((body as Json).state === "closed" && issue.state === "OPEN")
        issue.state = "CLOSED";
      return json(200, restIssue(issue));
    }
    if (route(/^\/pulls\/(\d+)\/reviews$/, "GET")) {
      return this.#page(url, this.#pull(repository, Number(arg(1))).reviews);
    }
    if (route(/^\/pulls\/(\d+)\/merge$/, "PUT")) {
      const pull = this.#pull(repository, Number(arg(1)));
      const request = body as Json;
      if (pull.state !== "OPEN")
        return json(405, { message: "Pull Request is not mergeable" });
      if (request.sha !== pull.headRefOid) {
        return json(409, {
          message: "Head branch was modified. Review and try the merge again.",
        });
      }
      const sha = this.nextId().toString(16).padStart(40, "0");
      pull.merge = {
        title: String(request.commit_title),
        message: String(request.commit_message),
        sha,
      };
      pull.state = "MERGED";
      return json(200, {
        sha,
        merged: true,
        message: "Pull Request successfully merged",
      });
    }
    if (route(/^\/commits\/([^/]+)\/check-runs$/, "GET")) {
      const runs = this.checks.get(arg(1))?.runs ?? [];
      return this.#page(url, runs, (items) => ({
        total_count: runs.length,
        check_runs: items,
      }));
    }
    if (route(/^\/commits\/([^/]+)\/status$/, "GET")) {
      const statuses = this.checks.get(arg(1))?.statuses ?? [];
      return this.#page(url, statuses, (items) => ({
        state: "pending",
        total_count: statuses.length,
        statuses: items,
      }));
    }
    if (route(/^\/releases$/, "GET")) {
      // Drafts are listed only to accounts that can push.
      return this.#page(
        url,
        this.releases.filter((release) => viewer || !release.draft),
      );
    }
    if (route(/^\/git\/ref\/tags\/(.+)$/, "GET")) {
      const target = this.tagRefs.get(arg(1));
      if (!target) return notFound();
      return json(200, { ref: `refs/tags/${arg(1)}`, object: target });
    }
    if (route(/^\/git\/tags\/([0-9a-f]+)$/, "GET")) {
      const target = this.tagObjects.get(arg(1));
      if (!target) return notFound();
      return json(200, { sha: arg(1), object: target });
    }
    if (route(/^\/collaborators\/([^/]+)\/permission$/, "GET")) {
      if (!viewer) return json(401, { message: "Requires authentication" });
      const login = arg(1);
      if (!this.users.has(login))
        return json(404, { message: `${login} is not a user` });
      const permission = this.collaborators.get(login) ?? {
        permission: "read",
        role_name: "read",
      };
      return json(200, { ...permission, user: user(this.users.get(login)!) });
    }
    return notFound();
  }

  #page(
    url: URL,
    items: unknown[],
    wrap: (items: unknown[]) => unknown = (page) => page,
  ): Response {
    const size = Math.min(
      Number(url.searchParams.get("per_page") ?? 30),
      this.maxPageSize,
    );
    const page = Number(url.searchParams.get("page") ?? 1);
    const slice = items.slice((page - 1) * size, page * size);
    const headers: Record<string, string> = {};
    if (page * size < items.length) {
      const next = new URL(url);
      next.searchParams.set("page", String(page + 1));
      headers.link = `<${next}>; rel="next", <${next}>; rel="last"`;
    }
    return json(200, wrap(slice), headers);
  }

  #graphql({ query, variables }: { query: string; variables: Json }): Response {
    const operation = /query (\w+)/.exec(query)?.[1];
    const repository = `${variables.owner}/${variables.name}`;
    const known =
      variables.owner === undefined || repository === this.repository;
    if (!known) {
      return json(200, {
        data: { repository: null },
        errors: [
          {
            type: "NOT_FOUND",
            message: `Could not resolve to a Repository with the name '${repository}'.`,
          },
        ],
      });
    }
    const first = (requested: number) => Math.min(requested, this.maxPageSize);
    const connection = <T>(
      items: T[],
      size: number,
      after: unknown,
      map: (item: T) => unknown,
    ) => {
      const start = typeof after === "string" ? Number(after) : 0;
      const end = start + first(size);
      return {
        nodes: items.slice(start, end).map(map),
        pageInfo: { hasNextPage: end < items.length, endCursor: String(end) },
      };
    };
    const issueNode = (issue: FakeIssue) =>
      this.#issueNode(issue, (items, map) => connection(items, 100, null, map));
    const missing = (what: string, number: unknown) =>
      json(200, {
        data: { repository: { [what]: null } },
        errors: [
          {
            type: "NOT_FOUND",
            message: `Could not resolve to a ${what} with the number of ${number}.`,
          },
        ],
      });
    switch (operation) {
      case "PosternIssues": {
        const states = variables.states as string[];
        const labels = variables.labels as string[] | null;
        const issues = [...this.issues.values()].filter(
          (issue) =>
            issue.repository === this.repository &&
            states.includes(issue.state) &&
            (!labels || labels.every((label) => issue.labels.includes(label))),
        );
        return json(200, {
          data: {
            repository: {
              issues: connection(issues, 50, variables.after, issueNode),
            },
          },
        });
      }
      case "PosternSubIssueLinkAdditions": {
        const issue = this.issues.get(`${this.repository}#${variables.number}`);
        if (!issue) return missing("issue", variables.number);
        return json(200, {
          data: {
            repository: {
              issue: {
                timelineItems: connection(
                  issue.subIssueLinkAdditions,
                  100,
                  variables.after,
                  (event) => event,
                ),
              },
            },
          },
        });
      }
      case "PosternIssue": {
        const issue = this.issues.get(`${this.repository}#${variables.number}`);
        if (!issue) return missing("issue", variables.number);
        return json(200, { data: { repository: { issue: issueNode(issue) } } });
      }
      case "PosternIssueLabels":
      case "PosternSubIssues":
      case "PosternBlockedBy": {
        const issue = [...this.issues.values()].find(
          (candidate) => candidate.nodeId === variables.id,
        );
        if (!issue) return json(200, { data: { node: null } });
        const node = this.#issueNode(issue, (items, map) =>
          connection(items, 100, variables.after, map),
        );
        const key = {
          PosternIssueLabels: "labels",
          PosternSubIssues: "subIssues",
          PosternBlockedBy: "blockedBy",
        }[operation];
        return json(200, { data: { node: { connection: node[key] } } });
      }
      case "PosternPullRequestsByHead": {
        const pulls = [...this.pullRequests.values()].filter(
          (pull) =>
            pull.repository === this.repository &&
            pull.headRefName === variables.branch,
        );
        return json(200, {
          data: {
            repository: {
              pullRequests: connection(pulls, 100, variables.after, (pull) =>
                this.#pullNode(pull),
              ),
            },
          },
        });
      }
      case "PosternClosingPullRequests": {
        const key = `${this.repository}#${variables.number}`;
        if (!this.issues.has(key)) return missing("issue", variables.number);
        const pulls = [...this.pullRequests.values()].filter((pull) =>
          pull.closes.includes(key),
        );
        return json(200, {
          data: {
            repository: {
              issue: {
                closedByPullRequestsReferences: connection(
                  pulls,
                  100,
                  variables.after,
                  (pull) => this.#pullNode(pull),
                ),
              },
            },
          },
        });
      }
      case "PosternPullRequest":
      case "PosternMergeQueue":
      case "PosternReviewThreads": {
        const pull = this.pullRequests.get(
          `${this.repository}#${variables.number}`,
        );
        if (!pull) return missing("pullRequest", variables.number);
        const node =
          operation === "PosternPullRequest"
            ? this.#pullNode(pull)
            : operation === "PosternMergeQueue"
              ? { isMergeQueueEnabled: pull.isMergeQueueEnabled }
              : {
                  reviewThreads: connection(
                    pull.threads,
                    100,
                    variables.after,
                    (thread) => thread,
                  ),
                };
        return json(200, { data: { repository: { pullRequest: node } } });
      }
      default:
        return json(200, {
          errors: [{ message: `Unknown operation ${operation}` }],
        });
    }
  }

  #issueNode(
    issue: FakeIssue,
    page: <T>(items: T[], map: (item: T) => unknown) => unknown,
  ): Json {
    const reference = (key: string) => {
      const linked = this.issues.get(key);
      if (!linked) throw new Error(`The fake holds no issue ${key}`);
      return {
        number: linked.number,
        state: linked.state,
        repository: { nameWithOwner: linked.repository },
      };
    };
    const key = `${issue.repository}#${issue.number}`;
    const children = [...this.issues.values()].filter(
      (candidate) => candidate.parent === key,
    );
    return {
      number: issue.number,
      ...graphqlDatabaseIds(issue.databaseId),
      id: issue.nodeId,
      url: `https://github.com/${issue.repository}/issues/${issue.number}`,
      state: issue.state,
      title: issue.title,
      body: issue.body,
      createdAt: issue.createdAt,
      lastEditedAt: issue.lastEditedAt,
      author: graphqlUser(issue.author),
      labels: page(issue.labels, (name) => ({ name })),
      parent: issue.parent ? reference(issue.parent) : null,
      subIssues: page(children, (child) =>
        reference(`${child.repository}#${child.number}`),
      ),
      blockedBy: page(issue.blockedBy, reference),
      timelineItems: {
        nodes: issue.subIssueLinkAdditions
          .slice(-1)
          .map((event) => ({ createdAt: event.createdAt })),
      },
    };
  }

  #pullNode(pull: FakePullRequest): Json {
    return {
      number: pull.number,
      ...graphqlDatabaseIds(pull.databaseId),
      id: pull.nodeId,
      url: `https://github.com/${pull.repository}/pull/${pull.number}`,
      state: pull.state,
      title: pull.title,
      body: pull.body,
      createdAt: pull.createdAt,
      author: graphqlUser(pull.author),
      headRefName: pull.headRefName,
      headRefOid: pull.headRefOid,
      baseRefName: pull.baseRefName,
      isCrossRepository: pull.isCrossRepository,
      repository: { nameWithOwner: pull.repository },
    };
  }

  #pull(repository: string, number: number): FakePullRequest {
    const pull = this.pullRequests.get(`${repository}#${number}`);
    if (!pull) throw notFound();
    return pull;
  }

  #issueOrPull(
    repository: string,
    number: number,
  ): FakeIssue | FakePullRequest {
    const key = `${repository}#${number}`;
    const found = this.issues.get(key) ?? this.pullRequests.get(key);
    if (!found) throw notFound();
    return found;
  }

  #issueOrPullKey(repository: string, number: number): string {
    const key = `${repository}#${number}`;
    if (!this.issues.has(key) && !this.pullRequests.has(key)) throw notFound();
    return key;
  }

  addComment(
    key: string,
    author: FakeUser,
    body: string,
    createdAt: string,
    updatedAt = createdAt,
  ): Json & { key: string } {
    const id = this.nextId();
    const [repository, number] = key.split("#");
    const comment = {
      key,
      id,
      node_id: `IC_${id}`,
      html_url: `https://github.com/${repository}/issues/${number}#issuecomment-${id}`,
      user: user(author),
      body,
      created_at: createdAt,
      updated_at: updatedAt,
    };
    this.comments.set(id, comment);
    return comment;
  }
}

// The REST issue object, which marks a pull request with `pull_request`.
function restIssue(issue: FakeIssue | FakePullRequest): Json {
  const pull = "headRefOid" in issue;
  const kind = pull ? "pull" : "issues";
  return {
    number: issue.number,
    state: issue.state === "OPEN" ? "open" : "closed",
    title: issue.title,
    html_url: `https://github.com/${issue.repository}/${kind}/${issue.number}`,
    ...(pull
      ? {
          pull_request: {
            html_url: `https://github.com/${issue.repository}/pull/${issue.number}`,
          },
        }
      : {}),
  };
}

function publicComment({
  key: _key,
  ...comment
}: Json & { key: string }): Json {
  return comment;
}

export function user(account: FakeUser): Json {
  return { login: account.login, id: account.login.length, type: account.type };
}

// GraphQL's `databaseId` is a 32-bit `Int`, null for a larger ID;
// `fullDatabaseId` is a `BigInt`, which GitHub sends as a string.
function graphqlDatabaseIds(id: number): Json {
  return { databaseId: id < 2 ** 31 ? id : null, fullDatabaseId: String(id) };
}

function graphqlUser(account: FakeUser | null): Json | null {
  if (!account) return null;
  return account.type === "Bot"
    ? { __typename: "Bot", login: account.login.replace(/\[bot\]$/, "") }
    : { __typename: "User", login: account.login };
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function notFound(): Response {
  return json(404, { message: "Not Found" });
}
