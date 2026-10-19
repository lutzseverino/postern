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
  for (const [name, request] of [
    ["a body on a GET", { path: "/user", body: { a: 1 } }],
    ["a body on a HEAD", { path: "/user", method: "HEAD", body: "x" }],
    ["a circular body", { path: "/user", method: "POST", body: circular }],
    ["a BigInt body", { path: "/user", method: "POST", body: { n: 1n } }],
    ["a function body", { path: "/user", method: "POST", body: () => 1 }],
    ["a string query", { path: "/user", query: "a=1" }],
    ["an object query value", { path: "/user", query: { a: { b: 1 } } }],
    ["a non-finite query value", { path: "/user", query: { a: Number.NaN } }],
    ["an array of headers", { path: "/user", headers: [["x-a", "1"]] }],
    ["a number header value", { path: "/user", headers: { "x-a": 1 } }],
    ["an invalid header name", { path: "/user", headers: { "bad name": "1" } }],
    ["a header value with a line break", { path: "/user", headers: { "x-a": "1\r\nx-b: 2" } }],
  ] as const) {
    it(`rejects a transport request with ${name} before calling the adapter`, async () => {
      const connection = createConnection(repository, doubleAdapter({}), {});
      await assert.rejects(connection.access.request(request as never), isReason("rejected"));
    });
  }

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
