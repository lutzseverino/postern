// GitHub webhook details, observed through the public issue tracker operation.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { connect, PlatformError } from "../../src/index.ts";
import type { PlatformErrorReason, PlatformEvent } from "../../src/index.ts";
import { githubIssueEvent } from "./events.ts";

const actor = { login: "mona", bot: false };
const repository = "octo/hello";
const opened = () => githubIssueEvent({ kind: "opened", issue: 42, actor, repository });
const tracker = () => connect(`https://github.com/${repository}`, {
  fetch: async () => { assert.fail("Event normalization sent a request"); },
  credential: () => { assert.fail("Event normalization requested a credential"); },
}).issueTracker;
const reason = (expected: PlatformErrorReason) => (error: unknown) => {
  assert.ok(error instanceof PlatformError);
  assert.equal(error.reason, expected);
  assert.equal(error.status, undefined);
  return true;
};

describe("GitHub issue events", () => {
  it("marks an app sender as a bot with its REST login", async () => {
    const event = opened();
    event.payload.sender = { login: "helper[bot]", type: "App" };
    assert.deepEqual((await tracker().issueEvent(event))?.actor, { login: "helper[bot]", bot: true });
  });
  it("matches repository names without regard to case and reports the connection's path", async () => {
    const event = opened();
    event.payload.repository = { full_name: "OCTO/Hello" };
    assert.equal((await tracker().issueEvent(event))?.repository, repository);
  });

  it("returns event facts anonymously without consulting current state or credentials", async () => {
    const connection = connect(`https://github.com/${repository}`, {
      fetch: async () => { assert.fail("Event normalization sent a request"); },
    });
    const event = githubIssueEvent({ kind: "commentDeleted", issue: 999, actor, repository,
      comment: { id: 456, body: "Deleted body" } });
    assert.deepEqual((await connection.issueTracker.issueEvent(event))?.comment, { id: 456, body: "Deleted body" });
  });

  it("reads each event field once, including nested getter values", async () => {
    const reads = new Map<string, number>();
    const once = (value: unknown, path: string): unknown => {
      if (value === null || typeof value !== "object") return value;
      return new Proxy(value, {
        get(target, key, receiver): unknown {
          const location = `${path}.${String(key)}`;
          const count = (reads.get(location) ?? 0) + 1;
          reads.set(location, count);
          if (count > 1) throw new Error(`Read twice: ${location}`);
          return once(Reflect.get(target, key, receiver), location);
        },
      });
    };
    const event = githubIssueEvent({ kind: "commentCreated", issue: 42, actor, repository,
      comment: { id: 123, body: "First value" } });
    assert.equal((await tracker().issueEvent(once(event, "event") as PlatformEvent))?.comment?.body, "First value");
    assert.ok([...reads.values()].every((count) => count === 1));
  });

  for (const argument of [undefined, null, [], "issues", {}, { name: 42, payload: {} },
    { name: "issues", payload: null }, { name: "issues", payload: [] },
    { name: "issues", payload: new Date() }]) {
    it(`rejects invalid argument ${JSON.stringify(argument)}`, async () => {
      await assert.rejects(tracker().issueEvent(argument as PlatformEvent), reason("rejected"));
    });
  }

  for (const [field, bad] of [
    ["repository", undefined], ["repository", { full_name: 42 }], ["repository", { full_name: "bad/path/extra" }],
    ["action", undefined], ["action", 42], ["issue", undefined], ["issue", []],
    ["sender", undefined], ["sender", null], ["sender", { login: "mona" }],
    ["sender", { login: false, type: "User" }], ["sender", { login: "mona", type: "unknown" }],
    ["issue", { number: 42 }], ["issue", { number: 42, labels: ["bug"] }],
    ["issue", { number: 42, labels: [{ name: 5 }] }],
  ] as const) {
    it(`rejects malformed ${field}: ${JSON.stringify(bad)}`, async () => {
      const event = opened();
      event.payload[field] = bad;
      await assert.rejects(tracker().issueEvent(event), reason("invalidResponse"));
    });
  }

  for (const number of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "42", null]) {
    it(`rejects an unsafe issue number ${JSON.stringify(number)}`, async () => {
      const event = opened();
      event.payload.issue = { number, labels: [] };
      await assert.rejects(tracker().issueEvent(event), reason("invalidResponse"));
    });
    it(`rejects an unsafe comment identifier ${JSON.stringify(number)}`, async () => {
      const event = githubIssueEvent({ kind: "commentDeleted", issue: 42, actor, repository });
      event.payload.comment = { id: number, body: "Deleted body" };
      await assert.rejects(tracker().issueEvent(event), reason("invalidResponse"));
    });
  }

  for (const [kind, field, bad] of [
    ["labeled", "label", undefined], ["unlabeled", "label", { name: 42 }],
    ["edited", "changes", undefined], ["edited", "changes", { body: null }],
    ["edited", "changes", { body: { from: 42 } }],
    ["commentDeleted", "comment", undefined], ["commentEdited", "comment", { id: 123, body: null }],
    ["commentCreated", "comment", { id: 123, body: 42 }],
  ] as const) {
    it(`rejects malformed ${kind} ${field}`, async () => {
      const event = githubIssueEvent({ kind, issue: 42, actor, repository });
      event.payload[field] = bad;
      await assert.rejects(tracker().issueEvent(event), reason("invalidResponse"));
    });
  }

  it("preserves empty comment bodies", async () => {
    const event = githubIssueEvent({ kind: "commentDeleted", issue: 42, actor, repository,
      comment: { id: 123, body: "" } });
    assert.equal((await tracker().issueEvent(event))?.comment?.body, "");
  });

  it("treats a body edit from null as a body change", async () => {
    const event = githubIssueEvent({ kind: "edited", issue: 42, actor, repository });
    event.payload.changes = { body: { from: null } };
    assert.equal((await tracker().issueEvent(event))?.bodyChanged, true);
  });

  it("rejects unreadable payload getters and revoked proxies without exposing their errors", async () => {
    const event = opened();
    Object.defineProperty(event.payload, "sender", { enumerable: true, get() { throw new Error("private data"); } });
    await assert.rejects(tracker().issueEvent(event), (error: unknown) => {
      reason("rejected")(error);
      assert.ok(!JSON.stringify(error).includes("private data"));
      return true;
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    await assert.rejects(tracker().issueEvent({ name: "issues", payload: revoked.proxy }), reason("rejected"));
  });

});
