// GitHub-specific behavior beyond the contract: how each GitHub response maps
// onto an error reason, and what the adapter sends.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlatformError, connect } from "../../src/index.ts";
import type {
  Comment,
  Connection,
  PlatformErrorReason,
  Release,
} from "../../src/index.ts";
import { githubAdapter } from "../../src/github/adapter.ts";
import type { ContractPlatform } from "../contract/harness.ts";
import { GitHubFake } from "./fake.ts";
import type { Injected } from "./fake.ts";
import { startGitHub } from "./harness.ts";
import { head, mona, reads } from "./reads.ts";
import type { Read } from "./reads.ts";

const path = "octo/hello";
const token = "ghp_adapterToken0123456789";

function setup(options: { timeoutMs?: number } = {}) {
  const fake = new GitHubFake(path);
  fake.tokens.set(token, { login: "octocat", type: "User" });
  const connection = connect(`git@github.com:${path}.git`, {
    credential: token,
    fetch: fake.fetch,
    ...options,
  });
  return { fake, connection };
}

const failure =
  (
    reason: PlatformErrorReason,
    check: (error: PlatformError) => void = () => {},
  ) =>
  (error: unknown) => {
    assert.ok(
      error instanceof PlatformError,
      `expected a PlatformError, got ${String(error)}`,
    );
    assert.equal(error.reason, reason);
    check(error);
    return true;
  };

describe("GitHub response mapping", () => {
  it("reports the first GraphQL error's platformMessage with credentials removed", async () => {
    const { fake, connection } = setup();
    fake.inject({
      status: 200,
      body: JSON.stringify({
        errors: [
          { type: "NOT_FOUND", message: `Could not resolve ${token}` },
          { type: "FORBIDDEN", message: "A different failure" },
        ],
      }),
    });
    await assert.rejects(
      connection.issueTracker.issue(1),
      failure("notFound", (error) => {
        assert.equal(error.status, 200);
        assert.equal(error.platformMessage, "Could not resolve <REDACTED>");
        assert.equal(
          error.message,
          "GitHub's GraphQL API answered: Could not resolve <REDACTED>",
        );
      }),
    );
  });

  it("retains an explicitly empty platform message", async () => {
    const { fake, connection } = setup();
    fake.inject({ status: 404, body: '{"message":""}' });
    await assert.rejects(
      connection.access.request({ path: "/user" }),
      failure("notFound", (error) => {
        assert.equal(error.platformMessage, "");
        assert.equal(error.message, "GitHub answered GET /user with 404");
      }),
    );
  });

  const resetEpoch = 1_900_000_000;
  const resetAt = new Date(resetEpoch * 1000).toISOString();
  const cases: [
    string,
    Injected,
    PlatformErrorReason,
    ((error: PlatformError) => void)?,
  ][] = [
    [
      "403 for a missing permission",
      { status: 403, body: '{"message":"Must have admin rights"}' },
      "forbidden",
    ],
    [
      "403 with an exhausted primary quota",
      {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetEpoch),
        },
        body: '{"message":"API rate limit exceeded"}',
      },
      "rateLimited",
      (error) => assert.equal(error.retryAt, resetAt),
    ],
    [
      "403 with only the quota headers saying it is exhausted",
      {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetEpoch),
        },
        body: "",
      },
      "rateLimited",
      (error) => assert.equal(error.retryAt, resetAt),
    ],
    [
      "429 with an exhausted primary quota",
      {
        status: 429,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetEpoch),
        },
        body: "{}",
      },
      "rateLimited",
      (error) => assert.equal(error.retryAt, resetAt),
    ],
    [
      "429 without a stated reset",
      { status: 429, body: '{"message":"Too many requests"}' },
      "rateLimited",
      (error) => assert.equal(error.retryAt, undefined),
    ],
    [
      "503 with an HTML body",
      { status: 503, body: "<html>Unicorn!</html>" },
      "unavailable",
    ],
    ["a network failure", { network: true }, "unavailable"],
    ["unreadable JSON", { status: 200, body: "{not json" }, "invalidResponse"],
    [
      "an unreadable shape",
      { status: 200, body: '{"releases":[]}' },
      "invalidResponse",
    ],
  ];
  for (const [name, response, reason, check] of cases) {
    it(`maps ${name} to ${reason}`, async () => {
      const { fake, connection } = setup();
      fake.inject(response);
      await assert.rejects(
        connection.releaseSource.releases(),
        failure(reason, check),
      );
    });
  }

  // Every failing status by what it says against the error reasons: a
  // credential, a permission, an absent resource, a lost race, a quota, a
  // request that may succeed when retried, or a request refused as invalid.
  const statuses: [number, PlatformErrorReason][] = [
    [400, "rejected"],
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "notFound"],
    [405, "rejected"],
    [406, "rejected"],
    [408, "unavailable"],
    [409, "conflict"],
    [410, "notFound"],
    [411, "rejected"],
    [412, "conflict"],
    [413, "rejected"],
    [415, "rejected"],
    [421, "unavailable"],
    [422, "rejected"],
    [423, "rejected"],
    [425, "unavailable"],
    [428, "rejected"],
    [429, "rateLimited"],
    [431, "rejected"],
    [451, "notFound"],
    [499, "rejected"],
    [500, "unavailable"],
    [501, "unavailable"],
    [502, "unavailable"],
    [503, "unavailable"],
    [504, "unavailable"],
    [599, "unavailable"],
  ];
  for (const [status, reason] of statuses) {
    it(`maps the status ${status} to ${reason}`, async () => {
      const { fake, connection } = setup();
      fake.inject({ status, body: '{"message":"Something"}' });
      await assert.rejects(
        connection.releaseSource.releases(),
        failure(reason, (error) => assert.equal(error.status, status)),
      );
    });
  }

  it("maps a timeout to unavailable", async () => {
    const { fake, connection } = setup({ timeoutMs: 20 });
    fake.inject({ hang: true });
    await assert.rejects(
      connection.releaseSource.releases(),
      failure("unavailable", (error) => assert.match(error.message, /20 ms/)),
    );
  });

  it("reports the HTTP status on the error", async () => {
    const { fake, connection } = setup();
    fake.inject({ status: 422, body: '{"message":"Validation Failed"}' });
    await assert.rejects(
      connection.releaseSource.releases(),
      failure("rejected", (error) => assert.equal(error.status, 422)),
    );
  });

  const graphqlCases: [string, PlatformErrorReason][] = [
    ["NOT_FOUND", "notFound"],
    ["FORBIDDEN", "forbidden"],
    ["INSUFFICIENT_SCOPES", "forbidden"],
    ["RATE_LIMITED", "rateLimited"],
    ["SOMETHING_NEW", "rejected"],
  ];
  for (const [type, reason] of graphqlCases) {
    it(`maps the GraphQL error type ${type} to ${reason}`, async () => {
      const { fake, connection } = setup();
      fake.inject({
        status: 200,
        body: JSON.stringify({
          data: null,
          errors: [{ type, message: "nope" }],
        }),
      });
      await assert.rejects(connection.issueTracker.issue(1), failure(reason));
    });
  }

  it("reports the HTTP status on a GraphQL error", async () => {
    const { fake, connection } = setup();
    fake.inject({
      status: 200,
      body: JSON.stringify({
        data: null,
        errors: [{ type: "NOT_FOUND", message: "nope" }],
      }),
    });
    await assert.rejects(
      connection.issueTracker.issue(1),
      failure("notFound", (error) => assert.equal(error.status, 200)),
    );
  });

  it("reports the HTTP status on an unreadable GraphQL or REST list result", async () => {
    const { fake, connection } = setup();
    fake.inject({ status: 200, body: "{}" });
    await assert.rejects(
      connection.issueTracker.issue(1),
      failure("invalidResponse", (error) => assert.equal(error.status, 200)),
    );
    fake.inject({ status: 200, body: "[]" });
    await assert.rejects(
      connection.issueTracker.issue(1),
      failure("invalidResponse", (error) => assert.equal(error.status, 200)),
    );
    fake.inject({ status: 200, body: "{}" });
    await assert.rejects(
      connection.releaseSource.releases(),
      failure("invalidResponse", (error) => assert.equal(error.status, 200)),
    );
  });

  it("reads a fetch response's status, headers and body once", async () => {
    const reads = new Map<string, number>();
    const once =
      <T>(key: string, value: T, later: unknown) =>
      () => {
        reads.set(key, (reads.get(key) ?? 0) + 1);
        return reads.get(key) === 1 ? value : later;
      };
    const status = once("status", 200, 500);
    const headers = once(
      "headers",
      new Headers({ link: "" }),
      new Headers({ link: '<https://elsewhere.example/>; rel="next"' }),
    );
    const text = once(
      "text",
      async () => "[]",
      async () => "{not json",
    );
    const fetch = async () => ({
      get status() {
        return status();
      },
      get headers() {
        return headers();
      },
      get text() {
        return text();
      },
    });
    const connection = connect(`https://github.com/${path}`, {
      fetch: fetch as never,
    });
    assert.deepEqual(await connection.releaseSource.releases(), []);
    assert.deepEqual(Object.fromEntries(reads), {
      status: 1,
      headers: 1,
      text: 1,
    });
  });

  it("fails with unavailable when fetch throws a value that cannot be read", async () => {
    const boom = () => {
      throw new TypeError("unreadable");
    };
    const unreadable = new Proxy(
      {},
      { get: boom, getPrototypeOf: boom, has: boom, ownKeys: boom },
    );
    const fetch = async () => {
      throw unreadable;
    };
    const connection = connect(`https://github.com/${path}`, { fetch });
    await assert.rejects(
      connection.releaseSource.releases(),
      failure("unavailable"),
    );
  });

  it("reports the HTTP status on a GraphQL page without its nodes or its cursor", async () => {
    const { fake, connection } = setup();
    const page = (pageInfo: unknown, nodes: unknown = []) =>
      JSON.stringify({
        data: { repository: { pullRequests: { nodes, pageInfo } } },
      });
    fake.inject({ status: 200, body: page({ hasNextPage: false }, null) });
    await assert.rejects(
      connection.pullRequests.byHeadBranch("main"),
      failure("invalidResponse", (error) => assert.equal(error.status, 200)),
    );
    fake.inject({
      status: 200,
      body: page({ hasNextPage: true, endCursor: null }),
    });
    await assert.rejects(
      connection.pullRequests.byHeadBranch("main"),
      failure("invalidResponse", (error) => assert.equal(error.status, 200)),
    );
  });

  it("fails GraphQL-backed reads with unauthenticated on an anonymous connection", async () => {
    const fake = new GitHubFake(path);
    const connection = connect(`https://github.com/${path}`, {
      fetch: fake.fetch,
    });
    await assert.rejects(
      connection.issueTracker.issue(1),
      failure("unauthenticated"),
    );
  });

  it("fails a credential GitHub rejects with unauthenticated", async () => {
    const fake = new GitHubFake(path);
    const connection = connect(`https://github.com/${path}`, {
      credential: "ghp_expired",
      fetch: fake.fetch,
    });
    await assert.rejects(
      connection.releaseSource.releases(),
      failure("unauthenticated"),
    );
  });
});

// GitHub's documented rate-limit handling: wait until Retry-After when it is
// stated, otherwise until `x-ratelimit-reset` when `x-ratelimit-remaining` is
// `0`; otherwise GitHub states no time and advises waiting at least a minute.
// The headers are the ones GitHub sends with each limit.
describe("GitHub rate limits", () => {
  const now = () => Math.floor(Date.now() / 1000);
  const quota = (remaining: number, reset: number, resource = "core") => ({
    "x-ratelimit-limit": "5000",
    "x-ratelimit-remaining": String(remaining),
    "x-ratelimit-used": String(5000 - remaining),
    "x-ratelimit-reset": String(reset),
    "x-ratelimit-resource": resource,
  });
  const primaryMessage =
    "API rate limit exceeded for user ID 1. If you reach out to GitHub Support for help, please include the request ID 0000:0000:0000000:0000000:00000000.";
  const secondaryMessage =
    "You have exceeded a secondary rate limit. Please wait a few minutes before you try again. If you reach out to GitHub Support for help, please include the request ID 0000:0000:0000000:0000000:00000000.";
  const rest = (message: string) =>
    JSON.stringify({
      message,
      documentation_url:
        "https://docs.github.com/rest/overview/rate-limits-for-the-rest-api",
    });
  const graphql = (error: Record<string, unknown>) =>
    JSON.stringify({ errors: [error] });
  const about = (seconds: number) => (error: PlatformError) => {
    const delay = Date.parse(error.retryAt ?? "") - Date.now();
    assert.ok(
      delay > (seconds - 10) * 1000 && delay <= seconds * 1000,
      `retryAt is about ${seconds} s away, not ${delay} ms`,
    );
  };
  const at = (reset: number) => (error: PlatformError) =>
    assert.equal(error.retryAt, new Date(reset * 1000).toISOString());
  const unstated = (error: PlatformError) =>
    assert.equal(error.retryAt, undefined);

  type Case = [
    string,
    () => { response: Injected; check: (error: PlatformError) => void },
  ];
  const restCases: Case[] = [
    [
      "a primary limit as 403",
      () => {
        const reset = now() + 1800;
        return {
          response: {
            status: 403,
            headers: quota(0, reset),
            body: rest(primaryMessage),
          },
          check: at(reset),
        };
      },
    ],
    [
      "a primary limit as 429",
      () => {
        const reset = now() + 1800;
        return {
          response: {
            status: 429,
            headers: quota(0, reset),
            body: rest(primaryMessage),
          },
          check: at(reset),
        };
      },
    ],
    [
      "a secondary limit with Retry-After and quota left",
      () => ({
        response: {
          status: 403,
          headers: { "retry-after": "60", ...quota(4990, now() + 3000) },
          body: rest(secondaryMessage),
        },
        check: about(60),
      }),
    ],
    [
      "a secondary limit as 429 with Retry-After",
      () => ({
        response: {
          status: 429,
          headers: { "retry-after": "60", ...quota(4990, now() + 3000) },
          body: rest(secondaryMessage),
        },
        check: about(60),
      }),
    ],
    [
      "a secondary limit without Retry-After and with quota left",
      () => ({
        response: {
          status: 403,
          headers: quota(4990, now() + 3000),
          body: rest(secondaryMessage),
        },
        check: unstated,
      }),
    ],
    [
      "a secondary limit whose Retry-After comes before an exhausted quota's reset",
      () => ({
        response: {
          status: 403,
          headers: { "retry-after": "60", ...quota(0, now() + 3000) },
          body: rest(secondaryMessage),
        },
        check: about(60),
      }),
    ],
    [
      "a secondary limit with a Retry-After date",
      () => ({
        response: {
          status: 403,
          headers: {
            "retry-after": new Date((now() + 120) * 1000).toUTCString(),
            ...quota(4990, now() + 3000),
          },
          body: rest(secondaryMessage),
        },
        check: about(121),
      }),
    ],
    [
      "an exhausted quota with a Retry-After date that does not exist",
      () => {
        const reset = now() + 1800;
        return {
          response: {
            status: 403,
            headers: {
              "retry-after": "Fri, 30 Feb 2024 12:00:00 GMT",
              ...quota(0, reset),
            },
            body: rest(primaryMessage),
          },
          check: at(reset),
        };
      },
    ],
    [
      "an exhausted quota with an unreadable Retry-After",
      () => {
        const reset = now() + 1800;
        return {
          response: {
            status: 403,
            headers: { "retry-after": "soon", ...quota(0, reset) },
            body: rest(primaryMessage),
          },
          check: at(reset),
        };
      },
    ],
  ];
  for (const [name, make] of restCases) {
    it(`reports retryAt for ${name} on REST`, async () => {
      const { fake, connection } = setup();
      const { response, check } = make();
      fake.inject(response);
      await assert.rejects(
        connection.releaseSource.releases(),
        failure("rateLimited", check),
      );
    });
  }

  const graphqlCases: Case[] = [
    [
      "a typed primary limit as 200",
      () => {
        const reset = now() + 1800;
        return {
          response: {
            status: 200,
            headers: quota(0, reset, "graphql"),
            body: graphql({
              type: "RATE_LIMITED",
              message: "API rate limit exceeded for user ID 1.",
            }),
          },
          check: at(reset),
        };
      },
    ],
    [
      "an untyped primary limit as 200 with an exhausted quota",
      () => {
        const reset = now() + 1800;
        return {
          response: {
            status: 200,
            headers: quota(0, reset, "graphql"),
            body: graphql({
              message: "Something went wrong while executing your query.",
            }),
          },
          check: at(reset),
        };
      },
    ],
    [
      "an untyped rate-limit message as 200",
      () => ({
        response: {
          status: 200,
          headers: quota(4990, now() + 3000, "graphql"),
          body: graphql({
            message: "API rate limit already exceeded for user ID 1.",
          }),
        },
        check: unstated,
      }),
    ],
    [
      "an untyped secondary limit as 200 with Retry-After",
      () => ({
        response: {
          status: 200,
          headers: {
            "retry-after": "60",
            ...quota(4990, now() + 3000, "graphql"),
          },
          body: graphql({ message: secondaryMessage }),
        },
        check: about(60),
      }),
    ],
    [
      "a typed limit with quota left and no Retry-After",
      () => ({
        response: {
          status: 200,
          headers: quota(4990, now() + 3000, "graphql"),
          body: graphql({ type: "RATE_LIMITED", message: secondaryMessage }),
        },
        check: unstated,
      }),
    ],
    [
      "a secondary limit as 403 with Retry-After and quota left",
      () => ({
        response: {
          status: 403,
          headers: {
            "retry-after": "60",
            ...quota(4990, now() + 3000, "graphql"),
          },
          body: rest(secondaryMessage),
        },
        check: about(60),
      }),
    ],
    [
      "a primary limit as 403 with only its message",
      () => ({
        response: { status: 403, body: rest(primaryMessage) },
        check: unstated,
      }),
    ],
  ];
  for (const [name, make] of graphqlCases) {
    it(`recognizes ${name} on GraphQL and reports its retryAt`, async () => {
      const { fake, connection } = setup();
      const { response, check } = make();
      fake.inject(response);
      await assert.rejects(
        connection.issueTracker.issue(1),
        failure("rateLimited", check),
      );
    });
  }

  it("keeps a GraphQL error's own type over an exhausted quota", async () => {
    const { fake, connection } = setup();
    fake.inject({
      status: 200,
      headers: quota(0, now() + 1800, "graphql"),
      body: graphql({
        type: "NOT_FOUND",
        message: "Could not resolve to an Issue.",
      }),
    });
    await assert.rejects(connection.issueTracker.issue(1), failure("notFound"));
  });

  it("rejects an untyped GraphQL error without a rate-limit signal", async () => {
    const { fake, connection } = setup();
    fake.inject({
      status: 200,
      headers: quota(4990, now() + 3000, "graphql"),
      body: graphql({ message: "Field 'nope' doesn't exist on type 'Issue'" }),
    });
    await assert.rejects(connection.issueTracker.issue(1), failure("rejected"));
  });
});

describe("GitHub requests", () => {
  it("authenticate with the token and pin the API version", async () => {
    const { fake, connection } = setup();
    await connection.releaseSource.releases();
    const [request] = fake.requests;
    assert.equal(
      request?.url.href,
      `https://api.github.com/repos/${path}/releases?per_page=100`,
    );
    assert.equal(request?.headers.get("authorization"), `Bearer ${token}`);
    assert.equal(request?.headers.get("x-github-api-version"), "2022-11-28");
    assert.equal(request?.headers.get("accept"), "application/vnd.github+json");
  });

  it("send no transport request that names its own credential", async () => {
    const { fake, connection } = setup();
    await assert.rejects(
      connection.access.request({
        path: "/user",
        headers: { Authorization: "Bearer someone-else", "X-Extra": "1" },
      }),
      failure("rejected"),
    );
    assert.equal(fake.requests.length, 0);
  });

  it("send a transport request's own headers, its content type included, over Postern's", async () => {
    const { fake, connection } = setup();
    const headers = {
      "Content-Type": "application/merge-patch+json",
      Accept: "application/vnd.github.raw+json",
      "X-Extra": "1",
    };
    await connection.access
      .request({ path: "/user", method: "PATCH", body: {}, headers })
      .catch(() => {});
    const [request] = fake.requests;
    assert.equal(
      request?.headers.get("content-type"),
      "application/merge-patch+json",
    );
    assert.equal(
      request?.headers.get("accept"),
      "application/vnd.github.raw+json",
    );
    assert.equal(request?.headers.get("x-extra"), "1");
    assert.equal(request?.headers.get("authorization"), `Bearer ${token}`);
  });

  it("send the transport body exactly as the connection validated it", async () => {
    const fake = new GitHubFake(path);
    fake.tokens.set(token, { login: "octocat", type: "User" });
    const sent: unknown[] = [];
    const fetch: typeof globalThis.fetch = (input, init) => {
      sent.push(init?.body);
      return fake.fetch(input as string | URL, init);
    };
    // A token function makes the transport wait before it serializes the body.
    const connection = connect(`https://github.com/${path}`, {
      credential: async () => token,
      fetch,
    });
    const body = { title: "checked", labels: ["a"] };
    const pending = connection.access.request({
      path: `/repos/${path}/issues`,
      method: "POST",
      body,
    });
    body.title = "changed";
    body.labels.push("b");
    await pending.catch(() => {});
    assert.deepEqual(sent, ['{"title":"checked","labels":["a"]}']);
  });

  it("send no credential on an anonymous connection", async () => {
    const fake = new GitHubFake(path);
    await connect(`https://github.com/${path}`, {
      fetch: fake.fetch,
    }).releaseSource.releases();
    assert.equal(fake.requests[0]?.headers.has("authorization"), false);
  });

  it("never follow a next page off GitHub's API", async () => {
    const { fake, connection } = setup();
    fake.inject({
      status: 200,
      headers: {
        link: '<https://elsewhere.example/releases?page=2>; rel="next"',
      },
      body: "[]",
    });
    await assert.rejects(
      connection.releaseSource.releases(),
      failure("invalidResponse"),
    );
    assert.equal(fake.requests.length, 1);
  });

  // `fetch` refuses a URL with credentials, and a next page must be the one
  // GitHub named, so each fails while its page is read, with that page's status.
  for (const [name, next] of [
    ["a username", "https://u@api.github.com/releases?page=2"],
    ["a username and password", "https://u:p@api.github.com/releases?page=2"],
    ["a password alone", "https://:p@api.github.com/releases?page=2"],
    ["a non-https scheme", "http://api.github.com/releases?page=2"],
    ["a non-default port", "https://api.github.com:8443/releases?page=2"],
    ["a fragment", "https://api.github.com/releases?page=2#top"],
    ["an empty fragment", "https://api.github.com/releases?page=2#"],
  ] as const) {
    it(`never follow a next page with ${name}`, async () => {
      const { fake, connection } = setup();
      fake.inject({
        status: 203,
        headers: { link: `<${next}>; rel="next"` },
        body: "[]",
      });
      await assert.rejects(
        connection.releaseSource.releases(),
        failure("invalidResponse", (error) => assert.equal(error.status, 203)),
      );
      assert.equal(fake.requests.length, 1);
    });
  }

  it("report bot logins in REST form from GraphQL", async () => {
    const { fake, connection } = setup();
    fake.issues.set(`${path}#1`, {
      repository: path,
      number: 1,
      databaseId: 10,
      nodeId: "I_10",
      state: "OPEN",
      title: "By a bot",
      body: "",
      author: { login: "dependabot[bot]", type: "Bot" },
      labels: [],
      createdAt: "2026-01-01T00:00:00Z",
      lastEditedAt: null,
      parent: null,
      blockedBy: [],
      subIssueAddedAt: [],
      events: [],
    });
    assert.deepEqual((await connection.issueTracker.issue(1)).author, {
      login: "dependabot[bot]",
      bot: true,
    });
  });

  it("send the expected head with a squash merge", async () => {
    const { fake, connection } = setup();
    fake.inject({
      status: 200,
      body: JSON.stringify({ sha: "f".repeat(40), merged: true }),
    });
    await connection.pullRequests.squashMerge(3, {
      expectedHead: "a".repeat(40),
      title: "feat: x (#3)",
      body: "Closes #1",
    });
    const [request] = fake.requests;
    assert.equal(request?.method, "PUT");
    assert.equal(request?.url.pathname, `/repos/${path}/pulls/3/merge`);
    assert.deepEqual(request?.body, {
      merge_method: "squash",
      sha: "a".repeat(40),
      commit_title: "feat: x (#3)",
      commit_message: "Closes #1",
    });
  });

  it("read no environment variable for credentials", async () => {
    const previous = {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      GH_TOKEN: process.env.GH_TOKEN,
    };
    process.env.GITHUB_TOKEN = "ghp_fromEnvironment";
    process.env.GH_TOKEN = "ghp_fromEnvironment";
    try {
      const fake = new GitHubFake(path);
      await connect(`https://github.com/${path}`, {
        fetch: fake.fetch,
      }).releaseSource.releases();
      assert.equal(fake.requests[0]?.headers.has("authorization"), false);
      assert.equal(
        await connect(`https://github.com/${path}`, {
          fetch: fake.fetch,
        }).access.viewer(),
        null,
      );
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

describe("GitHub request paths", () => {
  // A "." or ".." path segment, even percent-encoded, would move the request to another resource.
  for (const [name, call] of [
    [
      "a label named .",
      (connection: Connection) => connection.issueTracker.removeLabel(1, "."),
    ],
    [
      "a label named ..",
      (connection: Connection) => connection.issueTracker.removeLabel(1, ".."),
    ],
    [
      "a login named ..",
      (connection: Connection) => connection.access.role(".."),
    ],
    [
      "a commit named ..",
      (connection: Connection) => connection.pullRequests.checks(".."),
    ],
    [
      "a tag with a .. segment",
      (connection: Connection) =>
        connection.releaseSource.tagCommit("v1/../../x"),
    ],
    [
      "a tag named .",
      (connection: Connection) => connection.releaseSource.tagCommit("."),
    ],
  ] as const) {
    it(`reject ${name} without sending a request`, async () => {
      const { fake, connection } = setup();
      await assert.rejects(call(connection), failure("rejected"));
      assert.equal(fake.requests.length, 0);
    });
  }
});

describe("GitHub tag peeling", () => {
  it("fails with invalidResponse for a tag object whose SHA is not hexadecimal, without following it", async () => {
    const { fake, connection } = setup();
    fake.inject({
      status: 200,
      body: JSON.stringify({ object: { type: "tag", sha: "../../../user" } }),
    });
    await assert.rejects(
      connection.releaseSource.tagCommit("v1.0.0"),
      failure("invalidResponse"),
    );
    assert.equal(fake.requests.length, 1);
  });

  // A chain of annotated tags, each pointing to the next, the last to the commit.
  const chain = (fake: GitHubFake, length: number, commit: string) => {
    const shas = Array.from(
      { length },
      (_, index) => `e${(index + 1).toString(16).padStart(39, "0")}`,
    );
    fake.tagRefs.set("v1.0.0", { type: "tag", sha: shas[0]! });
    shas.forEach((sha, index) =>
      fake.tagObjects.set(
        sha,
        index + 1 < length
          ? { type: "tag", sha: shas[index + 1]! }
          : { type: "commit", sha: commit },
      ),
    );
    return shas;
  };

  it("peels a chain of many annotated tags", async () => {
    const { fake, connection } = setup();
    chain(fake, 50, "c".repeat(40));
    assert.equal(
      await connection.releaseSource.tagCommit("v1.0.0"),
      "c".repeat(40),
    );
    assert.equal(fake.requests.length, 51);
  });

  it("fails with invalidResponse and the status for a chain that leads back to a tag it followed, following each tag once", async () => {
    const { fake, connection } = setup();
    const [first, , third] = chain(fake, 3, "c".repeat(40));
    fake.tagObjects.set(third!, { type: "tag", sha: first!.toUpperCase() });
    await assert.rejects(
      connection.releaseSource.tagCommit("v1.0.0"),
      failure("invalidResponse", (error) => assert.equal(error.status, 200)),
    );
    assert.equal(fake.requests.length, 4);
  });

  it("fails with invalidResponse for a tag that points to itself", async () => {
    const { fake, connection } = setup();
    const [only] = chain(fake, 1, "c".repeat(40));
    fake.tagObjects.set(only!, { type: "tag", sha: only! });
    await assert.rejects(
      connection.releaseSource.tagCommit("v1.0.0"),
      failure("invalidResponse"),
    );
    assert.equal(fake.requests.length, 2);
  });

  it("follows at most 1000 tag objects", async () => {
    const { fake, connection } = setup();
    chain(fake, 1000, "c".repeat(40));
    assert.equal(
      await connection.releaseSource.tagCommit("v1.0.0"),
      "c".repeat(40),
    );
    fake.requests.length = 0;
    chain(fake, 1001, "c".repeat(40));
    await assert.rejects(
      connection.releaseSource.tagCommit("v1.0.0"),
      failure("invalidResponse"),
    );
    assert.equal(fake.requests.length, 1001);
  });
});

describe("GitHub issue numbers", () => {
  const head = "a".repeat(40);

  it("close no pull request: closeIssue reads what the number names and sends no write for a pull request", async () => {
    const { platform, fake } = startGitHub();
    const number = platform.addPullRequest({
      headBranch: "feature",
      headCommit: head,
    });
    await assert.rejects(
      platform.connect().issueTracker.closeIssue(number),
      failure("notFound", (error) => assert.equal(error.status, 200)),
    );
    assert.deepEqual(
      fake.requests.map((request) => request.method),
      ["GET"],
    );
  });

  it("fail closeIssue with invalidResponse, without writing, when GitHub's issue object cannot tell", async () => {
    for (const body of [
      "[]",
      JSON.stringify({ number: 1, pull_request: "yes" }),
    ]) {
      const { platform, fake } = startGitHub();
      const number = platform.addIssue();
      fake.inject({ status: 200, body });
      await assert.rejects(
        platform.connect().issueTracker.closeIssue(number),
        failure("invalidResponse"),
      );
      assert.equal(fake.requests.length, 1);
      assert.equal(platform.issueState(number), "open");
    }
  });

  it("reach a pull request's labels, label changes and comments, which it shares with issues", async () => {
    const { platform, fake } = startGitHub();
    const number = platform.addPullRequest({
      headBranch: "feature",
      headCommit: head,
    });
    const tracker = platform.connect().issueTracker;
    await tracker.addLabels(number, ["bug", "ready"]);
    await tracker.removeLabel(number, "bug");
    assert.deepEqual(fake.pullRequests.get(`${path}#${number}`)?.labels, [
      "ready",
    ]);
    const comment = await tracker.createComment(number, "First");
    await tracker.updateComment(comment.id, "Second");
    assert.deepEqual(
      (await tracker.comments(number)).map((read) => read.body),
      ["Second"],
    );
    assert.deepEqual(await tracker.labelChanges(number), []);
    assert.equal(platform.pullRequestState(number), "open");
  });
});

describe("GitHub numeric IDs", () => {
  const pullNode = (fullDatabaseId: unknown) => ({
    number: 3,
    databaseId: null,
    fullDatabaseId,
    id: "PR_3",
    url: `https://github.com/${path}/pull/3`,
    state: "OPEN",
    title: "Three",
    body: "",
    createdAt: "2026-01-01T00:00:00Z",
    author: { __typename: "User", login: "mona" },
    headRefName: "feature",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    isCrossRepository: false,
    repository: { nameWithOwner: path },
  });

  it("read issue and pull request IDs past 32 bits from fullDatabaseId", async () => {
    const { fake, connection } = setup();
    const issueId = 2 ** 31;
    const pullId = 2 ** 40 + 7;
    fake.issues.set(`${path}#1`, {
      repository: path,
      number: 1,
      databaseId: issueId,
      nodeId: "I_1",
      state: "OPEN",
      title: "One",
      body: "",
      author: null,
      labels: [],
      createdAt: "2026-01-01T00:00:00Z",
      lastEditedAt: null,
      parent: null,
      blockedBy: [],
      subIssueAddedAt: [],
      events: [],
    });
    fake.pullRequests.set(`${path}#2`, {
      repository: path,
      number: 2,
      databaseId: pullId,
      nodeId: "PR_2",
      state: "OPEN",
      title: "Two",
      body: "",
      author: null,
      createdAt: "2026-01-01T00:00:00Z",
      headRefName: "feature",
      headRefOid: "a".repeat(40),
      baseRefName: "main",
      isCrossRepository: false,
      closes: [`${path}#1`],
      reviews: [],
      threads: [],
      isMergeQueueEnabled: false,
      merge: null,
      labels: [],
      events: [],
    });
    assert.equal((await connection.issueTracker.issue(1)).id, issueId);
    assert.deepEqual(
      (await connection.issueTracker.issues()).map((issue) => issue.id),
      [issueId],
    );
    assert.equal((await connection.pullRequests.pullRequest(2)).id, pullId);
    assert.deepEqual(
      (await connection.pullRequests.byHeadBranch("feature")).map(
        (pull) => pull.id,
      ),
      [pullId],
    );
    assert.deepEqual(
      (await connection.pullRequests.closing(1)).map((pull) => pull.id),
      [pullId],
    );
  });

  it("ask GraphQL for fullDatabaseId, not the 32-bit databaseId", async () => {
    const { fake, connection } = setup();
    fake.inject({
      status: 200,
      body: JSON.stringify({
        data: { repository: { pullRequest: pullNode("3") } },
      }),
    });
    await connection.pullRequests.pullRequest(3);
    const request = fake.requests[0];
    assert.ok(request);
    const query = String((request.body as { query?: unknown }).query);
    assert.match(query, /\bfullDatabaseId\b/);
    assert.doesNotMatch(query, /(?<!full)databaseId/i);
  });

  // A JSON number past 2^53 has already lost digits when parsed, so REST IDs
  // fail at the same bound as GraphQL's string IDs.
  it("fail with invalidResponse for a GraphQL ID past Number.MAX_SAFE_INTEGER", async () => {
    const { fake, connection } = setup();
    fake.inject({
      status: 200,
      body: JSON.stringify({
        data: { repository: { pullRequest: pullNode("9007199254740993") } },
      }),
    });
    await assert.rejects(
      connection.pullRequests.pullRequest(3),
      failure("invalidResponse"),
    );
  });

  it("fail with invalidResponse for a REST ID past Number.MAX_SAFE_INTEGER", async () => {
    const { fake, connection } = setup();
    fake.inject({
      status: 200,
      body: '[{"id":9007199254740993,"tag_name":"v1.0.0","name":"","draft":false,"prerelease":false,"published_at":null}]',
    });
    await assert.rejects(
      connection.releaseSource.releases(),
      failure("invalidResponse"),
    );
  });

  for (const fullDatabaseId of [
    null,
    undefined,
    3,
    "",
    "-3",
    "3.0",
    "1e3",
    "0x3",
    "03",
    " 3",
  ]) {
    it(`fail with invalidResponse for the GraphQL ID ${JSON.stringify(fullDatabaseId) ?? "undefined"}`, async () => {
      const { fake, connection } = setup();
      fake.inject({
        status: 200,
        body: JSON.stringify({
          data: { repository: { pullRequest: pullNode(fullDatabaseId) } },
        }),
      });
      await assert.rejects(
        connection.pullRequests.pullRequest(3),
        failure("invalidResponse"),
      );
    });
  }
});

describe("GitHub response reading after the status", () => {
  // A fetch whose response has a readable status, and whose headers or body are as given.
  const answering =
    (
      status: number,
      response: { headers?: () => unknown; text?: () => unknown },
    ) =>
    async () => ({
      status,
      get headers() {
        return response.headers ? response.headers() : new Headers();
      },
      text: response.text ?? (async () => "[]"),
    });
  const unreadable = () => {
    throw new TypeError("unreadable");
  };
  const cases: [
    string,
    ReturnType<typeof answering>,
    PlatformErrorReason,
    number,
  ][] = [
    [
      "a body that fails to arrive",
      answering(200, { text: async () => unreadable() }),
      "unavailable",
      200,
    ],
    [
      "an error body that fails to arrive",
      answering(502, { text: async () => unreadable() }),
      "unavailable",
      502,
    ],
    [
      "headers that cannot be read",
      answering(200, { headers: unreadable }),
      "invalidResponse",
      200,
    ],
    [
      "headers that are no headers",
      answering(200, { headers: () => 42 }),
      "invalidResponse",
      200,
    ],
    [
      "a body that is no text",
      answering(200, { text: async () => ({ toString: unreadable }) }),
      "invalidResponse",
      200,
    ],
  ];
  for (const [name, fetch, reason, status] of cases) {
    it(`fails with ${reason} and the status for ${name}`, async () => {
      const connection = connect(`https://github.com/${path}`, {
        fetch: fetch as never,
      });
      await assert.rejects(
        connection.releaseSource.releases(),
        failure(reason, (error) => assert.equal(error.status, status)),
      );
    });
  }

  it("keeps the status of a timeout while the body arrives", async () => {
    const fetch = async (_: unknown, init: RequestInit) => ({
      status: 200,
      headers: new Headers(),
      text: () =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    });
    const connection = connect(`https://github.com/${path}`, {
      fetch: fetch as never,
      timeoutMs: 20,
    });
    await assert.rejects(
      connection.releaseSource.releases(),
      failure("unavailable", (error) => {
        assert.equal(error.status, 200);
        assert.match(error.message, /20 ms/);
      }),
    );
  });

  for (const [name, headers] of [
    [
      "a quota reset past the last date",
      { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "99999999999999" },
    ],
    ["a retry delay past the last date", { "retry-after": "99999999999999" }],
  ] as const) {
    it(`keeps rateLimited and the status for ${name}`, async () => {
      const { fake, connection } = setup();
      fake.inject({
        status: 403,
        headers,
        body: '{"message":"API rate limit exceeded"}',
      });
      await assert.rejects(
        connection.releaseSource.releases(),
        failure("rateLimited", (error) => {
          assert.equal(error.status, 403);
          assert.equal(error.retryAt, undefined);
        }),
      );
    });
  }

  for (const errors of [
    "boom",
    {},
    1,
    [{}],
    [null],
    ["nope"],
    [{ type: "NOT_FOUND" }],
    [{ message: 1 }],
    [{ message: "nope", type: 1 }],
    [{ message: "nope" }, {}],
  ]) {
    it(`fails with invalidResponse and the status for GraphQL errors given as ${JSON.stringify(errors)}`, async () => {
      const { fake, connection } = setup();
      fake.inject({
        status: 200,
        body: JSON.stringify({
          data: { repository: { pullRequest: null } },
          errors,
        }),
      });
      await assert.rejects(
        connection.pullRequests.pullRequest(1),
        failure("invalidResponse", (error) => assert.equal(error.status, 200)),
      );
    });
  }
});

describe("GitHub page metadata", () => {
  const mona = { login: "mona", bot: false };
  // Changes every `pageInfo` in a response.
  const everyPageInfo = (
    change: (pageInfo: Record<string, unknown>) => Record<string, unknown>,
  ) =>
    function walk(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(walk);
      if (value === null || typeof value !== "object") return value;
      const result = Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, walk(item)]),
      );
      return "pageInfo" in result
        ? {
            ...result,
            pageInfo: change(result.pageInfo as Record<string, unknown>),
          }
        : result;
    };
  const flags: [
    string,
    (pageInfo: Record<string, unknown>) => Record<string, unknown>,
  ][] = [
    [
      "no flag",
      (pageInfo) => {
        const result = { ...pageInfo };
        delete result.hasNextPage;
        return result;
      },
    ],
    ["a null flag", (pageInfo) => ({ ...pageInfo, hasNextPage: null })],
    ['the flag "true"', (pageInfo) => ({ ...pageInfo, hasNextPage: "true" })],
    ["the flag 1", (pageInfo) => ({ ...pageInfo, hasNextPage: 1 })],
    [
      "an empty cursor",
      (pageInfo) => ({ ...pageInfo, hasNextPage: true, endCursor: "" }),
    ],
  ];
  // An issue whose labels, sub-issues and blockers each span two pages, read
  // one page at a time, so each list needs follow-up requests.
  const connections: [
    string,
    (platform: ContractPlatform) => number,
    number,
  ][] = [
    ["labels", (platform) => platform.addIssue({ labels: ["a", "b"] }), 1],
    [
      "sub-issues",
      (platform) => {
        const parent = platform.addIssue();
        platform.addIssue({ parent });
        platform.addIssue({ parent });
        return parent;
      },
      1,
    ],
    [
      "blockers",
      (platform) => {
        const blockers = [platform.addIssue(), platform.addIssue()];
        return platform.addIssue({ blockedBy: blockers });
      },
      1,
    ],
  ];
  for (const [list, seed, skip] of connections) {
    for (const [flag, change] of flags) {
      it(`fails with invalidResponse and the status for a follow-up page of an issue's ${list} with ${flag}`, async () => {
        const { platform, fake } = startGitHub();
        const number = seed(platform);
        platform.pageSize(1);
        fake.malformNext({ status: 203, body: everyPageInfo(change) }, skip);
        await assert.rejects(
          platform.connect().issueTracker.issue(number),
          failure("invalidResponse", (error) =>
            assert.equal(error.status, 203),
          ),
        );
      });
    }
  }

  it("fails with invalidResponse for a GraphQL page whose cursor repeats one it already followed", async () => {
    const { platform, fake } = startGitHub();
    const head = "a".repeat(40);
    for (let index = 0; index < 3; index++)
      platform.addPullRequest({ headBranch: "feature", headCommit: head });
    platform.pageSize(1);
    fake.malformNext(
      {
        status: 203,
        body: everyPageInfo((pageInfo) => ({ ...pageInfo, endCursor: "1" })),
      },
      1,
    );
    await assert.rejects(
      platform.connect().pullRequests.byHeadBranch("feature"),
      failure("invalidResponse"),
    );
    assert.equal(fake.requests.length, 2);
  });

  it("fails with invalidResponse for a REST page whose next link repeats one it already followed", async () => {
    const { platform, fake } = startGitHub();
    const number = platform.addIssue();
    for (const body of ["a", "b", "c"])
      platform.addComment(number, {
        author: mona,
        body,
        createdAt: "2026-01-02T00:00:00Z",
      });
    platform.pageSize(1);
    const again = `https://api.github.com/repos/${platform.path}/issues/${number}/comments?per_page=100&page=2`;
    fake.malformNext(
      {
        status: 203,
        headers: { link: `<${again}>; rel="next"` },
        body: (json) => json,
      },
      1,
    );
    await assert.rejects(
      platform.connect().issueTracker.comments(number),
      failure("invalidResponse"),
    );
    assert.equal(fake.requests.length, 2);
  });

  for (const [name, link] of [
    [
      "two next links",
      '<https://api.github.com/a?page=2>; rel="next", <https://api.github.com/b?page=2>; rel="next"',
    ],
    ["a link without its relation", "<https://api.github.com/a?page=2>"],
    ["a value that is no link", "next"],
  ] as const) {
    it(`fails with invalidResponse and the status for a REST Link header with ${name}`, async () => {
      const { fake, connection } = setup();
      fake.inject({ status: 200, headers: { link }, body: "[]" });
      await assert.rejects(
        connection.releaseSource.releases(),
        failure("invalidResponse", (error) => assert.equal(error.status, 200)),
      );
    });
  }

  for (const [name, link] of [
    [
      "only first and previous links",
      '<https://api.github.com/a?page=1>; rel="first", <https://api.github.com/a?page=1>; rel="prev"',
    ],
    [
      "empty list elements",
      ' , <https://api.github.com/a?page=1>; rel="prev" ,',
    ],
    ["an empty value", ""],
  ] as const) {
    it(`reads a REST Link header with ${name} as the last page`, async () => {
      const { fake, connection } = setup();
      fake.inject({ status: 200, headers: { link }, body: "[]" });
      assert.deepEqual(await connection.releaseSource.releases(), []);
    });
  }

  it("follows a REST next link among several relations in one link", async () => {
    const { platform, fake } = startGitHub();
    platform.addRelease({
      tag: "v1.0.0",
      name: "",
      draft: false,
      prerelease: false,
      publishedAt: null,
    });
    const next = `https://api.github.com/repos/${platform.path}/releases?per_page=100&page=2`;
    fake.inject({
      status: 200,
      headers: { link: `<${next}>; rel="next last"` },
      body: "[]",
    });
    const releases = await platform.connect().releaseSource.releases();
    assert.equal(fake.requests[1]?.url.href, next);
    assert.deepEqual(releases, []);
  });
});

describe("GitHub response values", () => {
  // Every value under `key`, anywhere in a response, changed; a change to `undefined` drops it.
  const everyKey = (key: string, change: (value: unknown) => unknown) =>
    function walk(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(walk);
      if (value === null || typeof value !== "object") return value;
      const result: Record<string, unknown> = {};
      for (const [name, item] of Object.entries(value)) {
        const next = name === key ? change(item) : walk(item);
        if (next !== undefined) result[name] = next;
      }
      return result;
    };
  const {
    issue,
    labelChanges,
    comments,
    pullRequest,
    reviews,
    reviewThreads,
    checks,
    releases,
    tagCommit,
    role,
    squashMerge,
    createLabel,
  } = reads;
  const drop = () => undefined;
  const cases: [
    name: string,
    read: Read,
    key: string,
    change: (value: unknown) => unknown,
  ][] = [
    ["an issue result without its repository", issue, "repository", drop],
    [
      "an issue without its sub-issue link events",
      issue,
      "timelineItems",
      drop,
    ],
    [
      "an issue sub-issue link event without its time",
      issue,
      "timelineItems",
      () => ({ nodes: [{}] }),
    ],
    ["an issue without its parent field", issue, "parent", drop],
    ["an issue without its author field", issue, "author", drop],
    ["an issue without its edit time field", issue, "lastEditedAt", drop],
    [
      "an issue edit time that is no time",
      issue,
      "lastEditedAt",
      () => "yesterday",
    ],
    ["an issue number of 0", issue, "number", () => 0],
    ["an empty issue node ID", issue, "id", () => ""],
    ["an issue URL that is no URL", issue, "url", () => "issue 1"],
    [
      "an issue creation time that is no time",
      issue,
      "createdAt",
      () => "2026-13-45",
    ],
    [
      "an issue creation time on February 30",
      issue,
      "createdAt",
      () => "2024-02-30T12:00:00Z",
    ],
    [
      "an issue creation time on February 29 of a common year",
      issue,
      "createdAt",
      () => "2026-02-29T12:00:00Z",
    ],
    [
      "an issue creation time on April 31",
      issue,
      "createdAt",
      () => "2026-04-31T12:00:00Z",
    ],
    [
      "an issue creation time at hour 24",
      issue,
      "createdAt",
      () => "2026-01-01T24:00:00Z",
    ],
    [
      "an issue creation time at minute 60",
      issue,
      "createdAt",
      () => "2026-01-01T12:60:00Z",
    ],
    [
      "an issue creation time at second 60",
      issue,
      "createdAt",
      () => "2026-01-01T23:59:60Z",
    ],
    [
      "an issue creation time in month 0",
      issue,
      "createdAt",
      () => "2026-00-10T12:00:00Z",
    ],
    [
      "an issue creation time on day 0",
      issue,
      "createdAt",
      () => "2026-01-00T12:00:00Z",
    ],
    [
      "an issue creation time with an offset of 24 hours",
      issue,
      "createdAt",
      () => "2026-01-01T12:00:00+24:00",
    ],
    [
      "an issue creation time with an offset of 60 minutes",
      issue,
      "createdAt",
      () => "2026-01-01T12:00:00+01:60",
    ],
    [
      "an issue creation time in lower case",
      issue,
      "createdAt",
      () => "2026-01-01t12:00:00z",
    ],
    [
      "an issue creation time with an expanded year",
      issue,
      "createdAt",
      () => "+002026-01-01T12:00:00Z",
    ],
    [
      "a comment creation time on February 30",
      comments,
      "created_at",
      () => "2024-02-30T12:00:00Z",
    ],
    [
      "a release publish time on November 31",
      releases,
      "published_at",
      () => "2026-11-31T00:00:00Z",
    ],
    [
      "a linked issue repository that is no owner and name",
      issue,
      "nameWithOwner",
      () => "nobody",
    ],
    ["an author without its kind", issue, "__typename", drop],
    ["an empty author login", issue, "login", () => ""],
    ["an empty label name", issue, "name", () => ""],
    ["a label change without its kind", labelChanges, "event", drop],
    ["an actor without its kind", labelChanges, "type", drop],
    ["a negative label change ID", labelChanges, "id", () => -1],
    [
      "a label change time that is no time",
      labelChanges,
      "created_at",
      () => "now",
    ],
    ["a comment without its body", comments, "body", drop],
    ["a comment without its author field", comments, "user", drop],
    [
      "a comment update time that is no time",
      comments,
      "updated_at",
      () => "later",
    ],
    ["a comment URL that is no URL", comments, "html_url", () => "comment"],
    ["an empty comment node ID", comments, "node_id", () => ""],
    ["a head commit that is no commit", pullRequest, "headRefOid", () => "abc"],
    ["an empty head branch", pullRequest, "headRefName", () => ""],
    ["an empty review state", reviews, "state", () => ""],
    ["a review commit that is no commit", reviews, "commit_id", () => "abc"],
    [
      "a submitted review without its submission time",
      reviews,
      "submitted_at",
      drop,
    ],
    ["a review without its body", reviews, "body", drop],
    ["an empty review thread ID", reviewThreads, "id", () => ""],
    ["an empty review thread path", reviewThreads, "path", () => ""],
    ["an empty check name", checks, "name", () => ""],
    ["an empty check status", checks, "status", () => ""],
    [
      "a check completion time that is no time",
      checks,
      "completed_at",
      () => "soon",
    ],
    ["an empty release tag", releases, "tag_name", () => ""],
    ["a release without its name field", releases, "name", drop],
    [
      "a release publish time that is no time",
      releases,
      "published_at",
      () => "today",
    ],
    ["a release ID of 0", releases, "id", () => 0],
    ["a tag target without its kind", tagCommit, "type", drop],
    ["a tag commit that is no commit", tagCommit, "sha", () => "abc"],
    ["a role without its permission", role, "permission", drop],
    ["an empty role name", role, "role_name", () => ""],
    ["a merge commit that is no commit", squashMerge, "sha", () => "merged"],
    ["a label color that is no color", createLabel, "color", () => "red"],
    ["a label without its description field", createLabel, "description", drop],
  ];
  for (const [name, body] of [
    [
      "an unmerged result",
      { sha: head, merged: false, message: "Pull Request is not mergeable" },
    ],
    [
      "a result that does not say it merged",
      { sha: head, message: "Pull Request successfully merged" },
    ],
  ] as const) {
    it(`fails a squash merge with invalidResponse and the status for ${name}`, async () => {
      const { fake, connection } = setup();
      fake.inject({ status: 200, body: JSON.stringify(body) });
      const merge = { expectedHead: head, title: "t", body: "b" };
      await assert.rejects(
        connection.pullRequests.squashMerge(1, merge),
        failure("invalidResponse", (error) => assert.equal(error.status, 200)),
      );
    });
  }

  it("fails the viewer with invalidResponse and the status for a null account", async () => {
    const { fake, connection } = setup();
    fake.inject({ status: 200, body: "null" });
    await assert.rejects(
      connection.access.viewer(),
      failure("invalidResponse", (error) => assert.equal(error.status, 200)),
    );
  });

  for (const [name, read, key, change] of cases) {
    it(`fails with invalidResponse and the status for ${name}`, async () => {
      const { platform, fake } = startGitHub();
      const call = read(platform, platform.connect());
      fake.malformNext({ status: 203, body: everyKey(key, change) });
      await assert.rejects(
        call(),
        failure("invalidResponse", (error) => assert.equal(error.status, 203)),
      );
    });
  }

  it("reads a pending review, which GitHub sends without a submission time", async () => {
    const { platform, fake } = startGitHub();
    const number = platform.addPullRequest({
      headBranch: "feature",
      headCommit: head,
    });
    platform.addReview(number, {
      author: mona,
      state: "PENDING",
      commit: head,
      submittedAt: "2026-01-02T00:00:00Z",
    });
    fake.malformNext({ status: 200, body: everyKey("submitted_at", drop) });
    const [review] = await platform.connect().pullRequests.reviews(number);
    assert.equal(review?.submittedAt, null);
  });

  it("reads null as an empty comment body or release name, and as a deleted account", async () => {
    const { platform, fake } = startGitHub();
    const connection = platform.connect();
    const comment = comments(platform, connection);
    fake.malformNext({
      status: 200,
      body: (json) =>
        everyKey("user", () => null)(everyKey("body", () => null)(json)),
    });
    const [read] = (await comment()) as Comment[];
    assert.equal(read?.body, "");
    assert.equal(read?.author, null);
    const release = releases(platform, connection);
    fake.malformNext({ status: 200, body: everyKey("name", () => null) });
    assert.equal(((await release()) as Release[])[0]?.name, "");
  });
});

describe("GitHub request path encoding", () => {
  it("rejects a value that cannot be encoded, without sending a request", async () => {
    const fake = new GitHubFake(path);
    const credentials = { anonymous: true, token: async () => null };
    const ports = githubAdapter({
      repository: { platform: "github", host: "github.com", path },
      credentials,
      relationshipSections: null,
      fetch: fake.fetch,
      timeoutMs: 1000,
    });
    for (const call of [
      () => ports.issueTracker.removeLabel(1, "\uD800"),
      () => ports.pullRequests.checks("a\uDC00"),
      () => ports.releaseSource.tagCommit("v1/\uD800"),
      () => ports.access.role("\uDFFF"),
      () => ports.access.request({ path: "/\uD800", method: "GET" }),
      () =>
        ports.access.request({
          path: "/user",
          method: "GET",
          query: { q: "\uD800" },
        }),
      () =>
        ports.access.request({
          path: "/user",
          method: "GET",
          query: { "\uD800": "x" },
        }),
      () =>
        ports.access.request({
          path: "/repos/octo/hello/issues/1#typo",
          method: "GET",
        }),
      () => ports.access.request({ path: "/repos\\octo/hello", method: "GET" }),
      () => ports.access.request({ path: "/\\?c", method: "GET" }),
      () => ports.access.request({ path: "/\t/ ", method: "GET" }),
      () =>
        ports.access.request({
          path: "/search/issues?q=x",
          method: "GET",
          query: { page: 2 },
        }),
    ]) {
      await assert.rejects(call(), failure("rejected"));
    }
    assert.equal(fake.requests.length, 0);
  });
});

describe("GitHub paginated transport", () => {
  it("sends the requested query on the first page and the headers and current credential on every page", async () => {
    const { platform, fake } = startGitHub();
    const tokens = ["page-token-1", "page-token-2", "page-token-3"];
    for (const token of tokens)
      fake.tokens.set(token, { login: "octocat", type: "User" });
    platform.serveTransportPages([
      { status: 200, data: [tokens[0]], next: 1 },
      {
        status: 200,
        data: { previous: tokens[0], current: tokens[1] },
        next: 2,
      },
      { status: 200, data: tokens, headers: { "x-echo": tokens.join(",") } },
    ]);
    let tokenIndex = 0;
    const connection = connect(platform.remote, {
      fetch: fake.fetch,
      credential: () => tokens[tokenIndex++],
    });
    const pages = await connection.access.requestPages({
      path: "/contract-pages",
      query: { page: 0, per_page: 10 },
      headers: { "x-custom": "value" },
    });
    assert.deepEqual(
      fake.requests.map((request) => ({
        url: request.url.href,
        method: request.method,
        authorization: request.headers.get("authorization"),
        custom: request.headers.get("x-custom"),
      })),
      [
        {
          url: "https://api.github.com/contract-pages?page=0&per_page=10",
          method: "GET",
          authorization: "Bearer page-token-1",
          custom: "value",
        },
        {
          url: "https://api.github.com/contract-pages?page=1",
          method: "GET",
          authorization: "Bearer page-token-2",
          custom: "value",
        },
        {
          url: "https://api.github.com/contract-pages?page=2",
          method: "GET",
          authorization: "Bearer page-token-3",
          custom: "value",
        },
      ],
    );
    assert.deepEqual(
      pages.map((page) => page.data),
      [
        ["<REDACTED>"],
        { previous: "<REDACTED>", current: "<REDACTED>" },
        ["<REDACTED>", "<REDACTED>", "<REDACTED>"],
      ],
    );
    assert.equal(
      pages[2]!.headers["x-echo"],
      "<REDACTED>,<REDACTED>,<REDACTED>",
    );
  });

  it("rejects every non-GET method before fetching", async () => {
    const { fake, connection } = setup();
    for (const method of [
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ]) {
      await assert.rejects(
        connection.access.requestPages({ path: "/user", method }),
        failure("rejected"),
      );
    }
    assert.equal(fake.requests.length, 0);
  });

  it("detects a loop to the first page after following multiple pages", async () => {
    const { platform, fake } = startGitHub();
    const path = platform.serveTransportPages([
      { status: 200, data: [], next: 1 },
      { status: 203, data: [], next: 0 },
    ]);
    await assert.rejects(
      platform.connect().access.requestPages({ path }),
      failure("invalidResponse", (error) => {
        assert.equal(error.status, 203);
      }),
    );
    assert.equal(fake.requests.length, 2);
  });
});
