// GitHub-specific behavior beyond the contract: how each GitHub response maps
// onto an error reason, and what the adapter sends.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlatformError, connect } from "../../src/index.ts";
import type { PlatformErrorReason } from "../../src/index.ts";
import { GitHubFake } from "./fake.ts";
import type { Injected } from "./fake.ts";

const path = "octo/hello";
const token = "ghp_adapterToken0123456789";

function setup(options: { timeoutMs?: number } = {}) {
  const fake = new GitHubFake(path);
  fake.tokens.set(token, { login: "octocat", type: "User" });
  const connection = connect(`git@github.com:${path}.git`, { credential: token, fetch: fake.fetch, ...options });
  return { fake, connection };
}

const failure = (reason: PlatformErrorReason, check: (error: PlatformError) => void = () => {}) => (error: unknown) => {
  assert.ok(error instanceof PlatformError, `expected a PlatformError, got ${String(error)}`);
  assert.equal(error.reason, reason);
  check(error);
  return true;
};

describe("GitHub response mapping", () => {
  const resetEpoch = 1_900_000_000;
  const resetAt = new Date(resetEpoch * 1000).toISOString();
  const cases: [string, Injected, PlatformErrorReason, ((error: PlatformError) => void)?][] = [
    ["401", { status: 401, body: '{"message":"Bad credentials"}' }, "unauthenticated"],
    ["403", { status: 403, body: '{"message":"Must have admin rights"}' }, "forbidden"],
    [
      "403 with an exhausted primary quota",
      { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetEpoch) }, body: '{"message":"API rate limit exceeded"}' },
      "rateLimited",
      (error) => assert.equal(error.retryAt, resetAt),
    ],
    [
      "403 with only the quota headers saying it is exhausted",
      { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetEpoch) }, body: "" },
      "rateLimited",
      (error) => assert.equal(error.retryAt, resetAt),
    ],
    [
      "429 with an exhausted primary quota",
      { status: 429, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetEpoch) }, body: "{}" },
      "rateLimited",
      (error) => assert.equal(error.retryAt, resetAt),
    ],
    [
      "403 for a secondary limit with Retry-After",
      { status: 403, headers: { "retry-after": "60" }, body: '{"message":"You have exceeded a secondary rate limit"}' },
      "rateLimited",
      (error) => {
        const delay = Date.parse(error.retryAt ?? "") - Date.now();
        assert.ok(delay > 50_000 && delay <= 60_000, `retryAt is about a minute away, not ${delay} ms`);
      },
    ],
    [
      "429 without a stated reset",
      { status: 429, body: '{"message":"Too many requests"}' },
      "rateLimited",
      (error) => assert.equal(error.retryAt, undefined),
    ],
    ["404", { status: 404, body: '{"message":"Not Found"}' }, "notFound"],
    ["410", { status: 410, body: '{"message":"Issues are disabled"}' }, "notFound"],
    ["409", { status: 409, body: '{"message":"Conflict"}' }, "conflict"],
    ["422", { status: 422, body: '{"message":"Validation Failed"}' }, "rejected"],
    ["400", { status: 400, body: '{"message":"Problems parsing JSON"}' }, "rejected"],
    ["500", { status: 500, body: "" }, "unavailable"],
    ["503 with an HTML body", { status: 503, body: "<html>Unicorn!</html>" }, "unavailable"],
    ["a network failure", { network: true }, "unavailable"],
    ["unreadable JSON", { status: 200, body: "{not json" }, "invalidResponse"],
    ["an unreadable shape", { status: 200, body: '{"releases":[]}' }, "invalidResponse"],
  ];
  for (const [name, response, reason, check] of cases) {
    it(`maps ${name} to ${reason}`, async () => {
      const { fake, connection } = setup();
      fake.inject(response);
      await assert.rejects(connection.releaseSource.releases(), failure(reason, check));
    });
  }

  it("maps a timeout to unavailable", async () => {
    const { fake, connection } = setup({ timeoutMs: 20 });
    fake.inject({ hang: true });
    await assert.rejects(connection.releaseSource.releases(), failure("unavailable", (error) => assert.match(error.message, /20 ms/)));
  });

  it("reports the HTTP status on the error", async () => {
    const { fake, connection } = setup();
    fake.inject({ status: 422, body: '{"message":"Validation Failed"}' });
    await assert.rejects(connection.releaseSource.releases(), failure("rejected", (error) => assert.equal(error.status, 422)));
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
      fake.inject({ status: 200, body: JSON.stringify({ data: null, errors: [{ type, message: "nope" }] }) });
      await assert.rejects(connection.issueTracker.issue(1), failure(reason));
    });
  }

  it("fails GraphQL-backed reads with unauthenticated on an anonymous connection", async () => {
    const fake = new GitHubFake(path);
    const connection = connect(`https://github.com/${path}`, { fetch: fake.fetch });
    await assert.rejects(connection.issueTracker.issue(1), failure("unauthenticated"));
  });

  it("fails a credential GitHub rejects with unauthenticated", async () => {
    const fake = new GitHubFake(path);
    const connection = connect(`https://github.com/${path}`, { credential: "ghp_expired", fetch: fake.fetch });
    await assert.rejects(connection.releaseSource.releases(), failure("unauthenticated"));
  });
});

describe("GitHub requests", () => {
  it("authenticate with the token and pin the API version", async () => {
    const { fake, connection } = setup();
    await connection.releaseSource.releases();
    const [request] = fake.requests;
    assert.equal(request?.url.href, `https://api.github.com/repos/${path}/releases?per_page=100`);
    assert.equal(request?.headers.get("authorization"), `Bearer ${token}`);
    assert.equal(request?.headers.get("x-github-api-version"), "2022-11-28");
    assert.equal(request?.headers.get("accept"), "application/vnd.github+json");
  });

  it("keep the connection's credential when a transport request names its own", async () => {
    const { fake, connection } = setup();
    await connection.access.request({ path: "/user", headers: { Authorization: "Bearer someone-else", "X-Extra": "1" } });
    const [request] = fake.requests;
    assert.equal(request?.headers.get("authorization"), `Bearer ${token}`);
    assert.equal(request?.headers.get("x-extra"), "1");
  });

  it("send no credential on an anonymous connection", async () => {
    const fake = new GitHubFake(path);
    await connect(`https://github.com/${path}`, { fetch: fake.fetch }).releaseSource.releases();
    assert.equal(fake.requests[0]?.headers.has("authorization"), false);
  });

  it("never follow a next page off GitHub's API", async () => {
    const { fake, connection } = setup();
    fake.inject({ status: 200, headers: { link: '<https://elsewhere.example/releases?page=2>; rel="next"' }, body: "[]" });
    await assert.rejects(connection.releaseSource.releases(), failure("invalidResponse"));
    assert.equal(fake.requests.length, 1);
  });

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
    assert.deepEqual((await connection.issueTracker.issue(1)).author, { login: "dependabot[bot]", bot: true });
  });

  it("send the expected head with a squash merge", async () => {
    const { fake, connection } = setup();
    fake.inject({ status: 200, body: JSON.stringify({ sha: "f".repeat(40), merged: true }) });
    await connection.pullRequests.squashMerge(3, { expectedHead: "a".repeat(40), title: "feat: x (#3)", body: "Closes #1" });
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
    const previous = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, GH_TOKEN: process.env.GH_TOKEN };
    process.env.GITHUB_TOKEN = "ghp_fromEnvironment";
    process.env.GH_TOKEN = "ghp_fromEnvironment";
    try {
      const fake = new GitHubFake(path);
      await connect(`https://github.com/${path}`, { fetch: fake.fetch }).releaseSource.releases();
      assert.equal(fake.requests[0]?.headers.has("authorization"), false);
      assert.equal(await connect(`https://github.com/${path}`, { fetch: fake.fetch }).access.viewer(), null);
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
