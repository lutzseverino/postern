import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlatformError } from "../../src/index.ts";
import { startGitHub } from "./harness.ts";

const addition = {
  subIssue: { repository: "other/project", number: 7, state: "open" as const },
  actor: { login: "helper[bot]", bot: true },
  time: "2026-01-02T00:00:00Z",
};

describe("sub-issue link additions", () => {
  it("distinguishes supported empty history from unavailable history", async () => {
    const { platform } = startGitHub();
    const number = platform.addIssue();
    const tracker = platform.connect().issueTracker;
    assert.equal(tracker.capabilities.subIssueLinkAdditions, true);
    assert.deepEqual(await tracker.subIssueLinkAdditions(number), []);
  });

  it("requires authentication and reports missing issues", async () => {
    const { platform } = startGitHub();
    const number = platform.addIssue();
    await assert.rejects(
      platform
        .connect({ anonymous: true })
        .issueTracker.subIssueLinkAdditions(number),
      { reason: "unauthenticated" },
    );
    await assert.rejects(
      platform.connect().issueTracker.subIssueLinkAdditions(999),
      { reason: "notFound" },
    );
  });

  it("rejects a failed later page instead of returning partial history", async () => {
    const { platform, fake } = startGitHub();
    platform.pageSize(1);
    const number = platform.addIssue();
    platform.addSubIssueLinkAddition(number, addition);
    platform.addSubIssueLinkAddition(number, addition);
    fake.malformNext(
      { status: 403, body: () => ({ message: "Permission denied" }) },
      1,
    );
    await assert.rejects(
      platform.connect().issueTracker.subIssueLinkAdditions(number),
      {
        reason: "forbidden",
        status: 403,
        platformMessage: "Permission denied",
      },
    );
  });

  for (const [field, value] of [
    ["createdAt", null],
    ["createdAt", "2026-02-30T00:00:00Z"],
    ["actor", undefined],
    ["subIssue", undefined],
    ["subIssue", { number: 7 }],
  ] as const) {
    it(`rejects malformed ${field} (${JSON.stringify(value)}) on a later page`, async () => {
      const { platform, fake } = startGitHub();
      platform.pageSize(1);
      const number = platform.addIssue();
      platform.addSubIssueLinkAddition(number, addition);
      platform.addSubIssueLinkAddition(number, addition);
      fake.malformNext(
        {
          status: 200,
          body(json) {
            const data = json as {
              data: {
                repository: {
                  issue: {
                    timelineItems: { nodes: Record<string, unknown>[] };
                  };
                };
              };
            };
            data.data.repository.issue.timelineItems.nodes[0]![field] = value;
            return data;
          },
        },
        1,
      );
      await assert.rejects(
        platform.connect().issueTracker.subIssueLinkAdditions(number),
        (error: unknown) => {
          assert.ok(error instanceof PlatformError);
          assert.equal(error.reason, "invalidResponse");
          assert.equal(error.status, 200);
          return true;
        },
      );
    });
  }
});
