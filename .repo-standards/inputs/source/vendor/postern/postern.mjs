/*! @lutzseverino/postern 1.2.0 | MIT License | https://github.com/lutzseverino/postern */

// src/errors.ts
var platformErrorReasons = Object.freeze([
  "unauthenticated",
  "forbidden",
  "notFound",
  "conflict",
  "rejected",
  "rateLimited",
  "unavailable",
  "invalidResponse",
  "unsupported"
]);
var PlatformError = class extends Error {
  name = "PlatformError";
  reason;
  retryAt;
  status;
  platformMessage;
  constructor(reason, message, options = {}) {
    const { retryAt, status, platformMessage, cause } = options;
    super(message, cause === void 0 ? void 0 : { cause });
    if (!platformErrorReasons.includes(reason)) {
      throw new TypeError(`Unknown platform error reason: ${String(reason)}`);
    }
    this.reason = reason;
    if (retryAt !== void 0) this.retryAt = retryAt;
    if (status !== void 0) this.status = status;
    if (platformMessage !== void 0) this.platformMessage = platformMessage;
  }
};

// src/detect.ts
var githubHost = "github.com";
var githubSshHosts = /* @__PURE__ */ new Set([githubHost, "ssh.github.com"]);
function isGitHubRepositoryPath(path) {
  const segments = path.split("/");
  return segments.length === 2 && segments.every((segment2) => /^[A-Za-z0-9_.-]+$/.test(segment2) && segment2 !== "." && segment2 !== "..");
}
function detectPlatform(remote) {
  const location = parseRemote(typeof remote === "string" ? remote.trim() : "");
  if (location) {
    const host = location.host.toLowerCase();
    const isGitHub = host === githubHost || location.ssh && githubSshHosts.has(host);
    const path = location.path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "");
    if (isGitHub && isGitHubRepositoryPath(path)) {
      return { platform: "github", host: githubHost, path };
    }
  }
  throw new PlatformError(
    "unsupported",
    `No platform adapter serves the remote ${describeRemote(location)}.`
  );
}
function parseRemote(remote) {
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(remote);
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(remote)) {
    return { host: scp[1], path: scp[2], ssh: true };
  }
  let url;
  try {
    url = new URL(remote);
  } catch {
    return null;
  }
  const protocol = url.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "ssh:" && protocol !== "git+ssh:") return null;
  if (url.search || url.hash) return null;
  if (protocol === "https:" && url.port && url.port !== "443") return null;
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  return { host: url.hostname, path, ssh: protocol !== "https:" };
}
function describeRemote(location) {
  return location ? `on host ${location.host}` : "in an unrecognized form";
}

// src/github/transport.ts
var apiOrigin = "https://api.github.com";
var apiVersion = "2022-11-28";
var userAgent = "@lutzseverino/postern";
var GitHubTransport = class {
  #context;
  constructor(context) {
    this.#context = context;
  }
  /** One REST request; a failing status rejects with its platform error. */
  async rest(path, options, read2) {
    const response = await this.#send(path, options);
    return scope(response, () => read2(response));
  }
  /** Every item across the pages of a REST list, following `Link: rel="next"`, each read in its page's scope. */
  async restPages(path, options, read2) {
    const pages = await this.restPageResponses(path, { query: { per_page: 100, ...options.query } }, (response) => {
      const page = options.items ? response.data?.[options.items] : response.data;
      if (!Array.isArray(page)) throw invalid(`GitHub returned no list for ${path}.`);
      return page.map((item) => read2(item));
    });
    return pages.flat();
  }
  /** Every REST page, following the same strict next-page reader as the ports' lists. */
  async restPageResponses(path, options, read2) {
    const results = [];
    const followed = /* @__PURE__ */ new Set();
    let target = path;
    let query = options.query;
    while (target) {
      const response = await this.#send(target, { ...options, query });
      query = void 0;
      followed.add(response.url.href);
      target = await scope(response, async () => {
        results.push(await read2(response));
        const next = nextPage(response.headers.get("link"));
        if (next && followed.has(next.href)) throw invalid("GitHub returned a next page it already served.");
        return next;
      });
    }
    return results;
  }
  /** One GraphQL query, its data read in the response's scope; GraphQL errors reject with their platform error. */
  async graphql(query, variables, read2) {
    const response = await this.#send("/graphql", { method: "POST", body: { query, variables } });
    return scope(response, () => {
      const result = response.data;
      if (!result || typeof result !== "object") throw invalid("GitHub returned no GraphQL result.");
      if (result.errors !== void 0 && !(Array.isArray(result.errors) && result.errors.every(isGraphqlError))) {
        throw invalid("GitHub returned unreadable GraphQL errors.");
      }
      if (result.errors && result.errors.length > 0) {
        throw graphqlError(result.errors, response.status, response.headers);
      }
      if (!result.data || typeof result.data !== "object") throw invalid("GitHub returned no GraphQL data.");
      return read2(result.data);
    });
  }
  /** Every node across the pages of a GraphQL connection, each read in its page's scope. */
  async graphqlPages(query, variables, connection, read2) {
    const results = [];
    const followed = /* @__PURE__ */ new Set();
    let after = null;
    do {
      after = await this.graphql(query, { ...variables, after }, async (data) => {
        const page = connectionPage(connection(data));
        for (const node of page.nodes) results.push(await read2(node));
        if (page.after !== null && followed.has(page.after)) throw invalid("GitHub returned a cursor it already followed.");
        return page.after;
      });
      if (after !== null) followed.add(after);
    } while (after !== null);
    return results;
  }
  // A failure here is the request's own, so an enclosing scope leaves it as it is.
  async #send(target, options) {
    try {
      return await this.#exchange(target, options);
    } catch (error) {
      if (error instanceof PlatformError) settled.add(error);
      throw error;
    }
  }
  async #exchange(target, options) {
    const url = typeof target === "string" ? apiUrl(target, options.query) : target;
    const token = await this.#context.credentials.token();
    const headers = {
      accept: "application/vnd.github+json",
      "user-agent": userAgent,
      "x-github-api-version": apiVersion
    };
    if (options.body !== void 0) headers["content-type"] = "application/json";
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      const key = name.toLowerCase();
      if (key !== "authorization") headers[key] = value;
    }
    if (token) headers.authorization = `Bearer ${token}`;
    const method = (options.method ?? "GET").toUpperCase();
    const request = `${method} ${url.pathname}`;
    const unreachable = (error, status2) => new PlatformError(
      "unavailable",
      timedOut(error) ? `GitHub did not answer ${request} within ${this.#context.timeoutMs} ms.` : `GitHub could not be reached for ${request}.`,
      { cause: error, ...status2 === void 0 ? {} : { status: status2 } }
    );
    let response;
    try {
      response = await this.#context.fetch(url, {
        method,
        headers,
        ...options.body === void 0 ? {} : { body: JSON.stringify(options.body) },
        signal: AbortSignal.timeout(this.#context.timeoutMs)
      });
    } catch (error) {
      throw unreachable(error);
    }
    let status;
    try {
      status = response.status;
    } catch (error) {
      throw invalid(`GitHub answered ${request} without a readable status.`, void 0, error);
    }
    if (typeof status !== "number" || !Number.isInteger(status) || status < 200 || status > 599) {
      throw invalid(`GitHub answered ${request} without a readable status.`);
    }
    let responseHeaders;
    try {
      responseHeaders = new Headers(response.headers);
    } catch (error) {
      throw invalid(`GitHub answered ${request} with unreadable headers.`, status, error);
    }
    let text2;
    try {
      text2 = await response.text();
    } catch (error) {
      throw unreachable(error, status);
    }
    if (typeof text2 !== "string") throw invalid(`GitHub answered ${request} with an unreadable body.`, status);
    const data = parseBody(text2, status);
    if (status >= 400) throw statusError(status, responseHeaders, data, request);
    if (data === void 0) throw invalid(`GitHub returned unreadable JSON for ${request}.`, status);
    return { url, status, headers: responseHeaders, data };
  }
};
var settled = /* @__PURE__ */ new WeakSet();
async function scope(response, read2) {
  try {
    return await read2();
  } catch (error) {
    let failure;
    if (!(error instanceof PlatformError)) {
      failure = invalid("GitHub returned a response the adapter could not read.", response.status, error);
    } else if (settled.has(error) || error.status !== void 0) {
      failure = error;
    } else {
      failure = new PlatformError(error.reason, error.message, {
        status: response.status,
        ...error.retryAt === void 0 ? {} : { retryAt: error.retryAt },
        ...error.platformMessage === void 0 ? {} : { platformMessage: error.platformMessage },
        ...error.cause === void 0 ? {} : { cause: error.cause }
      });
    }
    settled.add(failure);
    throw failure;
  }
}
function timedOut(error) {
  try {
    const name = error instanceof Error ? error.name : void 0;
    return name === "TimeoutError" || name === "AbortError";
  } catch {
    return false;
  }
}
function apiUrl(path, query) {
  const pairs = Object.entries(query ?? {}).map(([key, value]) => [key, String(value)]);
  if (![path, ...pairs.flat()].every((part) => part.isWellFormed())) {
    throw new PlatformError("rejected", "A request path or query holds text that cannot be encoded.");
  }
  const url = URL.canParse(path, apiOrigin) ? new URL(path, apiOrigin) : null;
  if (url?.origin !== apiOrigin) {
    throw new PlatformError("rejected", "A request path must stay on GitHub's API.");
  }
  if (url.pathname + url.search !== path || url.search !== "" && pairs.length > 0) {
    throw new PlatformError("rejected", "A request path must be sent as written.");
  }
  for (const [key, value] of pairs) url.searchParams.set(key, value);
  return url;
}
function pageAfter(hasNextPage, cursor) {
  if (hasNextPage === false) return null;
  if (hasNextPage !== true) throw invalid("GitHub returned a page that does not say whether another follows.");
  const next = cursor();
  if (next === void 0) throw invalid("GitHub returned a page without its cursor.");
  return next;
}
function connectionPage(value) {
  const page = value;
  if (!page || typeof page !== "object" || !Array.isArray(page.nodes)) throw invalid("GitHub returned an unreadable page.");
  const info = page.pageInfo;
  if (!info || typeof info !== "object") throw invalid("GitHub returned a page without its page information.");
  const after = pageAfter(
    info.hasNextPage,
    () => typeof info.endCursor === "string" && info.endCursor !== "" ? info.endCursor : void 0
  );
  return { nodes: page.nodes, after };
}
function nextPage(header) {
  const relations = header === null ? /* @__PURE__ */ new Map() : links(header);
  return pageAfter(relations?.has("next"), () => {
    const target = relations?.get("next");
    if (target === void 0 || !URL.canParse(target)) return void 0;
    const url = new URL(target);
    if (url.origin !== apiOrigin) throw invalid("GitHub returned a next page on another origin.");
    if (url.username !== "" || url.password !== "" || url.href.includes("#")) {
      throw invalid("GitHub returned a next page that cannot be requested as written.");
    }
    return url;
  });
}
var linkValue = /^\s*<([^>]*)>((?:\s*;\s*[\w!#$%&'*+.^`|~-]+\s*(?:=\s*(?:"[^"]*"|[^\s;,"]+))?)*)\s*$/;
var linkParameter = /;\s*([\w!#$%&'*+.^`|~-]+)\s*(?:=\s*(?:"([^"]*)"|([^\s;,"]+)))?/g;
function links(header) {
  const relations = /* @__PURE__ */ new Map();
  for (const element of splitLinks(header)) {
    if (element.trim() === "") continue;
    const match = linkValue.exec(element);
    if (!match) return void 0;
    const rels = [...match[2].matchAll(linkParameter)].filter(([, name]) => name.toLowerCase() === "rel");
    if (rels.length !== 1) return void 0;
    const names = (rels[0][2] ?? rels[0][3] ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    if (names.length === 0) return void 0;
    for (const name of names) {
      if (relations.has(name)) return void 0;
      relations.set(name, match[1]);
    }
  }
  return relations;
}
function splitLinks(header) {
  const elements = [];
  let current = "";
  let inside = null;
  for (const character of header) {
    if (inside === null && character === ",") {
      elements.push(current);
      current = "";
      continue;
    }
    if (inside === null && character === "<") inside = ">";
    else if (inside === null && character === '"') inside = '"';
    else if (character === inside) inside = null;
    current += character;
  }
  if (inside !== null) return ["<"];
  elements.push(current);
  return elements;
}
function parseBody(text2, status) {
  if (text2.trim() === "") return null;
  try {
    return JSON.parse(text2);
  } catch {
    return status >= 400 ? null : void 0;
  }
}
function statusError(status, headers, data, request) {
  const message = data?.message;
  const detail = typeof message === "string" && message ? `: ${message}` : "";
  const reason = statusReason(status, headers, typeof message === "string" ? message : "");
  return limitError(reason, `GitHub answered ${request} with ${status}${detail}`, status, headers, typeof message === "string" ? message : void 0);
}
function statusReason(status, headers, message) {
  switch (status) {
    case 401:
      return "unauthenticated";
    case 403:
      return rateLimited(headers, [message]) ? "rateLimited" : "forbidden";
    case 404:
    case 410:
    case 451:
      return "notFound";
    case 409:
    case 412:
      return "conflict";
    case 429:
      return "rateLimited";
    case 408:
    case 421:
    case 425:
      return "unavailable";
    default:
      return status >= 500 ? "unavailable" : "rejected";
  }
}
function rateLimited(headers, messages) {
  return headers.get("x-ratelimit-remaining") === "0" || headers.has("retry-after") || messages.some((message) => /rate limit/i.test(message));
}
function limitError(reason, message, status, headers, platformMessage) {
  const retryAt = reason === "rateLimited" ? retryTime(headers) : void 0;
  return new PlatformError(reason, message, {
    status,
    ...platformMessage === void 0 ? {} : { platformMessage },
    ...retryAt === void 0 ? {} : { retryAt }
  });
}
var latestTime = 864e13;
function retryTime(headers) {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter !== void 0) {
    const at = /^\d+$/.test(retryAfter) ? Date.now() + Number(retryAfter) * 1e3 : httpDate(retryAfter);
    if (readableTime(at)) return new Date(at).toISOString();
  }
  const reset = headers.get("x-ratelimit-reset");
  if (headers.get("x-ratelimit-remaining") === "0" && reset !== null && /^\d+$/.test(reset.trim())) {
    const at = Number(reset) * 1e3;
    if (readableTime(at)) return new Date(at).toISOString();
  }
  return void 0;
}
function httpDate(value) {
  const at = Date.parse(value);
  return readableTime(at) && new Date(at).toUTCString() === value ? at : Number.NaN;
}
function readableTime(at) {
  return Number.isFinite(at) && Math.abs(at) <= latestTime;
}
var graphqlReasons = {
  NOT_FOUND: "notFound",
  FORBIDDEN: "forbidden",
  INSUFFICIENT_SCOPES: "forbidden",
  RATE_LIMITED: "rateLimited",
  RATE_LIMIT: "rateLimited"
};
function isGraphqlError(value) {
  if (value === null || typeof value !== "object") return false;
  const { message, type } = value;
  return typeof message === "string" && (type === void 0 || typeof type === "string");
}
function graphqlError(errors, status, headers) {
  const [first] = errors;
  const messages = errors.map((error) => error.message);
  const reason = graphqlReasons[first.type ?? ""] ?? (rateLimited(headers, messages) ? "rateLimited" : "rejected");
  return limitError(reason, `GitHub's GraphQL API answered: ${first.message}`, status, headers, first.message);
}
function invalid(message, status, cause) {
  return new PlatformError("invalidResponse", message, {
    ...status === void 0 ? {} : { status },
    ...cause === void 0 ? {} : { cause }
  });
}

// src/github/adapter.ts
function githubAdapter(context) {
  const transport = new GitHubTransport(context);
  const [owner, name] = context.repository.path.split("/");
  const repo = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const coordinates = { owner, name };
  return {
    issueTracker: issueTracker(transport, repo, coordinates, context.repository.path),
    pullRequests: pullRequests(transport, repo, coordinates),
    releaseSource: releaseSource(transport, repo),
    access: access(transport, context, repo)
  };
}
var referenceFields = "number state repository { nameWithOwner }";
var issueFields = `
  number fullDatabaseId id url state title body createdAt lastEditedAt
  author { __typename login }
  labels(first: 100) { nodes { name } pageInfo { hasNextPage endCursor } }
  parent { ${referenceFields} }
  subIssues(first: 100) { nodes { ${referenceFields} } pageInfo { hasNextPage endCursor } }
  blockedBy(first: 100) { nodes { ${referenceFields} } pageInfo { hasNextPage endCursor } }
  timelineItems(itemTypes: [SUB_ISSUE_ADDED_EVENT], last: 1) { nodes { ... on SubIssueAddedEvent { createdAt } } }`;
var issuesQuery = `query PosternIssues($owner: String!, $name: String!, $states: [IssueState!], $labels: [String!], $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 50, after: $after, states: $states, labels: $labels, orderBy: { field: CREATED_AT, direction: ASC }) {
      nodes { ${issueFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
var issueQuery = `query PosternIssue($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $number) { ${issueFields} } }
}`;
var issueConnectionQueries = {
  labels: `query PosternIssueLabels($id: ID!, $after: String) {
  node(id: $id) { ... on Issue { connection: labels(first: 100, after: $after) { nodes { name } pageInfo { hasNextPage endCursor } } } }
}`,
  subIssues: `query PosternSubIssues($id: ID!, $after: String) {
  node(id: $id) { ... on Issue { connection: subIssues(first: 100, after: $after) { nodes { ${referenceFields} } pageInfo { hasNextPage endCursor } } } }
}`,
  blockedBy: `query PosternBlockedBy($id: ID!, $after: String) {
  node(id: $id) { ... on Issue { connection: blockedBy(first: 100, after: $after) { nodes { ${referenceFields} } pageInfo { hasNextPage endCursor } } } }
}`
};
var issueActions = {
  opened: "opened",
  reopened: "reopened",
  closed: "closed",
  edited: "edited",
  labeled: "labeled",
  unlabeled: "unlabeled"
};
var commentActions = {
  created: "commentCreated",
  edited: "commentEdited",
  deleted: "commentDeleted"
};
var ignore = () => void 0;
function issueTracker(transport, repo, coordinates, repository) {
  const complete = async (value) => {
    const { issue, more } = mapIssue(object(value));
    const rest = (key, read2) => transport.graphqlPages(
      issueConnectionQueries[key],
      { id: issue.nodeId },
      (data) => object(data.node).connection,
      read2
    );
    if (more.labels) issue.labels = await rest("labels", labelName);
    if (more.subIssues) issue.subIssues = await rest("subIssues", mapReference);
    if (more.blockedBy) issue.blockedBy = await rest("blockedBy", mapReference);
    return issue;
  };
  return {
    capabilities: { nativeParent: true, nativeBlockers: true, bodyEditTime: true, linkTime: true, botMarking: true },
    async issueEvent(event) {
      if (event.name !== "issues" && event.name !== "issue_comment") return null;
      const payload = object(event.payload);
      const source = repositoryPath(object(payload.repository).full_name);
      if (source.toLowerCase() !== repository.toLowerCase()) {
        throw new PlatformError("rejected", "The event belongs to another repository.");
      }
      const action = word(payload.action);
      const actions = event.name === "issues" ? issueActions : commentActions;
      if (!Object.hasOwn(actions, action)) return null;
      const issue = object(payload.issue);
      if (issue.pull_request !== void 0 && issue.pull_request !== null) {
        object(issue.pull_request);
        return null;
      }
      const kind = actions[action];
      const result = {
        platform: "github",
        repository,
        issue: id(issue.number),
        kind,
        actor: eventActor(payload.sender),
        label: null,
        openingLabels: null,
        bodyChanged: null,
        comment: null
      };
      if (kind === "opened") {
        if (!Array.isArray(issue.labels)) throw invalid("GitHub returned unreadable opening labels.");
        result.openingLabels = issue.labels.map(labelName);
      }
      if (kind === "labeled" || kind === "unlabeled") result.label = labelName(payload.label);
      if (kind === "edited") {
        const changes = object(payload.changes);
        result.bodyChanged = Object.hasOwn(changes, "body");
        if (result.bodyChanged) nullable(object(changes.body).from, text);
      }
      if (event.name === "issue_comment") {
        const comment = object(payload.comment);
        result.comment = {
          id: id(comment.id),
          nodeId: Object.hasOwn(comment, "node_id") ? word(comment.node_id) : null,
          body: text(comment.body)
        };
      }
      return result;
    },
    async issues(filter = {}) {
      return transport.graphqlPages(
        issuesQuery,
        {
          ...coordinates,
          states: [(filter.state ?? "open").toUpperCase()],
          labels: filter.label === void 0 ? null : [filter.label]
        },
        (data) => data.repository?.issues,
        complete
      );
    },
    async issue(number) {
      return transport.graphql(issueQuery, { ...coordinates, number }, (data) => {
        const node = found(object(data.repository).issue, `Issue #${number} was not found.`);
        return complete(node);
      });
    },
    async labelChanges(number) {
      const changes = await transport.restPages(`${repo}/issues/${number}/events`, {}, (value) => {
        const event = object(value);
        const kind = word(event.event);
        if (kind !== "labeled" && kind !== "unlabeled") return null;
        return {
          id: id(event.id),
          action: kind === "labeled" ? "added" : "removed",
          label: word(object(event.label).name),
          actor: restAccount(event.actor),
          time: time(event.created_at)
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
    async labels() {
      return transport.restPages(`${repo}/labels`, {}, mapLabel);
    },
    async updateLabel(name, label) {
      return transport.rest(
        `${repo}/labels/${segment(name)}`,
        { method: "PATCH", body: { new_name: label.name, color: label.color, description: label.description } },
        ({ data }) => mapLabel(data)
      );
    },
    async createComment(number, body) {
      return transport.rest(
        `${repo}/issues/${number}/comments`,
        { method: "POST", body: { body } },
        ({ data }) => mapComment(data)
      );
    },
    async updateComment(id2, body) {
      return transport.rest(
        `${repo}/issues/comments/${id2}`,
        { method: "PATCH", body: { body } },
        ({ data }) => mapComment(data)
      );
    },
    async closeIssue(number) {
      await transport.rest(`${repo}/issues/${number}`, {}, ({ data }) => {
        const pullRequest = object(data).pull_request;
        if (pullRequest === void 0 || pullRequest === null) return;
        object(pullRequest);
        throw new PlatformError("notFound", `#${number} is a pull request, not an issue.`);
      });
      await transport.rest(`${repo}/issues/${number}`, { method: "PATCH", body: { state: "closed" } }, ignore);
    }
  };
}
function eventActor(value) {
  const sender = object(value);
  const type = word(sender.type);
  if (type !== "User" && type !== "Bot" && type !== "App" && type !== "Organization") {
    throw invalid("GitHub returned an unreadable sender type.");
  }
  return { login: word(sender.login), bot: type === "Bot" || type === "App" };
}
function mapIssue(node) {
  const labels = connectionPage(node.labels);
  const subIssues = connectionPage(node.subIssues);
  const blockedBy = connectionPage(node.blockedBy);
  const linked = nodes(node.timelineItems).at(-1);
  const issue = {
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
    linkTime: linked === void 0 ? null : time(linked.createdAt)
  };
  const more = { labels: labels.after !== null, subIssues: subIssues.after !== null, blockedBy: blockedBy.after !== null };
  return { issue, more };
}
function mapReference(value) {
  const node = object(value);
  return {
    repository: repositoryPath(object(node.repository).nameWithOwner),
    number: id(node.number),
    state: issueState(node.state)
  };
}
function mapComment(value) {
  const comment = object(value);
  return {
    id: id(comment.id),
    nodeId: word(comment.node_id),
    url: link(comment.html_url),
    author: restAccount(comment.user),
    body: comment.body === null ? "" : text(comment.body),
    createdAt: time(comment.created_at),
    updatedAt: time(comment.updated_at)
  };
}
var labelName = (value) => word(object(value).name);
function mapLabel(value) {
  const label = object(value);
  const color = text(label.color);
  if (!/^[0-9a-fA-F]{6}$/.test(color)) throw invalid("GitHub returned an unreadable label color.");
  return { name: word(label.name), color, description: label.description === null ? "" : text(label.description) };
}
var pullRequestFields = `
  number fullDatabaseId id url state title body createdAt
  author { __typename login }
  headRefName headRefOid baseRefName isCrossRepository
  repository { nameWithOwner }`;
var byHeadQuery = `query PosternPullRequestsByHead($owner: String!, $name: String!, $branch: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $after, headRefName: $branch, orderBy: { field: CREATED_AT, direction: ASC }) {
      nodes { ${pullRequestFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
var closingQuery = `query PosternClosingPullRequests($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      closedByPullRequestsReferences(first: 100, after: $after, includeClosedPrs: true) {
        nodes { ${pullRequestFields} }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;
var pullRequestQuery = `query PosternPullRequest($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { ${pullRequestFields} } }
}`;
var reviewThreadsQuery = `query PosternReviewThreads($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        nodes { id isResolved isOutdated path comments(first: 1) { nodes { author { __typename login } } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;
var mergeQueueQuery = `query PosternMergeQueue($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { isMergeQueueEnabled } }
}`;
function pullRequests(transport, repo, coordinates) {
  const readPullRequest = (query, number, read2) => transport.graphql(
    query,
    { ...coordinates, number },
    (data) => read2(found(object(data.repository).pullRequest, `Pull request #${number} was not found.`))
  );
  return {
    capabilities: { closingReferences: true, reviewCommits: true },
    async byHeadBranch(branch) {
      return transport.graphqlPages(
        byHeadQuery,
        { ...coordinates, branch },
        (data) => object(data.repository).pullRequests,
        mapPullRequest
      );
    },
    async closing(issueNumber) {
      return transport.graphqlPages(
        closingQuery,
        { ...coordinates, number: issueNumber },
        (data) => found(object(data.repository).issue, `Issue #${issueNumber} was not found.`).closedByPullRequestsReferences,
        mapPullRequest
      );
    },
    async pullRequest(number) {
      return readPullRequest(pullRequestQuery, number, mapPullRequest);
    },
    async reviews(number) {
      return transport.restPages(`${repo}/pulls/${number}/reviews`, {}, (value) => {
        const review = object(value);
        const state = word(review.state);
        return {
          id: id(review.id),
          author: restAccount(review.user),
          state,
          body: review.body === null ? "" : text(review.body),
          commit: nullable(review.commit_id, sha),
          // A pending review is not yet submitted, and GitHub omits the field.
          submittedAt: state === "PENDING" && review.submitted_at === void 0 ? null : nullable(review.submitted_at, time)
        };
      });
    },
    async reviewThreads(number) {
      return transport.graphqlPages(
        reviewThreadsQuery,
        { ...coordinates, number },
        (data) => found(object(data.repository).pullRequest, `Pull request #${number} was not found.`).reviewThreads,
        (value) => {
          const thread = object(value);
          const [first] = nodes(thread.comments);
          return {
            id: word(thread.id),
            resolved: boolean(thread.isResolved),
            outdated: boolean(thread.isOutdated),
            path: word(thread.path),
            author: first === void 0 ? null : graphqlAccount(first.author)
          };
        }
      );
    },
    async checks(commit) {
      const ref = segment(commit);
      const [runs, statuses] = await Promise.all([
        transport.restPages(`${repo}/commits/${ref}/check-runs`, { items: "check_runs" }, (value) => {
          const run = object(value);
          return {
            name: word(run.name),
            status: word(run.status),
            conclusion: nullable(run.conclusion, word),
            completedAt: nullable(run.completed_at, time)
          };
        }),
        transport.restPages(`${repo}/commits/${ref}/status`, { items: "statuses" }, (value) => {
          const status = object(value);
          return { name: word(status.context), status: word(status.state), conclusion: null, completedAt: null };
        })
      ]);
      return [...runs, ...statuses];
    },
    async mergesThroughQueue(number) {
      return readPullRequest(mergeQueueQuery, number, (node) => boolean(node.isMergeQueueEnabled));
    },
    async comment(number, body) {
      return transport.rest(
        `${repo}/issues/${number}/comments`,
        { method: "POST", body: { body } },
        ({ data }) => mapComment(data)
      );
    },
    async squashMerge(number, merge) {
      return transport.rest(
        `${repo}/pulls/${number}/merge`,
        {
          method: "PUT",
          body: { merge_method: "squash", sha: merge.expectedHead, commit_title: merge.title, commit_message: merge.body }
        },
        ({ data }) => {
          const result = object(data);
          if (boolean(result.merged) !== true) throw invalid("GitHub answered the merge without merging.");
          return sha(result.sha);
        }
      );
    }
  };
}
function mapPullRequest(value) {
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
    crossRepository: boolean(node.isCrossRepository)
  };
}
function releaseSource(transport, repo) {
  return {
    capabilities: { drafts: true, prereleases: true },
    async releases() {
      return transport.restPages(`${repo}/releases`, {}, (value) => {
        const release = object(value);
        return {
          id: id(release.id),
          tag: word(release.tag_name),
          name: release.name === null ? "" : text(release.name),
          draft: boolean(release.draft),
          prerelease: boolean(release.prerelease),
          publishedAt: nullable(release.published_at, time)
        };
      });
    },
    async tagCommit(tag) {
      const followed = /* @__PURE__ */ new Set();
      let path = `${repo}/git/ref/tags/${encodeTag(tag)}`;
      for (; ; ) {
        const next = await transport.rest(path, {}, ({ data }) => {
          const target = object(object(data).object);
          const type = word(target.type);
          if (type === "commit") return { commit: sha(target.sha) };
          if (type !== "tag") throw new PlatformError("notFound", `Tag ${tag} points to a ${type}, not a commit.`);
          const tagObject = sha(target.sha);
          const key = tagObject.toLowerCase();
          if (followed.has(key)) throw invalid(`Tag ${tag} leads back to a tag object it already passed.`);
          if (followed.size === tagObjectLimit) throw invalid(`Tag ${tag} passes more than ${tagObjectLimit} tag objects.`);
          followed.add(key);
          return { tagObject };
        });
        if ("commit" in next) return next.commit;
        path = `${repo}/git/tags/${next.tagObject}`;
      }
    }
  };
}
var tagObjectLimit = 1e3;
var encodeTag = (tag) => tag.split("/").map(segment).join("/");
function segment(value) {
  if (value === "." || value === "..") {
    throw new PlatformError("rejected", `GitHub's API cannot address "${value}" as a path segment.`);
  }
  try {
    return encodeURIComponent(value);
  } catch {
    throw new PlatformError("rejected", "A request path segment holds text that cannot be encoded.");
  }
}
function access(transport, context, repo) {
  return {
    capabilities: {},
    async viewer() {
      if (context.credentials.anonymous) return null;
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
        transportResponse
      );
    },
    async requestPages(request) {
      return transport.restPageResponses(request.path, request, transportResponse);
    }
  };
}
function transportResponse({ status, headers, data }) {
  return { status, headers: Object.fromEntries(headers), data };
}
function restAccount(value) {
  return nullable(value, (account) => {
    const fields2 = object(account);
    return { login: word(fields2.login), bot: word(fields2.type) === "Bot" };
  });
}
function graphqlAccount(value) {
  return nullable(value, (account) => {
    const fields2 = object(account);
    const bot = word(fields2.__typename) === "Bot";
    const login = word(fields2.login);
    return { login: bot && !login.endsWith("[bot]") ? `${login}[bot]` : login, bot };
  });
}
function found(value, message) {
  if (value === null) throw new PlatformError("notFound", message);
  return object(value);
}
function nodes(connection) {
  const list = connection?.nodes;
  if (!Array.isArray(list)) throw invalid("GitHub returned a connection without nodes.");
  return list.map(object);
}
function issueState(value) {
  if (value === "OPEN") return "open";
  if (value === "CLOSED") return "closed";
  throw invalid(`GitHub returned an unknown issue state ${String(value)}.`);
}
function pullRequestState(value) {
  if (value === "OPEN") return "open";
  if (value === "CLOSED") return "closed";
  if (value === "MERGED") return "merged";
  throw invalid(`GitHub returned an unknown pull request state ${String(value)}.`);
}
function object(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid("GitHub returned an unreadable object.");
  return value;
}
function text(value) {
  if (typeof value !== "string") throw invalid("GitHub returned a missing or unreadable text field.");
  return value;
}
function word(value) {
  const read2 = text(value);
  if (read2 === "") throw invalid("GitHub returned an empty name or identifier.");
  return read2;
}
function sha(value) {
  const read2 = text(value);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(read2)) throw invalid("GitHub returned an unreadable object ID.");
  return read2;
}
var isoTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;
function time(value) {
  const read2 = text(value);
  const match = isoTime.exec(read2);
  if (!match) throw invalid("GitHub returned an unreadable time.");
  const parts = match.slice(1).map((part) => Number(part ?? 0));
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0, offsetHour = 0, offsetMinute = 0] = parts;
  const date = /* @__PURE__ */ new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second);
  const kept = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  ].every((component, index) => component === parts[index]);
  if (!kept || offsetHour > 23 || offsetMinute > 59) throw invalid("GitHub returned a time that does not exist.");
  return read2;
}
function link(value) {
  const read2 = text(value);
  const protocol = URL.canParse(read2) ? new URL(read2).protocol : "";
  if (protocol !== "https:" && protocol !== "http:") throw invalid("GitHub returned an unreadable URL.");
  return read2;
}
function repositoryPath(value) {
  const read2 = text(value);
  if (!isGitHubRepositoryPath(read2)) throw invalid("GitHub returned an unreadable repository name.");
  return read2;
}
function nullable(value, read2) {
  return value === null ? null : read2(value);
}
function id(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw invalid("GitHub returned a missing or unreadable number.");
  return value;
}
function bigInteger(value) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalid("GitHub returned a missing or unreadable number.");
  }
  return id(Number(value));
}
function boolean(value) {
  if (typeof value !== "boolean") throw invalid("GitHub returned a missing or unreadable flag.");
  return value;
}

// src/ports.ts
var capabilityFlags = Object.freeze({
  issueTracker: Object.freeze(["nativeParent", "nativeBlockers", "bodyEditTime", "linkTime", "botMarking"]),
  pullRequests: Object.freeze(["closingReferences", "reviewCommits"]),
  releaseSource: Object.freeze(["drafts", "prereleases"]),
  access: Object.freeze([])
});

// src/secrets.ts
var replacement = "<REDACTED>";
var Secrets = class {
  #values = /* @__PURE__ */ new Set();
  add(value) {
    if (value) this.#values.add(value);
  }
  // Finds every occurrence of every credential in the original text and
  // replaces overlapping ones as one span, so no fragment of a credential that
  // extends, contains or overlaps another survives.
  redactText(text2) {
    const spans = [];
    for (const value of this.#values) {
      for (let at = text2.indexOf(value); at !== -1; at = text2.indexOf(value, at + 1)) {
        spans.push([at, at + value.length]);
      }
    }
    spans.sort((a, b) => a[0] - b[0]);
    let result = "";
    let cursor = 0;
    for (const [start, end] of spans) {
      if (start < cursor) {
        cursor = Math.max(cursor, end);
        continue;
      }
      result += text2.slice(cursor, start) + replacement;
      cursor = end;
    }
    return result + text2.slice(cursor);
  }
  /** A copy of a JSON-like value with every credential replaced. */
  redact(value) {
    if (this.#values.size === 0) return value;
    return this.#redactValue(value);
  }
  #redactValue(value) {
    if (typeof value === "string") return this.redactText(value);
    if (Array.isArray(value)) return value.map((item) => this.#redactValue(item));
    if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [this.redactText(key), this.#redactValue(item)])
      );
    }
    return value;
  }
  /** The error as a `PlatformError` whose message, cause and fields hold no credential. */
  sanitize(error) {
    if (isPlatformError(error)) {
      return new PlatformError(error.reason, this.redactText(error.message), {
        ...error.retryAt === void 0 ? {} : { retryAt: error.retryAt },
        ...error.status === void 0 ? {} : { status: error.status },
        ...error.platformMessage === void 0 ? {} : { platformMessage: this.redactText(error.platformMessage) },
        ...error.cause === void 0 ? {} : { cause: this.#sanitizeCause(error.cause) }
      });
    }
    return new PlatformError("invalidResponse", "The platform adapter could not read a response.", {
      cause: this.#sanitizeCause(error)
    });
  }
  // A foreign cause, such as what a `fetch` threw, is read once, and one that
  // cannot be read is described without any of it.
  #sanitizeCause(cause) {
    if (isPlatformError(cause)) return this.sanitize(cause);
    let message;
    let name;
    try {
      const error = cause instanceof Error;
      message = String(error ? cause.message : cause);
      name = error ? String(cause.name) : void 0;
    } catch {
      return new Error("An error that could not be read.");
    }
    const sanitized = new Error(this.redactText(message));
    if (name !== void 0) sanitized.name = this.redactText(name);
    return sanitized;
  }
};
function isPlatformError(value) {
  try {
    return value instanceof PlatformError;
  } catch {
    return false;
  }
}
function credentialsFrom(source, secrets) {
  if (source === void 0) return { anonymous: true, token: async () => null };
  if (typeof source === "string") {
    secrets.add(source);
    return { anonymous: false, token: async () => source };
  }
  return {
    anonymous: false,
    async token() {
      let token;
      try {
        token = await source();
      } catch {
        throw new PlatformError("unauthenticated", "The credential source failed to supply a token.");
      }
      if (typeof token !== "string" || token === "") {
        throw new PlatformError("unauthenticated", "The credential source supplied no token.");
      }
      if (!isSendableToken(token)) {
        throw new PlatformError("rejected", "The credential source supplied a token that cannot be sent in a request header.");
      }
      secrets.add(token);
      return token;
    }
  };
}
function isSendableToken(token) {
  if (!token.isWellFormed() || /^[ \t]|[ \t]$/.test(token)) return false;
  const value = `Bearer ${token}`;
  try {
    return new Headers({ authorization: value }).get("authorization") === value;
  } catch {
    return false;
  }
}

// src/snapshot.ts
function fields(value, names, message) {
  if (value === null || typeof value !== "object") reject(message);
  const copy = /* @__PURE__ */ Object.create(null);
  for (const name of names) copy[name] = read(() => value[name]);
  return copy;
}
function items(value, message, reason = "rejected") {
  if (!read(() => Array.isArray(value))) reject(message, reason);
  const array = value;
  const length = read(() => array.length);
  if (!Number.isSafeInteger(length)) reject(message, reason);
  const keys = read(() => Reflect.ownKeys(array));
  if (keys.length !== length + 1) reject(message, reason);
  for (const key of keys) {
    if (key !== "length" && !(typeof key === "string" && isIndex(key, length))) reject(message, reason);
  }
  return Array.from({ length }, (_, index) => read(() => array[index]));
}
function isIndex(key, length) {
  return /^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) < length;
}
function entries(value, message, reason = "rejected") {
  if (!read(() => isPlainObject(value))) reject(message, reason);
  const object2 = value;
  const result = [];
  for (const key of read(() => Reflect.ownKeys(object2))) {
    if (!read(() => Reflect.getOwnPropertyDescriptor(object2, key))?.enumerable) continue;
    if (typeof key === "symbol") reject(message, reason);
    result.push([key, read(() => object2[key])]);
  }
  return result;
}
function shape(value) {
  return read(() => {
    if (Array.isArray(value)) return Object.getPrototypeOf(value) === Array.prototype ? "array" : null;
    return isPlainObject(value) ? "object" : null;
  });
}
function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function read(operation) {
  try {
    return operation();
  } catch {
    throw new PlatformError("rejected", "A value passed in could not be read.");
  }
}
function reject(message, reason = "rejected") {
  throw new PlatformError(reason, message);
}
function payloadCopy(value, copies = /* @__PURE__ */ new Map(), ancestors = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new PlatformError("invalidResponse", "An event payload has a cycle.");
  if (copies.has(value)) return copies.get(value);
  const kind = shape(value);
  if (kind === null) throw new PlatformError("invalidResponse", "An event payload holds an unreadable object.");
  ancestors.add(value);
  try {
    const copy = kind === "array" ? items(value, "An event payload holds an unreadable array.", "invalidResponse").map((item) => payloadCopy(item, copies, ancestors)) : Object.fromEntries(entries(value, "An event payload holds an unreadable object.", "invalidResponse").map(([key, item]) => [key, payloadCopy(item, copies, ancestors)]));
    copies.set(value, copy);
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

// src/connection.ts
var adapters = {
  github: githubAdapter
};
var identityChecks = {
  github(host, path) {
    if (host.toLowerCase() !== githubHost) {
      throw new PlatformError("unsupported", "No platform adapter serves GitHub repositories on this host.");
    }
    checkOption(isGitHubRepositoryPath(path), "A GitHub repository path is exactly an owner and a name, such as owner/name.");
    return { platform: "github", host: githubHost, path };
  }
};
var defaultTimeoutMs = 3e4;
var maxTimeoutMs = 2 ** 31 - 1;
var transportMethods = /* @__PURE__ */ new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
var transportHeaders = /* @__PURE__ */ new Set(["connection", "content-length", "expect", "host", "keep-alive", "transfer-encoding", "upgrade"]);
var headerValue = /^(?:[\x21-\x7e\x80-\xff](?:[\t\x20-\x7e\x80-\xff]*[\x21-\x7e\x80-\xff])?)?$/;
function connect(repository, options = {}) {
  const identity = typeof repository === "string" ? detectPlatform(repository) : checkIdentity(repository);
  const adapter = adapters[identity.platform];
  return createConnection(identity, adapter, options);
}
function createConnection(repository, adapter, options) {
  const checked = checkOptions(options);
  const secrets = new Secrets();
  const context = {
    repository: { ...repository },
    credentials: credentialsFrom(checked.credential, secrets),
    relationshipSections: checked.relationshipSections ?? null,
    fetch: checked.fetch ?? globalThis.fetch,
    timeoutMs: checked.timeoutMs ?? defaultTimeoutMs
  };
  const ports = adapter(context);
  const issueCapabilities = offered(ports.issueTracker.capabilities, capabilityFlags.issueTracker);
  const marked = issueCapabilities.botMarking === true;
  const layer = {
    guard: (operation) => shielded(secrets, operation),
    account: (value) => value && !marked ? { ...value, bot: null } : value
  };
  return Object.freeze({
    repository: Object.freeze({ ...repository }),
    issueTracker: guardIssueTracker(ports.issueTracker, issueCapabilities, context, layer),
    pullRequests: guardPullRequests(ports.pullRequests, layer),
    releaseSource: guardReleaseSource(ports.releaseSource, layer),
    access: guardAccess(ports.access, layer)
  });
}
function offered(capabilities, names) {
  const flags = {};
  if (capabilities !== null && typeof capabilities === "object") {
    for (const name of names) {
      if (capabilities[name] === true) flags[name] = true;
    }
  }
  return Object.freeze(flags);
}
async function shielded(secrets, operation) {
  try {
    return secrets.redact(await operation());
  } catch (error) {
    throw secrets.sanitize(error);
  }
}
function guardIssueTracker(port, capabilities, context, { guard, account }) {
  const sections = context.relationshipSections !== null;
  const issueFacts = (issue) => ({
    ...issue,
    author: account(issue.author),
    parent: capabilities.nativeParent || sections ? issue.parent : null,
    subIssues: capabilities.nativeParent || sections ? issue.subIssues : [],
    blockedBy: capabilities.nativeBlockers || sections ? issue.blockedBy : [],
    bodyEditTime: capabilities.bodyEditTime ? issue.bodyEditTime : null,
    linkTime: capabilities.linkTime ? issue.linkTime : null
  });
  return Object.freeze({
    capabilities,
    issueEvent: (event) => guard(async () => {
      const { name, payload } = fields(event, ["name", "payload"], "An event needs a name and a plain-object payload.");
      if (typeof name !== "string" || shape(payload) !== "object") {
        reject2("An event needs a string name and a plain-object payload.");
      }
      const result = await port.issueEvent({ name, payload: payloadCopy(payload) });
      return result === null ? null : { ...result, actor: account(result.actor) };
    }),
    issues: (filter = {}) => guard(async () => (await port.issues(checkIssueFilter(filter))).map(issueFacts)),
    issue: (number) => guard(async () => {
      checkNumber(number, "issue number");
      return issueFacts(await port.issue(number));
    }),
    labelChanges: (number) => guard(async () => {
      checkNumber(number, "issue number");
      return (await port.labelChanges(number)).map((change) => ({ ...change, actor: account(change.actor) }));
    }),
    comments: (number) => guard(async () => {
      checkNumber(number, "issue number");
      return (await port.comments(number)).map((comment) => ({ ...comment, author: account(comment.author) }));
    }),
    addLabels: (number, labels) => guard(async () => {
      checkNumber(number, "issue number");
      const names = items(labels, "Name at least one label to add.");
      if (names.length === 0) reject2("Name at least one label to add.");
      for (const name of names) checkText(name, "label");
      await port.addLabels(number, names);
    }),
    removeLabel: (number, label) => guard(async () => {
      checkNumber(number, "issue number");
      checkText(label, "label");
      await port.removeLabel(number, label);
    }),
    labels: () => guard(() => port.labels()),
    createLabel: (label) => guard(async () => port.createLabel(checkLabel(label))),
    updateLabel: (name, label) => guard(async () => {
      checkText(name, "label name");
      return port.updateLabel(name, checkLabel(label));
    }),
    createComment: (number, body) => guard(async () => {
      checkNumber(number, "issue number");
      checkText(body, "comment body");
      const comment = await port.createComment(number, body);
      return { ...comment, author: account(comment.author) };
    }),
    updateComment: (id2, body) => guard(async () => {
      checkNumber(id2, "comment ID");
      checkText(body, "comment body");
      const comment = await port.updateComment(id2, body);
      return { ...comment, author: account(comment.author) };
    }),
    closeIssue: (number) => guard(async () => {
      checkNumber(number, "issue number");
      await port.closeIssue(number);
    })
  });
}
function guardPullRequests(port, { guard, account }) {
  const capabilities = offered(port.capabilities, capabilityFlags.pullRequests);
  const pullFacts = (pull) => ({ ...pull, author: account(pull.author) });
  return Object.freeze({
    capabilities,
    byHeadBranch: (branch) => guard(async () => {
      checkText(branch, "head branch");
      return (await port.byHeadBranch(branch)).map(pullFacts);
    }),
    closing: (issueNumber) => guard(async () => {
      checkNumber(issueNumber, "issue number");
      if (!capabilities.closingReferences) unsupported("closingReferences");
      return (await port.closing(issueNumber)).map(pullFacts);
    }),
    pullRequest: (number) => guard(async () => {
      checkNumber(number, "pull request number");
      return pullFacts(await port.pullRequest(number));
    }),
    reviews: (number) => guard(async () => {
      checkNumber(number, "pull request number");
      return (await port.reviews(number)).map((review) => ({
        ...review,
        author: account(review.author),
        commit: capabilities.reviewCommits ? review.commit : null
      }));
    }),
    reviewThreads: (number) => guard(async () => {
      checkNumber(number, "pull request number");
      return (await port.reviewThreads(number)).map((thread) => ({ ...thread, author: account(thread.author) }));
    }),
    checks: (commit) => guard(async () => {
      checkText(commit, "commit");
      return port.checks(commit);
    }),
    mergesThroughQueue: (number) => guard(async () => {
      checkNumber(number, "pull request number");
      return port.mergesThroughQueue(number);
    }),
    comment: (number, body) => guard(async () => {
      checkNumber(number, "pull request number");
      checkText(body, "comment body");
      const comment = await port.comment(number, body);
      return { ...comment, author: account(comment.author) };
    }),
    squashMerge: (number, merge) => guard(async () => {
      checkNumber(number, "pull request number");
      const { expectedHead, title, body } = fields(
        merge,
        ["expectedHead", "title", "body"],
        "A squash merge needs its expected head, title and body."
      );
      checkText(expectedHead, "expected head commit");
      checkText(title, "merge title");
      if (!isText(body)) reject2("A merge body is a string.");
      return port.squashMerge(number, { expectedHead, title, body });
    })
  });
}
function guardReleaseSource(port, { guard }) {
  const capabilities = offered(port.capabilities, capabilityFlags.releaseSource);
  return Object.freeze({
    capabilities,
    releases: () => guard(
      async () => (await port.releases()).map((release) => ({
        ...release,
        draft: capabilities.drafts ? release.draft : null,
        prerelease: capabilities.prereleases ? release.prerelease : null
      }))
    ),
    tagCommit: (tag) => guard(async () => {
      checkText(tag, "tag");
      return port.tagCommit(tag);
    })
  });
}
function guardAccess(port, { guard, account }) {
  return Object.freeze({
    capabilities: offered(port.capabilities, capabilityFlags.access),
    viewer: () => guard(async () => account(await port.viewer())),
    role: (login) => guard(async () => {
      checkText(login, "login");
      return port.role(login);
    }),
    request: (request) => guard(async () => port.request(checkTransportRequest(request))),
    requestPages: (request) => guard(async () => {
      const checked = checkTransportRequest(request);
      if (checked.method !== "GET") reject2("A paginated request uses GET.");
      return port.requestPages(checked);
    })
  });
}
function checkIdentity(identity) {
  if (identity === null || typeof identity !== "object") {
    throw new PlatformError("unsupported", "No platform adapter serves this repository identity.");
  }
  const { platform, host, path } = fields(identity, ["platform", "host", "path"], "A repository identity is an object.");
  if (typeof platform !== "string" || !Object.hasOwn(identityChecks, platform)) {
    throw new PlatformError("unsupported", "No platform adapter serves this repository identity.");
  }
  checkOption(typeof host === "string" && host !== "", "A repository identity needs its host.");
  checkOption(
    typeof path === "string" && /^[^/\s]+(\/[^/\s]+)+$/.test(path),
    "A repository identity needs its full path, such as owner/name."
  );
  return identityChecks[platform](host, path);
}
function checkOptions(options) {
  const { credential, relationshipSections, fetch, timeoutMs } = fields(
    options,
    ["credential", "relationshipSections", "fetch", "timeoutMs"],
    "Connection options are an object."
  );
  checkOption(
    credential === void 0 || typeof credential === "string" && credential !== "" || typeof credential === "function",
    "A credential is a non-empty token or a function returning one."
  );
  if (typeof credential === "string" && !isSendableToken(credential)) {
    reject2("A credential holds text that cannot be sent in a request header.");
  }
  let sections;
  if (relationshipSections !== void 0) {
    const { parent, blockedBy } = fields(
      relationshipSections,
      ["parent", "blockedBy"],
      "relationshipSections needs non-empty parent and blockedBy section names."
    );
    checkOption(
      isName(parent) && isName(blockedBy),
      "relationshipSections needs non-empty parent and blockedBy section names."
    );
    sections = { parent, blockedBy };
  }
  checkOption(fetch === void 0 || typeof fetch === "function", "fetch is a function.");
  checkOption(
    timeoutMs === void 0 || typeof timeoutMs === "number" && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= maxTimeoutMs,
    `timeoutMs is a whole number of milliseconds from 1 to ${maxTimeoutMs}.`
  );
  return {
    ...credential === void 0 ? {} : { credential },
    ...sections === void 0 ? {} : { relationshipSections: sections },
    ...fetch === void 0 ? {} : { fetch },
    ...timeoutMs === void 0 ? {} : { timeoutMs }
  };
}
var isName = (value) => typeof value === "string" && value.trim() !== "";
function checkOption(condition, message) {
  if (!condition) reject2(message);
}
function checkTransportRequest(request) {
  const { path, method = "GET", query, body, headers } = fields(
    request,
    ["path", "method", "query", "body", "headers"],
    "A request needs a path."
  );
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    reject2("A request path starts with a single '/' and stays on the platform's API.");
  }
  if (!isText(path)) reject2(unencodable);
  if (!isExactPath(path)) reject2(inexactPath);
  if (query !== void 0 && path.includes("?")) reject2("A request gives its query either in its path or as query, not both.");
  const verb = typeof method === "string" ? method.toUpperCase() : "";
  if (!transportMethods.has(verb)) reject2(`A request method is one of ${[...transportMethods].join(", ")}.`);
  let queryCopy;
  if (query !== void 0) {
    const pairs = entries(query, "A request query is a plain object.");
    for (const [key, value] of pairs) {
      const scalar = typeof value === "string" || typeof value === "boolean" || Number.isFinite(value);
      if (!scalar) reject2("A request query value is a string, a finite number or a boolean.");
      if (!isText(key) || typeof value === "string" && !isText(value)) reject2(unencodable);
    }
    queryCopy = Object.fromEntries(pairs);
  }
  let headersCopy;
  if (headers !== void 0) {
    const pairs = entries(headers, "Request headers are a plain object.");
    const names = /* @__PURE__ */ new Set();
    for (const [key, value] of pairs) {
      if (typeof value !== "string") reject2("A request header value is a string.");
      if (!isText(key) || !isText(value)) reject2(unencodable);
      const name = key.toLowerCase();
      if (names.has(name)) reject2("A request names each header once, in any case.");
      names.add(name);
      if (name === "authorization") reject2("A request is sent with the connection's credential, never its own.");
      if (transportHeaders.has(name)) reject2(`A request leaves the ${name} header to the transport.`);
      if (!headerValue.test(value)) reject2("A request header value is sent as written, with no outer whitespace or control character.");
    }
    try {
      new Headers(pairs);
    } catch {
      reject2("A request header has an invalid name or value.");
    }
    headersCopy = Object.fromEntries(pairs);
  }
  let bodyCopy;
  if (body !== void 0) {
    if (verb === "GET" || verb === "HEAD") reject2(`A ${verb} request has no body.`);
    bodyCopy = jsonCopy(body, /* @__PURE__ */ new Set());
  }
  return {
    path,
    method: verb,
    ...queryCopy === void 0 ? {} : { query: queryCopy },
    ...body === void 0 ? {} : { body: bodyCopy },
    ...headersCopy === void 0 ? {} : { headers: headersCopy }
  };
}
var inexactPath = "A request path is sent as written: it holds no fragment, backslash, whitespace, control or non-ASCII character, dot segment or empty query.";
function isExactPath(path) {
  const origin = "https://platform.invalid";
  if (!URL.canParse(path, origin)) return false;
  const url = new URL(path, origin);
  return url.origin === origin && url.pathname + url.search === path;
}
var jsonRule = "A request body holds only plain objects, arrays, strings, finite numbers other than -0, booleans and null.";
var unencodable = "A request holds text with an unpaired surrogate, which has no UTF-8 encoding.";
function jsonCopy(value, ancestors) {
  if (typeof value === "string" && !isText(value)) reject2(unencodable);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) reject2(jsonRule);
    return value;
  }
  if (typeof value !== "object") reject2(jsonRule);
  if (ancestors.has(value)) reject2("A request body has no cycles.");
  ancestors.add(value);
  try {
    const kind = shape(value);
    if (kind === "array") return items(value, jsonRule).map((item) => jsonCopy(item, ancestors));
    if (kind === "object") {
      return Object.fromEntries(
        entries(value, jsonRule).map(([key, item]) => [isText(key) ? key : reject2(unencodable), jsonCopy(item, ancestors)])
      );
    }
    reject2(jsonRule);
  } finally {
    ancestors.delete(value);
  }
}
function checkIssueFilter(filter) {
  const { state, label } = fields(filter, ["state", "label"], "An issue filter is an object.");
  if (state !== void 0 && state !== "open" && state !== "closed") {
    reject2("An issue filter's state is open or closed.");
  }
  if (label !== void 0) checkText(label, "label");
  return { ...state === void 0 ? {} : { state }, ...label === void 0 ? {} : { label } };
}
function checkLabel(label) {
  const { name, color, description } = fields(
    label,
    ["name", "color", "description"],
    "A label needs a name, color and description."
  );
  checkText(name, "label name");
  if (typeof color !== "string" || !/^[0-9a-fA-F]{6}$/.test(color)) {
    reject2("A label color is six hexadecimal digits without '#'.");
  }
  if (!isText(description)) reject2("A label description is a string.");
  return { name, color, description };
}
function checkNumber(value, what) {
  if (!Number.isSafeInteger(value) || value < 1) reject2(`The ${what} is a positive integer.`);
}
function checkText(value, what) {
  if (typeof value !== "string" || value === "") reject2(`The ${what} is a non-empty string.`);
  if (!isText(value)) reject2(`The ${what} holds an unpaired surrogate, which has no UTF-8 encoding.`);
}
function isText(value) {
  return typeof value === "string" && value.isWellFormed();
}
function reject2(message) {
  throw new PlatformError("rejected", message);
}
function unsupported(flag) {
  throw new PlatformError("unsupported", `This platform does not offer ${flag}.`);
}
export {
  PlatformError,
  capabilityFlags,
  connect,
  detectPlatform,
  platformErrorReasons
};
