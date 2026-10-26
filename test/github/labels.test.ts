import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlatformError, connect } from "../../src/index.ts";
import { startGitHub } from "./harness.ts";

const label = { name: "bug", color: "abcdef", description: "Before" };

describe("GitHub repository labels", () => {
  it("reads null descriptions as empty strings on listings and updates", async () => {
    const { platform, fake } = startGitHub();
    platform.defineLabel(label);
    fake.labels.get(platform.path)!.get(label.name)!.description = null;
    const tracker = platform.connect().issueTracker;
    assert.deepEqual(await tracker.labels(), [{ ...label, description: "" }]);
    fake.malformNext({
      status: 200,
      body: (value) => ({ ...(value as object), description: null }),
    });
    assert.deepEqual(await tracker.updateLabel(label.name, label), {
      ...label,
      description: "",
    });
  });

  it("sends one explicit PATCH with the exact selector and complete desired state", async () => {
    const { platform, fake } = startGitHub();
    const name = "old / % 🐛";
    platform.defineLabel({ ...label, name });
    const desired = {
      name: "renamed / % 🐛",
      color: "123456",
      description: "",
    };
    assert.deepEqual(
      await platform.connect().issueTracker.updateLabel(name, desired),
      desired,
    );
    assert.equal(fake.requests.length, 1);
    const request = fake.requests[0]!;
    assert.equal(request.method, "PATCH");
    assert.equal(
      request.url.pathname,
      `/repos/${platform.path}/labels/${encodeURIComponent(name)}`,
    );
    assert.deepEqual(request.body, {
      new_name: desired.name,
      color: desired.color,
      description: "",
    });
  });

  for (const [status, reason] of [
    [404, "notFound"],
    [422, "rejected"],
    [403, "forbidden"],
    [429, "rateLimited"],
  ] as const) {
    it(`preserves ${status} as ${reason}, without creating or retrying`, async () => {
      const { platform, fake } = startGitHub();
      platform.defineLabel(label);
      fake.inject({
        status,
        body: JSON.stringify({ message: `Refused ${platform.token}` }),
      });
      await assert.rejects(
        platform.connect().issueTracker.updateLabel(label.name, label),
        (error) => {
          assert.ok(error instanceof PlatformError);
          assert.equal(error.reason, reason);
          assert.equal(error.status, status);
          assert.equal(error.platformMessage, "Refused <REDACTED>");
          assert.doesNotMatch(error.message, new RegExp(platform.token));
          return true;
        },
      );
      assert.equal(fake.requests.length, 1);
      assert.equal(fake.requests[0]!.method, "PATCH");
    });
  }

  for (const [what, body, headers] of [
    ["malformed label", [{ ...label, color: "not a color" }], {}],
    ["malformed pagination", [label], { link: "not a Link header" }],
  ] as const) {
    it(`rejects a later page's ${what} with that page's status`, async () => {
      const { platform, fake } = startGitHub();
      platform.pageSize(1);
      platform.defineLabel(label);
      platform.defineLabel({ ...label, name: "second" });
      fake.malformNext({ status: 203, body: () => body, headers }, 1);
      await assert.rejects(
        platform.connect().issueTracker.labels(),
        (error) => {
          assert.ok(error instanceof PlatformError);
          assert.equal(error.reason, "invalidResponse");
          assert.equal(error.status, 203);
          return true;
        },
      );
      assert.equal(fake.requests.length, 2);
    });
  }

  for (const [what, selector, desired] of [
    ["empty selector", "", label],
    ["malformed selector", "\uD800", label],
    ["empty name", "bug", { ...label, name: "" }],
    ["malformed name", "bug", { ...label, name: "\uD800" }],
    ["malformed color", "bug", { ...label, color: "#abcdef" }],
    ["non-string description", "bug", { ...label, description: 42 }],
    ["malformed description", "bug", { ...label, description: "\uD800" }],
    ["missing fields", "bug", {}],
    ["null label", "bug", null],
    ["dot selector", ".", label],
    ["dot-dot selector", "..", label],
  ] as const) {
    it(`rejects ${what} before a request`, async () => {
      const { platform, fake } = startGitHub();
      await assert.rejects(
        platform.connect().issueTracker.updateLabel(selector, desired as never),
        (error) => {
          assert.ok(error instanceof PlatformError);
          assert.equal(error.reason, "rejected");
          assert.equal(error.status, undefined);
          return true;
        },
      );
      assert.equal(fake.requests.length, 0);
    });
  }

  it("snapshots each update field once before waiting for a credential", async () => {
    const { platform, fake } = startGitHub();
    platform.defineLabel(label);
    let releaseToken!: (token: string) => void;
    const token = new Promise<string>((resolve) => {
      releaseToken = resolve;
    });
    let requested!: () => void;
    const tokenRequested = new Promise<void>((resolve) => {
      requested = resolve;
    });
    const backing = {
      name: "triaged",
      color: "123456",
      description: "Checked",
    };
    const reads = { name: 0, color: 0, description: 0 };
    const desired = {
      get name() {
        reads.name += 1;
        return backing.name;
      },
      get color() {
        reads.color += 1;
        return backing.color;
      },
      get description() {
        reads.description += 1;
        return backing.description;
      },
    };
    const tracker = connect(platform.remote, {
      fetch: fake.fetch,
      credential: () => {
        requested();
        return token;
      },
    }).issueTracker;
    const update = tracker.updateLabel(label.name, desired);
    await tokenRequested;
    Object.assign(backing, {
      name: "changed",
      color: "ffffff",
      description: "Unchecked",
    });
    releaseToken(platform.token);
    assert.deepEqual(await update, {
      name: "triaged",
      color: "123456",
      description: "Checked",
    });
    assert.deepEqual(reads, { name: 1, color: 1, description: 1 });
    assert.deepEqual(fake.requests[0]!.body, {
      new_name: "triaged",
      color: "123456",
      description: "Checked",
    });
  });
});
