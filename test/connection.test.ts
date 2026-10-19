import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createConnection } from "../src/connection.ts";
import type { AdapterContext, AdapterPorts } from "../src/connection.ts";
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
        labelChanges: unexpected,
        comments: unexpected,
        addLabels: unexpected,
        removeLabel: unexpected,
        createLabel: unexpected,
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
  ] as const) {
    it(`rejects a transport request with ${name} before calling the adapter`, async () => {
      const connection = createConnection(repository, doubleAdapter({}), {});
      await assert.rejects(connection.access.request(request as never), isReason("rejected"));
    });
  }

  it("accepts JSON bodies with shared references, null prototypes and every JSON type", async () => {
    const connection = createConnection(repository, doubleAdapter({}), {});
    const shared = { a: 1 };
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { b: "x" });
    const body = { one: shared, two: [shared], bare, list: [null, true, -0, 1.5, "s", []] };
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
