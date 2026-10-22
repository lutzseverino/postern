import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createConnection } from "../src/connection.ts";
import type { AdapterContext, AdapterPorts, PlatformAdapter } from "../src/connection.ts";
import { PlatformError, connect } from "../src/index.ts";
import type { Issue, IssueTrackerCapabilities } from "../src/index.ts";

const repository = { platform: "github", host: "github.com", path: "octo/hello" } as const;

const isReason = (reason: string) => (error: unknown) =>
  error instanceof PlatformError && error.reason === reason;

const sampleIssue: Issue = {
  number: 7,
  id: 70,
  nodeId: "I_7",
  url: "https://example.test/7",
  state: "open",
  title: "Seven",
  body: "## Parent\n\n#1",
  author: { login: "mona", bot: false },
  labels: [],
  createdAt: "2026-01-01T00:00:00Z",
  parent: { repository: "octo/hello", number: 1, state: "open" },
  subIssues: [{ repository: "octo/hello", number: 8, state: "closed" }],
  blockedBy: [{ repository: "octo/hello", number: 2, state: "open" }],
  bodyEditTime: "2026-01-02T00:00:00Z",
  linkTime: "2026-01-03T00:00:00Z",
};

// A test double adapter that offers only the flags it is given and reports
// every relationship and time it holds, so the shared layer's handling of
// absent flags shows in the results.
function doubleAdapter(
  issueFlags: IssueTrackerCapabilities,
  seen: AdapterContext[] = [],
): (context: AdapterContext) => AdapterPorts {
  return (context) => {
    seen.push(context);
    const unexpected = () => Promise.reject(new Error("not used by this test"));
    return {
      issueTracker: {
        capabilities: issueFlags,
        issues: async () => [structuredClone(sampleIssue)],
        issue: async () => structuredClone(sampleIssue),
        issueEvent: unexpected,
        labelChanges: unexpected,
        comments: unexpected,
        addLabels: unexpected,
        removeLabel: unexpected,
        createLabel: unexpected,
        labels: unexpected,
        updateLabel: unexpected,
        createComment: unexpected,
        updateComment: unexpected,
        closeIssue: unexpected,
      },
      pullRequests: {
        capabilities: {},
        byHeadBranch: unexpected,
        closing: async () => {
          throw new Error("the adapter must not be called without its flag");
        },
        pullRequest: unexpected,
        reviews: async () => [
          {
            id: 1,
            author: null,
            state: "APPROVED",
            body: "",
            commit: "abc",
            submittedAt: "2026-01-01T00:00:00Z",
          },
        ],
        reviewThreads: unexpected,
        checks: unexpected,
        mergesThroughQueue: unexpected,
        comment: unexpected,
        squashMerge: unexpected,
      },
      releaseSource: {
        capabilities: {},
        releases: async () => [
          { id: 1, tag: "v1.0.0", name: "1.0.0", draft: false, prerelease: false, publishedAt: null },
        ],
        tagCommit: unexpected,
      },
      access: {
        capabilities: {},
        viewer: async () => {
          const token = await context.credentials.token();
          throw new Error(`viewer failed for token ${token}`);
        },
        role: unexpected,
        requestPages: unexpected,
        request: async (request) => ({ status: 200, headers: {}, data: { ...request } }),
      },
    };
  };
}

describe("connect", () => {
  it("exposes the four ports for a GitHub remote", () => {
    const connection = connect("git@github.com:octo/hello.git", { credential: "t0ken-value" });
    assert.deepEqual(connection.repository, repository);
    for (const port of ["issueTracker", "pullRequests", "releaseSource", "access"] as const) {
      assert.equal(typeof connection[port], "object");
      assert.equal(typeof connection[port].capabilities, "object");
    }
  });

  it("accepts a repository identity", () => {
    assert.deepEqual(connect(repository).repository, repository);
  });

  it("treats relationshipSections set to undefined as absent", () => {
    assert.doesNotThrow(() => connect(repository, { relationshipSections: undefined } as never));
  });

  it("fails with unsupported for another platform's remote", () => {
    assert.throws(() => connect("https://gitlab.com/group/sub/project.git"), isReason("unsupported"));
    assert.throws(
      () => connect({ platform: "gitlab", host: "gitlab.com", path: "a/b" } as never),
      isReason("unsupported"),
    );
  });

  for (const path of ["octo/hello/extra", "octo/hello/tree/main", "octo/..", "octo/hello world", "octo/he%llo"]) {
    it(`rejects the GitHub repository path ${path}`, () => {
      assert.throws(() => connect({ ...repository, path }), isReason("rejected"));
    });
  }

  it("fails with unsupported for a GitHub identity on a host no adapter serves", () => {
    for (const host of ["github.example.com", "gitlab.com"]) {
      assert.throws(() => connect({ ...repository, host }), isReason("unsupported"));
    }
  });

  it("reports a GitHub identity on its canonical host", () => {
    assert.deepEqual(connect({ ...repository, host: "GitHub.com" }).repository, repository);
  });

  for (const platform of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    it(`fails with unsupported for the platform name ${platform}`, () => {
      assert.throws(() => connect({ ...repository, platform } as never), isReason("unsupported"));
    });
  }

  for (const timeoutMs of [1.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31, "1000"]) {
    it(`rejects timeoutMs ${String(timeoutMs)}`, () => {
      assert.throws(() => connect(repository, { timeoutMs } as never), isReason("rejected"));
    });
  }

  it("accepts the longest timeout a timer supports", () => {
    assert.doesNotThrow(() => connect(repository, { timeoutMs: 2 ** 31 - 1 }));
  });

  for (const relationshipSections of [
    { parent: "", blockedBy: "Blocked by" },
    { parent: "Parent", blockedBy: "  " },
    { parent: "Parent" },
    { parent: 1, blockedBy: "Blocked by" },
    "Parent",
    null,
  ]) {
    it(`rejects relationshipSections ${JSON.stringify(relationshipSections)}`, () => {
      assert.throws(
        () => connect(repository, { relationshipSections } as never),
        isReason("rejected"),
      );
    });
  }

  for (const credential of ["", 42, { token: "x" }]) {
    it(`rejects the credential source ${JSON.stringify(credential)}`, () => {
      assert.throws(() => connect(repository, { credential } as never), isReason("rejected"));
    });
  }
});

describe("the shared port layer", () => {
  it("reports native relationships and times when the adapter offers every flag", async () => {
    const all = { nativeParent: true, nativeBlockers: true, bodyEditTime: true, linkTime: true, botMarking: true } as const;
    const connection = createConnection(repository, doubleAdapter(all), {});
    assert.deepEqual(await connection.issueTracker.issue(7), sampleIssue);
  });

  it("reports no relationships for a platform without native links when no sections are named", async () => {
    const connection = createConnection(repository, doubleAdapter({}), {});
    const issue = await connection.issueTracker.issue(7);
    assert.equal(issue.parent, null);
    assert.deepEqual(issue.subIssues, []);
    assert.deepEqual(issue.blockedBy, []);
  });

  it("passes named sections to an adapter without native links and keeps what it reads", async () => {
    const seen: AdapterContext[] = [];
    const sections = { parent: "Parent", blockedBy: "Blocked by" };
    const connection = createConnection(repository, doubleAdapter({}, seen), {
      relationshipSections: sections,
    });
    const [issue] = await connection.issueTracker.issues();
    assert.deepEqual(seen[0]?.relationshipSections, sections);
    assert.deepEqual(issue?.parent, sampleIssue.parent);
    assert.deepEqual(issue?.blockedBy, sampleIssue.blockedBy);
  });

  it("builds the connection from the options it validated, reading each once", async () => {
    const seen: AdapterContext[] = [];
    const reads = new Map<PropertyKey, number>();
    // Every option, and every section name, passes the checks on its first
    // read and would not on any later one.
    const onceValid = (values: Record<string, unknown>) =>
      new Proxy(values, {
        get(target, key) {
          const count = (reads.get(key) ?? 0) + 1;
          reads.set(key, count);
          return count === 1 ? target[key as string] : 0;
        },
      });
    const fetch = async () => new Response("{}");
    createConnection(
      repository,
      doubleAdapter({}, seen),
      onceValid({
        credential: "t0ken-value",
        relationshipSections: onceValid({ parent: "Parent", blockedBy: "Blocked by" }),
        fetch,
        timeoutMs: 1000,
      }),
    );
    const [context] = seen;
    assert.deepEqual(context?.relationshipSections, { parent: "Parent", blockedBy: "Blocked by" });
    assert.equal(context?.fetch, fetch);
    assert.equal(context?.timeoutMs, 1000);
    assert.equal(await context?.credentials.token(), "t0ken-value");
    assert.deepEqual(Object.fromEntries(reads), {
      credential: 1,
      relationshipSections: 1,
      fetch: 1,
      timeoutMs: 1,
      parent: 1,
      blockedBy: 1,
    });
  });

  it("reports null for times and bot marking whose flags are absent", async () => {
    const connection = createConnection(repository, doubleAdapter({ nativeParent: true }), {});
    const issue = await connection.issueTracker.issue(7);
    assert.equal(issue.bodyEditTime, null);
    assert.equal(issue.linkTime, null);
    assert.deepEqual(issue.author, { login: "mona", bot: null });
    const [review] = await connection.pullRequests.reviews(1);
    assert.equal(review?.commit, null);
    const [release] = await connection.releaseSource.releases();
    assert.equal(release?.draft, null);
    assert.equal(release?.prerelease, null);
  });

  it("reports and honors only known flags that are exactly true", async () => {
    const flags = { nativeParent: 1, nativeBlockers: "yes", bodyEditTime: true, linkTime: false, botMarking: {}, extra: true };
    const connection = createConnection(repository, doubleAdapter(flags as never), {});
    assert.deepEqual(connection.issueTracker.capabilities, { bodyEditTime: true });
    const issue = await connection.issueTracker.issue(7);
    assert.equal(issue.parent, null);
    assert.deepEqual(issue.subIssues, []);
    assert.deepEqual(issue.blockedBy, []);
    assert.equal(issue.bodyEditTime, sampleIssue.bodyEditTime);
    assert.equal(issue.linkTime, null);
    assert.deepEqual(issue.author, { login: "mona", bot: null });
  });

  it("fails with unsupported when an operation's capability is absent", async () => {
    const connection = createConnection(repository, doubleAdapter({}), {});
    await assert.rejects(connection.pullRequests.closing(7), isReason("unsupported"));
  });

  it("rejects invalid arguments before calling the adapter", async () => {
    const connection = createConnection(repository, doubleAdapter({}), {});
    await assert.rejects(connection.issueTracker.issue(0), isReason("rejected"));
    await assert.rejects(connection.issueTracker.issue(1.5), isReason("rejected"));
    await assert.rejects(connection.issueTracker.addLabels(1, []), isReason("rejected"));
    await assert.rejects(connection.issueTracker.removeLabel(1, ""), isReason("rejected"));
    await assert.rejects(connection.pullRequests.byHeadBranch(""), isReason("rejected"));
  });

  for (const method of ["BAD METHOD", "CONNECT", "TRACE", "", 42]) {
    it(`rejects the transport method ${JSON.stringify(method)} before calling the adapter`, async () => {
      const connection = createConnection(repository, doubleAdapter({}), {});
      await assert.rejects(connection.access.request({ path: "/user", method } as never), isReason("rejected"));
      await assert.rejects(connection.access.requestPages({ path: "/user", method } as never), isReason("rejected"));
    });
  }

  it("passes each supported transport method to the adapter in upper case", async () => {
    const connection = createConnection(repository, doubleAdapter({}), {});
    for (const method of ["get", "HEAD", "post", "PUT", "Patch", "DELETE", "OPTIONS"]) {
      const response = await connection.access.request({ path: "/user", method });
      assert.equal((response.data as { method: string }).method, method.toUpperCase());
    }
  });

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const nestedCycle: Record<string, unknown> = { items: [] };
  (nestedCycle.items as unknown[]).push({ owner: nestedCycle });
  for (const [name, request] of [
    ["a body on a GET", { path: "/user", body: { a: 1 } }],
    ["a body on a HEAD", { path: "/user", method: "HEAD", body: "x" }],
    ["a circular body", { path: "/user", method: "POST", body: circular }],
    ["a body with a nested cycle", { path: "/user", method: "POST", body: nestedCycle }],
    ["a BigInt body", { path: "/user", method: "POST", body: { n: 1n } }],
    ["a function body", { path: "/user", method: "POST", body: () => 1 }],
    ["a NaN body", { path: "/user", method: "POST", body: Number.NaN }],
    ["an undefined body field", { path: "/user", method: "POST", body: { x: undefined, n: 1 } }],
    ["a NaN body field", { path: "/user", method: "POST", body: { n: Number.NaN } }],
    ["an infinite body item", { path: "/user", method: "POST", body: [Number.POSITIVE_INFINITY] }],
    ["a negative zero body", { path: "/user", method: "POST", body: -0 }],
    ["a negative zero body field", { path: "/user", method: "POST", body: { a: { n: -0 } } }],
    ["a negative zero body item", { path: "/user", method: "POST", body: [1, -0] }],
    ["an undefined body item", { path: "/user", method: "POST", body: [undefined] }],
    ["a sparse body array", { path: "/user", method: "POST", body: [1, , 2] }],
    ["a nested function", { path: "/user", method: "POST", body: { a: { f: () => 1 } } }],
    ["a nested symbol", { path: "/user", method: "POST", body: { a: [Symbol("s")] } }],
    ["a symbol key", { path: "/user", method: "POST", body: { [Symbol("s")]: 1 } }],
    ["a nested BigInt", { path: "/user", method: "POST", body: [{ n: 1n }] }],
    ["a Date in the body", { path: "/user", method: "POST", body: { at: new Date(0) } }],
    ["a Map in the body", { path: "/user", method: "POST", body: { m: new Map([["a", 1]]) } }],
    ["a boxed number in the body", { path: "/user", method: "POST", body: { n: new Number(1) } }],
    ["an object with toJSON in the body", { path: "/user", method: "POST", body: { a: { toJSON: () => 1 } } }],
    ["a string query", { path: "/user", query: "a=1" }],
    ["a Map query", { path: "/user", query: new Map([["a", "1"]]) }],
    ["an object query value", { path: "/user", query: { a: { b: 1 } } }],
    ["a non-finite query value", { path: "/user", query: { a: Number.NaN } }],
    ["an array of headers", { path: "/user", headers: [["x-a", "1"]] }],
    ["a Headers instance", { path: "/user", headers: new Headers({ "x-a": "1" }) }],
    ["a number header value", { path: "/user", headers: { "x-a": 1 } }],
    ["an invalid header name", { path: "/user", headers: { "bad name": "1" } }],
    ["a header value with a line break", { path: "/user", headers: { "x-a": "1\r\nx-b: 2" } }],
    ["a header value with a leading space", { path: "/user", headers: { "x-a": " 1" } }],
    ["a header value with a trailing tab", { path: "/user", headers: { "x-a": "1\t" } }],
    ["a header value that is only a line break", { path: "/user", headers: { "x-a": "\r\n" } }],
    ["a header value with a control character", { path: "/user", headers: { "x-a": "a\u0001b" } }],
    ["a header value with a delete character", { path: "/user", headers: { "x-a": "a\u007fb" } }],
    ["header names that differ only in case", { path: "/user", headers: { "X-A": "1", "x-a": "2" } }],
    ["its own authorization header", { path: "/user", headers: { Authorization: "Bearer someone-else" } }],
    ["a connection header", { path: "/user", headers: { connection: "x" } }],
    ["a host header", { path: "/user", headers: { Host: "elsewhere.example" } }],
    ["a content length header", { path: "/user", method: "POST", body: {}, headers: { "content-length": "5" } }],
    ["a transfer encoding header", { path: "/user", method: "POST", body: {}, headers: { "transfer-encoding": "chunked" } }],
    ["an expect header", { path: "/user", method: "POST", body: {}, headers: { expect: "100-continue" } }],
    ["an upgrade header", { path: "/user", headers: { upgrade: "websocket" } }],
    ["a keep-alive header", { path: "/user", headers: { "keep-alive": "timeout=5" } }],
    ["a fragment in the path", { path: "/repos/octo/hello/issues/1#typo" }],
    ["an empty fragment in the path", { path: "/user#" }],
    ["a backslash in the path", { path: "/repos\\octo/hello" }],
    ["a tab in the path", { path: "/us\ter" }],
    ["a path a URL cannot hold: a backslash after the first slash", { path: "/\\?c" }],
    ["a path a URL cannot hold: a tab after the first slash", { path: "/\t/ " }],
    ["a path a URL reads as a host: a line break after the first slash", { path: "/\n/v1.0/x" }],
    ["a line break in the path", { path: "/user\n" }],
    ["a space in the path", { path: "/search/issues?q=is:open label:bug" }],
    ["a trailing space in the path", { path: "/user " }],
    ["a control character in the path", { path: "/user\u0000" }],
    ["a delete character in the path", { path: "/us\u007fer" }],
    ["a non-ASCII character in the path", { path: "/repos/octo/caf\u00e9" }],
    ["a dot segment in the path", { path: "/repos/octo/hello/../other" }],
    ["a percent-encoded dot segment in the path", { path: "/repos/octo/hello/%2e%2E/other" }],
    ["an empty query string in the path", { path: "/user?" }],
    ["a query string in the path beside a query", { path: "/search/issues?q=x", query: { page: 2 } }],
    ["an array body with a symbol key", { path: "/user", method: "POST", body: Object.assign([1], { [Symbol("s")]: 2 }) }],
    ["an array body with a named field", { path: "/user", method: "POST", body: Object.assign([1], { extra: 2 }) }],
    [
      "an array body with a hidden named field",
      { path: "/user", method: "POST", body: Object.defineProperty([1], "extra", { value: 2, enumerable: false }) },
    ],
    ["a nested array with a symbol key", { path: "/user", method: "POST", body: { a: Object.assign([], { [Symbol("s")]: 1 }) } }],
  ] as const) {
    it(`rejects a transport request with ${name} before calling the adapter`, async () => {
      const connection = createConnection(repository, doubleAdapter({}), {});
      await assert.rejects(connection.access.request(request as never), isReason("rejected"));
      await assert.rejects(connection.access.requestPages(request as never), isReason("rejected"));
    });
  }

  it("forwards a path with a query string exactly as given", async () => {
    const connection = createConnection(repository, doubleAdapter({}), {});
    const path = "/search/issues?q=repo:octo/hello+is:open&sort=created|a[1]=%zz";
    const response = await connection.access.request({ path });
    assert.equal((response.data as { path: string }).path, path);
  });

  it("rejects labels given as an array with a symbol key or a named field before calling the adapter", async () => {
    const connection = createConnection(repository, doubleAdapter({}), {});
    await assert.rejects(connection.issueTracker.addLabels(1, Object.assign(["bug"], { [Symbol("s")]: "x" })), isReason("rejected"));
    await assert.rejects(connection.issueTracker.addLabels(1, Object.assign(["bug"], { more: "x" })), isReason("rejected"));
  });

  it("accepts JSON bodies with shared references, null prototypes and every JSON type", async () => {
    const connection = createConnection(repository, doubleAdapter({}), {});
    const shared = { a: 1 };
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { b: "x" });
    const body = { one: shared, two: [shared], bare, list: [null, true, 0, 1.5, "s", []] };
    const response = await connection.access.request({ path: "/user", method: "POST", body });
    assert.equal(JSON.stringify((response.data as { body: unknown }).body), JSON.stringify(body));
  });

  it("forwards a copy of the body it validated, reading each field once", async () => {
    const connection = createConnection(repository, doubleAdapter({}), {});
    let reads = 0;
    const body = {
      get title() {
        reads += 1;
        return reads === 1 ? "checked" : undefined;
      },
    };
    const response = await connection.access.request({ path: "/user", method: "POST", body });
    const forwarded = (response.data as { body: unknown }).body;
    assert.notEqual(forwarded, body);
    assert.equal(JSON.stringify(forwarded), '{"title":"checked"}');
    assert.equal(reads, 1);
  });

  it("forwards copies of the query and headers it validated", async () => {
    const connection = createConnection(repository, doubleAdapter({}), {});
    let reads = 0;
    const query = {
      get page() {
        reads += 1;
        return reads === 1 ? 2 : { not: "scalar" };
      },
    };
    const response = await connection.access.request({ path: "/user", query } as never);
    assert.deepEqual((response.data as { query: unknown }).query, { page: 2 });
    assert.equal(reads, 1);
  });

  it("passes the adapter the arguments it checked, reading each field once", async () => {
    const calls: unknown[] = [];
    const recording = (context: AdapterContext): AdapterPorts => {
      const ports = doubleAdapter({})(context);
      return {
        ...ports,
        issueTracker: {
          ...ports.issueTracker,
          issues: async (filter) => (calls.push(filter), []),
          addLabels: async (_number, labels) => void calls.push(labels),
          createLabel: async (label) => (calls.push(label), label),
        },
        pullRequests: { ...ports.pullRequests, squashMerge: async (_number, merge) => (calls.push(merge), "c0ffee") },
      };
    };
    // A field whose first read passes the checks and whose later reads would not.
    const flipping = <T extends object>(target: T, key: PropertyKey, first: unknown): T => {
      let reads = 0;
      return Object.defineProperty(target, key, { enumerable: true, get: () => (++reads === 1 ? first : 42) });
    };
    const connection = createConnection(repository, recording, {});
    await connection.issueTracker.issues(flipping({}, "state", "closed"));
    await connection.issueTracker.addLabels(7, flipping([""], 0, "bug"));
    await connection.issueTracker.createLabel(flipping({ color: "ededed", description: "" }, "name", "bug") as never);
    await connection.pullRequests.squashMerge(7, flipping({ title: "t", body: "b" }, "expectedHead", "abc") as never);
    assert.deepEqual(calls, [
      { state: "closed" },
      ["bug"],
      { name: "bug", color: "ededed", description: "" },
      { expectedHead: "abc", title: "t", body: "b" },
    ]);
  });

  it("turns an unexpected adapter failure into invalidResponse without the credential", async () => {
    const connection = createConnection(repository, doubleAdapter({}), { credential: "t0ken-value" });
    await assert.rejects(connection.access.viewer(), (error) => {
      assert.ok(error instanceof PlatformError);
      assert.equal(error.reason, "invalidResponse");
      assert.doesNotMatch(error.message, /t0ken-value/);
      assert.doesNotMatch(String((error.cause as Error | undefined)?.message), /t0ken-value/);
      return true;
    });
  });

  it("fails with unauthenticated when the credential function returns no token or throws", async () => {
    for (const credential of [() => undefined, () => "", async () => null, () => {
      throw new Error("vault said t0ken-value");
    }]) {
      const connection = createConnection(repository, doubleAdapter({}), { credential });
      await assert.rejects(connection.access.viewer(), (error) => {
        assert.ok(isReason("unauthenticated")(error));
        assert.doesNotMatch(JSON.stringify(error, Object.getOwnPropertyNames(error)), /t0ken-value/);
        return true;
      });
    }
  });

  it("calls the credential function for each token it needs", async () => {
    let calls = 0;
    const connection = createConnection(repository, doubleAdapter({}), {
      credential: () => `t0ken-${++calls}`,
    });
    await assert.rejects(connection.access.viewer());
    await assert.rejects(connection.access.viewer(), (error: Error) => {
      assert.doesNotMatch(error.message, /t0ken-2/);
      return true;
    });
    assert.equal(calls, 2);
  });

  it("leaves no part of a rotated credential that extends an earlier one", async () => {
    const tokens = ["t0ken", "t0ken-rotated"];
    const connection = createConnection(repository, doubleAdapter({}), { credential: () => tokens.shift() });
    await assert.rejects(connection.access.viewer());
    await assert.rejects(connection.access.viewer(), (error: Error) => {
      assert.equal(error.cause instanceof Error && error.cause.message, "viewer failed for token <REDACTED>");
      return true;
    });
  });
});

describe("reading what callers pass", () => {
  // A Proxy whose fields each pass the checks on their first read and fail
  // them on any later one. It records every field's reads in `reads`.
  const fickle = <T extends object>(target: T, reads: Map<PropertyKey, number>[]): T => {
    const counts = new Map<PropertyKey, number>();
    reads.push(counts);
    return new Proxy(target, {
      get(object, key) {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return count === 1 ? Reflect.get(object, key) : Symbol("changed");
      },
    });
  };
  const readOnce = (reads: Map<PropertyKey, number>[]) => {
    for (const counts of reads) {
      for (const [key, count] of counts) assert.equal(count, 1, `${String(key)} was read ${count} times`);
    }
  };
  const boom = () => {
    throw new TypeError("unreadable");
  };
  // A Proxy every inspection of which throws, and a revoked one.
  const hostile = () =>
    new Proxy({}, { get: boom, has: boom, ownKeys: boom, getOwnPropertyDescriptor: boom, getPrototypeOf: boom });
  const revoked = () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    return proxy;
  };

  // A test double that records the arguments every operation receives.
  function recordingAdapter(calls: unknown[][]): PlatformAdapter {
    return (context) => {
      const ports = doubleAdapter({ nativeParent: true, nativeBlockers: true }, [])(context);
      const record =
        <T>(result: T) =>
        async (...args: unknown[]) => (calls.push(args), structuredClone(result));
      return {
        issueTracker: {
          ...ports.issueTracker,
          capabilities: { nativeParent: true, nativeBlockers: true },
          issues: record([]),
          addLabels: record(undefined),
          createLabel: record({ name: "bug", color: "ededed", description: "" }),
          updateLabel: record({ name: "bug", color: "ededed", description: "" }),
        },
        pullRequests: {
          ...ports.pullRequests,
          capabilities: { closingReferences: true },
          squashMerge: record("c0ffee"),
        },
        releaseSource: ports.releaseSource,
        access: {
          ...ports.access,
          request: record({ status: 200, headers: {}, data: null }),
          requestPages: record([{ status: 200, headers: {}, data: null }]),
        },
      };
    };
  }

  it("reads a repository identity once and uses what it read", () => {
    const reads: Map<PropertyKey, number>[] = [];
    const connection = connect(fickle({ platform: "github", host: "GitHub.com", path: "octo/hello" } as const, reads));
    assert.deepEqual(connection.repository, repository);
    readOnce(reads);
  });

  it("reads the connection options once and uses what it read", async () => {
    const reads: Map<PropertyKey, number>[] = [];
    const seen: AdapterContext[] = [];
    const fetch = async () => new Response("{}");
    const options = () =>
      fickle(
        {
          credential: "t0ken-value",
          relationshipSections: fickle({ parent: "Parent", blockedBy: "Blocked by" }, reads),
          fetch,
          timeoutMs: 1000,
        },
        reads,
      );
    assert.doesNotThrow(() => connect(repository, options()));
    createConnection(repository, doubleAdapter({}, seen), options());
    assert.deepEqual(seen[0]?.relationshipSections, { parent: "Parent", blockedBy: "Blocked by" });
    assert.equal(seen[0]?.fetch, fetch);
    assert.equal(seen[0]?.timeoutMs, 1000);
    assert.equal(await seen[0]?.credentials.token(), "t0ken-value");
    readOnce(reads);
  });

  it("reads every argument object of every operation once and passes on what it read", async () => {
    const reads: Map<PropertyKey, number>[] = [];
    const calls: unknown[][] = [];
    const connection = createConnection(repository, recordingAdapter(calls), {});
    await connection.issueTracker.issues(fickle({ state: "closed", label: "bug" } as const, reads));
    await connection.issueTracker.addLabels(7, fickle(["bug", "help"], reads));
    await connection.issueTracker.createLabel(fickle({ name: "bug", color: "ededed", description: "" }, reads));
    await connection.issueTracker.updateLabel("old", fickle({ name: "bug", color: "ededed", description: "" }, reads));
    await connection.pullRequests.squashMerge(7, fickle({ expectedHead: "abc", title: "t", body: "b" }, reads));
    await connection.access.request(
      fickle(
        {
          path: "/user",
          method: "post",
          query: fickle({ page: 2 }, reads),
          headers: fickle({ "x-a": "1" }, reads),
          body: fickle({ items: fickle([1, fickle({ n: "x" }, reads)], reads) }, reads),
        },
        reads,
      ),
    );
    await connection.access.requestPages(fickle({
      path: "/user", method: "get", query: fickle({ page: 1 }, reads), headers: fickle({ "x-a": "1" }, reads),
    }, reads));
    assert.deepEqual(calls, [
      [{ state: "closed", label: "bug" }],
      [7, ["bug", "help"]],
      [{ name: "bug", color: "ededed", description: "" }],
      ["old", { name: "bug", color: "ededed", description: "" }],
      [7, { expectedHead: "abc", title: "t", body: "b" }],
      [{ path: "/user", method: "POST", query: { page: 2 }, headers: { "x-a": "1" }, body: { items: [1, { n: "x" }] } }],
      [{ path: "/user", method: "GET", query: { page: 1 }, headers: { "x-a": "1" } }],
    ]);
    readOnce(reads);
  });

  for (const [name, unreadable] of [
    ["a Proxy that throws", hostile],
    ["a revoked Proxy", revoked],
  ] as const) {
    it(`fails connect with rejected for ${name}`, () => {
      assert.throws(() => connect(unreadable() as never), isReason("rejected"));
      assert.throws(() => connect(repository, unreadable() as never), isReason("rejected"));
      assert.throws(
        () => connect(repository, { relationshipSections: unreadable() } as never),
        isReason("rejected"),
      );
    });

    it(`fails every operation with rejected for ${name} in any argument`, async () => {
      const calls: unknown[][] = [];
      const connection = createConnection(repository, recordingAdapter(calls), {});
      const { issueTracker: issues, pullRequests: pulls, releaseSource: releases, access } = connection;
      const value = unreadable as () => never;
      const operations: [string, () => Promise<unknown>][] = [
        ["issues", () => issues.issues(value())],
        ["issue", () => issues.issue(value())],
        ["labelChanges", () => issues.labelChanges(value())],
        ["comments", () => issues.comments(value())],
        ["addLabels number", () => issues.addLabels(value(), ["bug"])],
        ["addLabels labels", () => issues.addLabels(1, value())],
        ["addLabels label", () => issues.addLabels(1, [value()])],
        ["removeLabel number", () => issues.removeLabel(value(), "bug")],
        ["removeLabel label", () => issues.removeLabel(1, value())],
        ["createLabel", () => issues.createLabel(value())],
        ["createComment number", () => issues.createComment(value(), "x")],
        ["createComment body", () => issues.createComment(1, value())],
        ["updateComment id", () => issues.updateComment(value(), "x")],
        ["updateComment body", () => issues.updateComment(1, value())],
        ["closeIssue", () => issues.closeIssue(value())],
        ["byHeadBranch", () => pulls.byHeadBranch(value())],
        ["closing", () => pulls.closing(value())],
        ["pullRequest", () => pulls.pullRequest(value())],
        ["reviews", () => pulls.reviews(value())],
        ["reviewThreads", () => pulls.reviewThreads(value())],
        ["checks", () => pulls.checks(value())],
        ["mergesThroughQueue", () => pulls.mergesThroughQueue(value())],
        ["comment number", () => pulls.comment(value(), "x")],
        ["comment body", () => pulls.comment(1, value())],
        ["squashMerge number", () => pulls.squashMerge(value(), { expectedHead: "a", title: "t", body: "" })],
        ["squashMerge merge", () => pulls.squashMerge(1, value())],
        ["tagCommit", () => releases.tagCommit(value())],
        ["role", () => access.role(value())],
        ["request", () => access.request(value())],
        ["request query", () => access.request({ path: "/user", query: value() })],
        ["request headers", () => access.request({ path: "/user", headers: value() })],
        ["request body", () => access.request({ path: "/user", method: "POST", body: value() })],
        ["request body item", () => access.request({ path: "/user", method: "POST", body: [value()] })],
        ["request body field", () => access.request({ path: "/user", method: "POST", body: { a: value() } })],
      ];
      for (const [operation, call] of operations) {
        await assert.rejects(call(), isReason("rejected"), operation);
      }
      assert.deepEqual(calls, []);
    });
  }

  // A string with an unpaired surrogate has no UTF-8 form, so a request
  // carrying it in a path, query, header or body would change or refuse it.
  for (const [where, lone] of [
    ["a high", "\uD800"],
    ["a low", "x\uDC00y"],
    ["a reversed pair's", "\uDC00\uD800"],
  ] as const) {
    it(`fails every operation with rejected for ${where} unpaired surrogate in any string it sends`, async () => {
      const calls: unknown[][] = [];
      const connection = createConnection(repository, recordingAdapter(calls), {});
      const { issueTracker: issues, pullRequests: pulls, releaseSource: releases, access } = connection;
      const merge = { expectedHead: "a", title: "t", body: "" };
      const operations: [string, () => Promise<unknown>][] = [
        ["issues label", () => issues.issues({ label: lone })],
        ["addLabels label", () => issues.addLabels(1, ["bug", lone])],
        ["removeLabel label", () => issues.removeLabel(1, lone)],
        ["createLabel name", () => issues.createLabel({ name: lone, color: "ededed", description: "" })],
        ["createLabel description", () => issues.createLabel({ name: "bug", color: "ededed", description: lone })],
        ["createComment body", () => issues.createComment(1, lone)],
        ["updateComment body", () => issues.updateComment(1, lone)],
        ["byHeadBranch", () => pulls.byHeadBranch(lone)],
        ["checks", () => pulls.checks(lone)],
        ["comment body", () => pulls.comment(1, lone)],
        ["squashMerge expectedHead", () => pulls.squashMerge(1, { ...merge, expectedHead: lone })],
        ["squashMerge title", () => pulls.squashMerge(1, { ...merge, title: lone })],
        ["squashMerge body", () => pulls.squashMerge(1, { ...merge, body: lone })],
        ["tagCommit", () => releases.tagCommit(lone)],
        ["role", () => access.role(lone)],
        ["request path", () => access.request({ path: `/${lone}` })],
        ["request method", () => access.request({ path: "/user", method: `GET${lone}` })],
        ["request query key", () => access.request({ path: "/user", query: { [lone]: "1" } })],
        ["request query value", () => access.request({ path: "/user", query: { q: lone } })],
        ["request header name", () => access.request({ path: "/user", headers: { [`x-${lone}`]: "1" } })],
        ["request header value", () => access.request({ path: "/user", headers: { "x-a": lone } })],
        ["request body string", () => access.request({ path: "/user", method: "POST", body: lone })],
        ["request body key", () => access.request({ path: "/user", method: "POST", body: { [lone]: 1 } })],
        ["request body item", () => access.request({ path: "/user", method: "POST", body: { a: [1, { b: lone }] } })],
      ];
      for (const [operation, call] of operations) {
        await assert.rejects(call(), isReason("rejected"), operation);
      }
      assert.deepEqual(calls, []);
    });

    it(`fails with rejected for a credential with ${where} unpaired surrogate`, async () => {
      assert.throws(() => connect(repository, { credential: `ghp_${lone}` }), isReason("rejected"));
      const seen: AdapterContext[] = [];
      createConnection(repository, doubleAdapter({}, seen), { credential: async () => `ghp_${lone}` });
      await assert.rejects(seen[0]!.credentials.token(), isReason("rejected"));
    });
  }

  // `Headers` trims spaces and tabs at either end of a value, so such a
  // credential would be sent as another token than the one kept for redaction.
  for (const [where, token] of [
    ["a leading space", " ghp_abc"],
    ["a trailing space", "ghp_abc "],
    ["a leading tab", "\tghp_abc"],
    ["a trailing tab", "ghp_abc\t"],
  ] as const) {
    it(`fails with rejected before any request for a credential with ${where}`, async () => {
      let fetched = 0;
      const fetch = async () => {
        fetched++;
        return new Response("{}");
      };
      assert.throws(() => connect(repository, { credential: token, fetch }), isReason("rejected"));
      const supplied = connect(repository, { credential: async () => token, fetch });
      await assert.rejects(supplied.releaseSource.releases(), isReason("rejected"));
      assert.equal(fetched, 0);
    });
  }

  it("reads the options of a PlatformError once", () => {
    const reads: Map<PropertyKey, number>[] = [];
    const cause = new Error("inner");
    const error = new PlatformError("rateLimited", "slow down", fickle({ retryAt: "2030-01-01T00:00:00Z", status: 429, cause }, reads));
    assert.equal(error.retryAt, "2030-01-01T00:00:00Z");
    assert.equal(error.status, 429);
    assert.equal(error.cause, cause);
    readOnce(reads);
  });
});
