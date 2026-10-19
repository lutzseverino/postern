// The adapter contract suite. Every platform adapter's tests call
// `runAdapterContract` with a harness over a local fake of its platform API.
// Cases that depend on a capability flag run only where the adapter's flags
// call for them, so one suite serves adapters with and without native links.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlatformError, capabilityFlags } from "../../src/index.ts";
import type { Account, Connection, PlatformErrorReason } from "../../src/index.ts";
import type { AdapterHarness, ContractPlatform, Malformation } from "./harness.ts";

const mona: Account = { login: "mona", bot: false };
const robot: Account = { login: "helper[bot]", bot: true };
const sections = { parent: "Parent", blockedBy: "Blocked by" };

const isReason = (reason: PlatformErrorReason) => (error: unknown) => {
  assert.ok(error instanceof PlatformError, `expected a PlatformError, got ${String(error)}`);
  assert.equal(error.reason, reason);
  return true;
};

/** The suite's groups of cases. */
export type ContractGroup =
  | "capability flags"
  | "issue tracker reads"
  | "issue relationships"
  | "issue tracker writes"
  | "accounts"
  | "pull requests"
  | "release source"
  | "access"
  | "anonymous connections"
  | "errors"
  | "malformed responses"
  | "credentials";

/**
 * Runs the contract cases against one adapter. Every adapter runs all groups;
 * `only` serves test doubles that exercise the suite itself.
 */
export function runAdapterContract(harness: AdapterHarness, only?: readonly ContractGroup[]): void {
  const probe = harness.start().connect();
  const issueFlags = probe.issueTracker.capabilities;
  const nativeParent = issueFlags.nativeParent === true;
  const nativeBlockers = issueFlags.nativeBlockers === true;
  // Every account the connection returns reports `bot` only behind `botMarking`.
  const reported = (account: Account): Account => ({
    login: account.login,
    bot: issueFlags.botMarking === true ? account.bot : null,
  });
  const offers = (flag: boolean, name: string) => (flag ? {} : { skip: `${harness.name} does not offer ${name}` });
  const lacks = (flag: boolean, name: string) => (flag ? { skip: `${harness.name} offers ${name}` } : {});

  const group = (name: ContractGroup, cases: () => void) =>
    describe(name, only && !only.includes(name) ? { skip: "not selected" } : {}, cases);

  describe(`${harness.name} adapter contract`, () => {
    group("capability flags", () => {
      it("reports only known flags, each true", () => {
        const connection = harness.start().connect();
        for (const port of ["issueTracker", "pullRequests", "releaseSource", "access"] as const) {
          const capabilities = connection[port].capabilities as Record<string, unknown>;
          for (const [flag, value] of Object.entries(capabilities)) {
            assert.ok((capabilityFlags[port] as readonly string[]).includes(flag), `${port} reports unknown flag ${flag}`);
            assert.equal(value, true, `${port}.${flag} is reported but not true`);
          }
        }
      });

      it("names no port operation release", () => {
        const connection = harness.start().connect();
        for (const port of [connection.issueTracker, connection.pullRequests, connection.releaseSource, connection.access]) {
          assert.equal("release" in port, false);
        }
      });
    });

    group("issue tracker reads", () => {
      it("lists open issues across pages, oldest first", async () => {
        const platform = harness.start();
        platform.pageSize(2);
        const numbers = [1, 2, 3].map((n) => platform.addIssue({ title: `Issue ${n}` }));
        platform.addIssue({ title: "Closed", state: "closed" });
        const issues = await platform.connect().issueTracker.issues();
        assert.deepEqual(issues.map((issue) => issue.number), numbers);
      });

      it("lists the issues in a state that carry a label", async () => {
        const platform = harness.start();
        platform.addIssue({ labels: ["bug"] });
        const closedBug = platform.addIssue({ state: "closed", labels: ["bug", "wontfix"] });
        platform.addIssue({ state: "closed", labels: ["enhancement"] });
        const issues = await platform.connect().issueTracker.issues({ state: "closed", label: "bug" });
        assert.deepEqual(issues.map((issue) => issue.number), [closedBug]);
      });

      it("reads one issue in any state with its facts", async () => {
        const platform = harness.start();
        const number = platform.addIssue({
          title: "Fix the thing",
          body: "Details",
          state: "closed",
          labels: ["bug"],
          author: mona,
          createdAt: "2026-01-01T00:00:00Z",
        });
        const issue = await platform.connect().issueTracker.issue(number);
        assert.equal(issue.number, number);
        assert.equal(issue.state, "closed");
        assert.equal(issue.title, "Fix the thing");
        assert.equal(issue.body, "Details");
        assert.deepEqual(issue.labels, ["bug"]);
        assert.equal(issue.author?.login, "mona");
        assert.equal(issue.createdAt, "2026-01-01T00:00:00Z");
        assert.ok(Number.isSafeInteger(issue.id));
        assert.match(issue.url, /^https:\/\//);
      });

      it("fails with notFound for an absent issue", async () => {
        await assert.rejects(harness.start().connect().issueTracker.issue(404), isReason("notFound"));
      });

      it("reports the body edit time", offers(issueFlags.bodyEditTime === true, "bodyEditTime"), async () => {
        const platform = harness.start();
        const edited = platform.addIssue({ bodyEditTime: "2026-02-01T00:00:00Z" });
        const untouched = platform.addIssue({ bodyEditTime: null });
        const tracker = platform.connect().issueTracker;
        assert.equal((await tracker.issue(edited)).bodyEditTime, "2026-02-01T00:00:00Z");
        assert.equal((await tracker.issue(untouched)).bodyEditTime, null);
      });

      it("lists label changes in platform order with bot and user actors", async () => {
        const platform = harness.start();
        platform.pageSize(1);
        const number = platform.addIssue();
        platform.addLabelChange(number, { action: "added", label: "bug", actor: mona, time: "2026-01-01T00:00:00Z" });
        platform.addLabelChange(number, { action: "removed", label: "bug", actor: robot, time: "2026-01-02T00:00:00Z" });
        platform.addLabelChange(number, { action: "added", label: "ready", actor: mona, time: "2026-01-03T00:00:00Z" });
        const changes = await platform.connect().issueTracker.labelChanges(number);
        assert.deepEqual(
          changes.map(({ id: _id, ...change }) => change),
          [
            { action: "added", label: "bug", actor: reported(mona), time: "2026-01-01T00:00:00Z" },
            { action: "removed", label: "bug", actor: reported(robot), time: "2026-01-02T00:00:00Z" },
            { action: "added", label: "ready", actor: reported(mona), time: "2026-01-03T00:00:00Z" },
          ],
        );
        assert.equal(new Set(changes.map((change) => change.id)).size, 3);
      });

      it("lists the complete comment list across pages", async () => {
        const platform = harness.start();
        platform.pageSize(2);
        const number = platform.addIssue();
        for (const body of ["one", "two", "three"]) {
          platform.addComment(number, { author: mona, body, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" });
        }
        const comments = await platform.connect().issueTracker.comments(number);
        assert.deepEqual(comments.map((comment) => comment.body), ["one", "two", "three"]);
        assert.equal(comments[0]?.author?.login, "mona");
        assert.equal(comments[0]?.createdAt, "2026-01-01T00:00:00Z");
        assert.equal(comments[0]?.updatedAt, "2026-01-02T00:00:00Z");
        assert.equal(new Set(comments.map((comment) => comment.id)).size, 3);
      });
    });

    group("issue relationships", () => {
      it("reports the native parent and sub-issues, across repositories", offers(nativeParent, "nativeParent"), async () => {
        const platform = harness.start();
        platform.pageSize(1);
        const parent = platform.addIssue({ title: "Parent" });
        const child = platform.addIssue({ parent, linkedAt: "2026-03-01T00:00:00Z" });
        const remoteChild = platform.addIssue({ repository: "octo/elsewhere", parent, linkedAt: "2026-03-02T00:00:00Z" });
        const tracker = platform.connect().issueTracker;
        assert.deepEqual((await tracker.issue(child)).parent, { repository: platform.path, number: parent, state: "open" });
        const read = await tracker.issue(parent);
        assert.deepEqual(read.subIssues, [
          { repository: platform.path, number: child, state: "open" },
          { repository: "octo/elsewhere", number: remoteChild, state: "open" },
        ]);
        assert.equal(read.parent, null);
      });

      it("reports the latest sub-issue link time", offers(issueFlags.linkTime === true && nativeParent, "linkTime"), async () => {
        const platform = harness.start();
        const parent = platform.addIssue();
        platform.addIssue({ parent, linkedAt: "2026-03-01T00:00:00Z" });
        platform.addIssue({ parent, linkedAt: "2026-03-05T00:00:00Z" });
        const unlinked = platform.addIssue();
        const tracker = platform.connect().issueTracker;
        assert.equal((await tracker.issue(parent)).linkTime, "2026-03-05T00:00:00Z");
        assert.equal((await tracker.issue(unlinked)).linkTime, null);
      });

      it("reports native blockers with their states, across repositories", offers(nativeBlockers, "nativeBlockers"), async () => {
        const platform = harness.start();
        platform.pageSize(1);
        const open = platform.addIssue();
        const closed = platform.addIssue({ state: "closed" });
        const other = platform.addIssue({ repository: "octo/elsewhere" });
        const blocked = platform.addIssue({ blockedBy: [open, closed, { repository: "octo/elsewhere", number: other }] });
        const issue = await platform.connect().issueTracker.issue(blocked);
        assert.deepEqual(issue.blockedBy, [
          { repository: platform.path, number: open, state: "open" },
          { repository: platform.path, number: closed, state: "closed" },
          { repository: "octo/elsewhere", number: other, state: "open" },
        ]);
      });

      for (const option of [{ relationshipSections: sections }, {}]) {
        const named = "relationshipSections" in option ? "with" : "without";
        it(
          `ignores body sections where links are native, ${named} section names`,
          offers(nativeParent && nativeBlockers, "native links"),
          async () => {
            const platform = harness.start();
            const other = platform.addIssue();
            const number = platform.addIssue({ body: platform.sectionBody({ Parent: [other], "Blocked by": [other] }) });
            const issue = await platform.connect(option).issueTracker.issue(number);
            assert.equal(issue.parent, null);
            assert.deepEqual(issue.blockedBy, []);
          },
        );
      }

      it("reports no relationships without section names", lacks(nativeParent || nativeBlockers, "native links"), async () => {
        const platform = harness.start();
        const other = platform.addIssue();
        const number = platform.addIssue({ body: platform.sectionBody({ Parent: [other], "Blocked by": [other] }) });
        const issue = await platform.connect().issueTracker.issue(number);
        assert.equal(issue.parent, null);
        assert.deepEqual(issue.subIssues, []);
        assert.deepEqual(issue.blockedBy, []);
      });

      it("reads relationships from the named body sections", lacks(nativeParent || nativeBlockers, "native links"), async () => {
        const platform = harness.start();
        const parent = platform.addIssue();
        const blocker = platform.addIssue({ state: "closed" });
        const number = platform.addIssue({
          body: platform.sectionBody({ "Parent issue": [parent], "Depends on": [blocker], Parent: [blocker] }),
        });
        const issue = await platform
          .connect({ relationshipSections: { parent: "Parent issue", blockedBy: "Depends on" } })
          .issueTracker.issue(number);
        assert.deepEqual(issue.parent, { repository: platform.path, number: parent, state: "open" });
        assert.deepEqual(issue.blockedBy, [{ repository: platform.path, number: blocker, state: "closed" }]);
      });
    });

    group("issue tracker writes", () => {
      it("adds and removes labels", async () => {
        const platform = harness.start();
        const number = platform.addIssue({ labels: ["bug"] });
        const tracker = platform.connect().issueTracker;
        await tracker.addLabels(number, ["ready", "triaged"]);
        assert.deepEqual(platform.issueLabels(number).sort(), ["bug", "ready", "triaged"]);
        await tracker.removeLabel(number, "bug");
        assert.deepEqual(platform.issueLabels(number).sort(), ["ready", "triaged"]);
      });

      it("creates a label with its color and description", async () => {
        const platform = harness.start();
        const label = { name: "needs-info", color: "d4c5f9", description: "Waiting for information" };
        assert.deepEqual(await platform.connect().issueTracker.createLabel(label), label);
        assert.deepEqual(platform.label("needs-info"), label);
      });

      it("fails with rejected when the label already exists", async () => {
        const platform = harness.start();
        const label = { name: "bug", color: "d73a4a", description: "Broken" };
        platform.defineLabel(label);
        await assert.rejects(platform.connect().issueTracker.createLabel(label), isReason("rejected"));
      });

      it("creates and updates comments", async () => {
        const platform = harness.start();
        const number = platform.addIssue();
        const tracker = platform.connect().issueTracker;
        const created = await tracker.createComment(number, "First");
        assert.equal(created.body, "First");
        assert.equal(created.author?.login, platform.viewer.login);
        const updated = await tracker.updateComment(created.id, "Second");
        assert.equal(updated.id, created.id);
        assert.equal(updated.body, "Second");
        assert.deepEqual(platform.commentBodies(number), ["Second"]);
      });

      it("closes an issue", async () => {
        const platform = harness.start();
        const number = platform.addIssue();
        await platform.connect().issueTracker.closeIssue(number);
        assert.equal(platform.issueState(number), "closed");
      });
    });

    group("accounts", () => {
      const head = "a".repeat(40);

      it("reports issue, label change and comment accounts behind botMarking", async () => {
        const platform = harness.start();
        const byRobot = platform.addIssue({ author: robot });
        const byMona = platform.addIssue({ author: mona });
        platform.addLabelChange(byRobot, { action: "added", label: "bug", actor: robot, time: "2026-01-01T00:00:00Z" });
        platform.addComment(byRobot, { author: robot, body: "beep", createdAt: "2026-01-01T00:00:00Z" });
        platform.addComment(byRobot, { author: mona, body: "hi", createdAt: "2026-01-02T00:00:00Z" });
        const tracker = platform.connect().issueTracker;
        assert.deepEqual((await tracker.issues()).map((issue) => issue.author), [reported(robot), reported(mona)]);
        assert.deepEqual((await tracker.issue(byMona)).author, reported(mona));
        assert.deepEqual((await tracker.labelChanges(byRobot)).map((change) => change.actor), [reported(robot)]);
        assert.deepEqual((await tracker.comments(byRobot)).map((comment) => comment.author), [reported(robot), reported(mona)]);
        const created = await tracker.createComment(byMona, "First");
        assert.deepEqual(created.author, reported(platform.viewer));
        assert.deepEqual((await tracker.updateComment(created.id, "Second")).author, reported(platform.viewer));
      });

      it("reports pull request, review, thread and comment accounts behind botMarking", async () => {
        const platform = harness.start();
        const issue = platform.addIssue();
        const number = platform.addPullRequest({ author: robot, headBranch: "feature", headCommit: head, closes: [issue] });
        platform.addReview(number, { author: robot, state: platform.words.approvedReview, commit: head, submittedAt: "2026-01-05T00:00:00Z" });
        platform.addReviewThread(number, { resolved: false, outdated: false, path: "src/a.ts", author: robot });
        const pulls = platform.connect().pullRequests;
        assert.deepEqual((await pulls.byHeadBranch("feature")).map((pull) => pull.author), [reported(robot)]);
        if (pulls.capabilities.closingReferences) {
          assert.deepEqual((await pulls.closing(issue)).map((pull) => pull.author), [reported(robot)]);
        }
        assert.deepEqual((await pulls.pullRequest(number)).author, reported(robot));
        assert.deepEqual((await pulls.reviews(number)).map((review) => review.author), [reported(robot)]);
        assert.deepEqual((await pulls.reviewThreads(number)).map((thread) => thread.author), [reported(robot)]);
        assert.deepEqual((await pulls.comment(number, "Done")).author, reported(platform.viewer));
      });

      it("reports the viewer behind botMarking", async () => {
        const platform = harness.start();
        assert.deepEqual(await platform.connect().access.viewer(), reported(platform.viewer));
      });
    });

    group("pull requests", () => {
      const head = "a".repeat(40);

      it("lists pull requests by head branch in every state, across pages", async () => {
        const platform = harness.start();
        platform.pageSize(1);
        const open = platform.addPullRequest({ headBranch: "feature", headCommit: head, createdAt: "2026-01-01T00:00:00Z" });
        const merged = platform.addPullRequest({ headBranch: "feature", headCommit: head, state: "merged" });
        const fork = platform.addPullRequest({ headBranch: "feature", headCommit: head, state: "closed", crossRepository: true });
        platform.addPullRequest({ headBranch: "other", headCommit: head });
        const found = await platform.connect().pullRequests.byHeadBranch("feature");
        assert.deepEqual(
          found.map((pull) => [pull.number, pull.state, pull.crossRepository]),
          [
            [open, "open", false],
            [merged, "merged", false],
            [fork, "closed", true],
          ],
        );
        assert.equal(found[0]?.createdAt, "2026-01-01T00:00:00Z");
      });

      it(
        "lists the pull requests that close an issue",
        offers(probe.pullRequests.capabilities.closingReferences === true, "closingReferences"),
        async () => {
          const platform = harness.start();
          const issue = platform.addIssue();
          const closing = platform.addPullRequest({ headBranch: "fix", headCommit: head, closes: [issue] });
          const closed = platform.addPullRequest({ headBranch: "old-fix", headCommit: head, closes: [issue], state: "closed" });
          platform.addPullRequest({ headBranch: "unrelated", headCommit: head });
          const found = await platform.connect().pullRequests.closing(issue);
          assert.deepEqual(found.map((pull) => [pull.number, pull.state]), [
            [closing, "open"],
            [closed, "closed"],
          ]);
        },
      );

      it(
        "fails with unsupported when closing references are not offered",
        lacks(probe.pullRequests.capabilities.closingReferences === true, "closingReferences"),
        async () => {
          await assert.rejects(harness.start().connect().pullRequests.closing(1), isReason("unsupported"));
        },
      );

      it("reads one pull request's title, body, author and head commit", async () => {
        const platform = harness.start();
        const number = platform.addPullRequest({
          title: "feat: add it",
          body: "Closes #1",
          author: mona,
          headBranch: "feature",
          headCommit: head,
          baseBranch: "main",
        });
        const pull = await platform.connect().pullRequests.pullRequest(number);
        assert.equal(pull.title, "feat: add it");
        assert.equal(pull.body, "Closes #1");
        assert.equal(pull.author?.login, "mona");
        assert.equal(pull.headCommit, head);
        assert.equal(pull.headBranch, "feature");
        assert.equal(pull.baseBranch, "main");
        assert.equal(pull.repository, platform.path);
      });

      it("lists reviews with author, state, commit and time", async () => {
        const platform = harness.start();
        platform.pageSize(1);
        const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
        const approved = platform.words.approvedReview;
        platform.addReview(number, { author: robot, state: approved, commit: head, submittedAt: "2026-01-05T00:00:00Z", body: "LGTM" });
        platform.addReview(number, { author: mona, state: approved, commit: head, submittedAt: "2026-01-06T00:00:00Z" });
        const reviews = await platform.connect().pullRequests.reviews(number);
        const commits = probe.pullRequests.capabilities.reviewCommits === true;
        assert.deepEqual(
          reviews.map((review) => [review.author?.login, review.state, review.commit, review.submittedAt]),
          [
            ["helper[bot]", approved, commits ? head : null, "2026-01-05T00:00:00Z"],
            ["mona", approved, commits ? head : null, "2026-01-06T00:00:00Z"],
          ],
        );
        assert.equal(reviews[0]?.body, "LGTM");
      });

      it("lists review threads with whether each is resolved", async () => {
        const platform = harness.start();
        platform.pageSize(1);
        const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
        platform.addReviewThread(number, { resolved: true, outdated: false, path: "src/a.ts", author: robot });
        platform.addReviewThread(number, { resolved: false, outdated: true, path: "src/b.ts", author: mona });
        const threads = await platform.connect().pullRequests.reviewThreads(number);
        assert.deepEqual(
          threads.map((thread) => [thread.resolved, thread.outdated, thread.path, thread.author?.login]),
          [
            [true, false, "src/a.ts", "helper[bot]"],
            [false, true, "src/b.ts", "mona"],
          ],
        );
      });

      it("lists the check results for a commit across pages", async () => {
        const platform = harness.start();
        platform.pageSize(1);
        const { status, conclusion } = platform.words.finishedCheck;
        platform.addCheck(head, { name: "Test", status, conclusion, completedAt: "2026-01-07T00:00:00Z" });
        platform.addCheck(head, { name: "Lint", status, conclusion, completedAt: "2026-01-07T00:01:00Z" });
        const checks = await platform.connect().pullRequests.checks(head);
        assert.deepEqual(checks.map((check) => [check.name, check.status, check.conclusion]).sort(), [
          ["Lint", status, conclusion],
          ["Test", status, conclusion],
        ]);
      });

      it("reports whether merging goes through a queue", async () => {
        const platform = harness.start();
        const queued = platform.addPullRequest({ headBranch: "a", headCommit: head, mergeQueue: true });
        const direct = platform.addPullRequest({ headBranch: "b", headCommit: head });
        const pulls = platform.connect().pullRequests;
        assert.equal(await pulls.mergesThroughQueue(queued), true);
        assert.equal(await pulls.mergesThroughQueue(direct), false);
      });

      it("comments on a pull request", async () => {
        const platform = harness.start();
        const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
        const comment = await platform.connect().pullRequests.comment(number, "Looks done");
        assert.equal(comment.body, "Looks done");
        assert.deepEqual(platform.commentBodies(number), ["Looks done"]);
      });

      it("squash-merges with the explicit title and body", async () => {
        const platform = harness.start();
        const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
        const commit = await platform.connect().pullRequests.squashMerge(number, {
          expectedHead: head,
          title: "feat: add it (#1)",
          body: "Closes #1",
        });
        assert.match(commit, /^[0-9a-f]+$/);
        assert.equal(platform.pullRequestState(number), "merged");
        assert.deepEqual(platform.mergeOf(number), { title: "feat: add it (#1)", body: "Closes #1" });
      });

      it("fails the merge with conflict when the head moved", async () => {
        const platform = harness.start();
        const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
        const merge = { expectedHead: "b".repeat(40), title: "t", body: "b" };
        await assert.rejects(platform.connect().pullRequests.squashMerge(number, merge), isReason("conflict"));
        assert.equal(platform.mergeOf(number), null);
      });
    });

    group("release source", () => {
      it("lists every release across pages with draft and prerelease flags", async () => {
        const platform = harness.start();
        platform.pageSize(1);
        platform.addRelease({ tag: "v1.1.0-rc.1", name: "1.1.0 rc", draft: false, prerelease: true, publishedAt: "2026-02-01T00:00:00Z" });
        platform.addRelease({ tag: "v1.0.0", name: "1.0.0", draft: false, prerelease: false, publishedAt: "2026-01-01T00:00:00Z" });
        platform.addRelease({ tag: "v2.0.0", name: "2.0.0", draft: true, prerelease: false, publishedAt: null });
        const releases = await platform.connect().releaseSource.releases();
        const { drafts, prereleases } = probe.releaseSource.capabilities;
        assert.deepEqual(
          releases.map(({ id: _id, ...release }) => release),
          [
            { tag: "v1.1.0-rc.1", name: "1.1.0 rc", draft: drafts ? false : null, prerelease: prereleases ? true : null, publishedAt: "2026-02-01T00:00:00Z" },
            { tag: "v1.0.0", name: "1.0.0", draft: drafts ? false : null, prerelease: prereleases ? false : null, publishedAt: "2026-01-01T00:00:00Z" },
            ...(drafts ? [{ tag: "v2.0.0", name: "2.0.0", draft: true, prerelease: prereleases ? false : null, publishedAt: null }] : []),
          ],
        );
      });

      it("resolves lightweight and annotated tags to their commit", async () => {
        const platform = harness.start();
        platform.addTag("v1.0.0", "c".repeat(40));
        platform.addTag("v1.1.0", "d".repeat(40), { annotated: true });
        const source = platform.connect().releaseSource;
        assert.equal(await source.tagCommit("v1.0.0"), "c".repeat(40));
        assert.equal(await source.tagCommit("v1.1.0"), "d".repeat(40));
        await assert.rejects(source.tagCommit("v9.9.9"), isReason("notFound"));
      });
    });

    group("access", () => {
      it("reports the authenticated account, or none when anonymous", async () => {
        const platform = harness.start();
        assert.deepEqual(await platform.connect().access.viewer(), reported(platform.viewer));
        assert.equal(await platform.connect({ anonymous: true }).access.viewer(), null);
      });

      it("reports an account's role, or null when it has none", async () => {
        const platform = harness.start();
        platform.setRole("mona", platform.words.role);
        platform.setRole("stranger", null);
        const access = platform.connect().access;
        assert.equal(await access.role("mona"), platform.words.role);
        assert.equal(await access.role("stranger"), null);
      });

      it("sends authenticated requests to the platform's API", async () => {
        const platform = harness.start();
        const response = await platform.connect().access.request({ path: "/user" });
        assert.equal(response.status, 200);
        assert.equal((response.data as { login?: string }).login, platform.viewer.login);
      });

      it("refuses request paths that leave the platform's API", async () => {
        const access = harness.start().connect().access;
        for (const path of ["//elsewhere.example/x", "https://elsewhere.example/x"]) {
          await assert.rejects(access.request({ path }), isReason("rejected"));
        }
      });
    });

    group("anonymous connections", () => {
      it("read public releases without a credential", async () => {
        const platform = harness.start();
        platform.addRelease({ tag: "v1.0.0", name: "1.0.0", draft: false, prerelease: false, publishedAt: "2026-01-01T00:00:00Z" });
        const releases = await platform.connect({ anonymous: true }).releaseSource.releases();
        assert.deepEqual(releases.map((release) => release.tag), ["v1.0.0"]);
      });
    });

    group("errors", () => {
      const reasons = ["unauthenticated", "forbidden", "notFound", "conflict", "rejected", "rateLimited", "unavailable", "invalidResponse"] as const;
      const operations: [string, (connection: Connection) => Promise<unknown>][] = [
        ["an issue read", (connection) => connection.issueTracker.issue(1)],
        ["a release listing", (connection) => connection.releaseSource.releases()],
        ["a label write", (connection) => connection.issueTracker.addLabels(1, ["bug"])],
      ];
      for (const reason of reasons) {
        for (const [what, operation] of operations) {
          it(`maps the platform's ${reason} failure of ${what}`, async () => {
            const platform = harness.start();
            platform.addIssue();
            platform.failNext({ reason, retryAt: "2030-01-01T00:00:00.000Z" });
            await assert.rejects(operation(platform.connect()), (error) => {
              isReason(reason)(error);
              if (reason === "rateLimited") assert.equal((error as PlatformError).retryAt, "2030-01-01T00:00:00.000Z");
              return true;
            });
          });
        }
      }
    });

    group("malformed responses", () => {
      const head = "a".repeat(40);
      // Every operation that reads a response, as a call prepared on a seeded
      // platform, and whether it reads a list across pages.
      type Prepared = (platform: ContractPlatform, connection: Connection) => Promise<() => Promise<unknown>>;
      const reads: [name: string, list: boolean, prepare: Prepared][] = [
        ["issues", true, async (platform, { issueTracker }) => (platform.addIssue(), () => issueTracker.issues())],
        ["issue", false, async (platform, { issueTracker }) => {
          const number = platform.addIssue({ labels: ["bug"] });
          return () => issueTracker.issue(number);
        }],
        ["labelChanges", true, async (platform, { issueTracker }) => {
          const number = platform.addIssue();
          platform.addLabelChange(number, { action: "added", label: "bug", actor: mona, time: "2026-01-02T00:00:00Z" });
          return () => issueTracker.labelChanges(number);
        }],
        ["comments", true, async (platform, { issueTracker }) => {
          const number = platform.addIssue();
          platform.addComment(number, { author: mona, body: "hi", createdAt: "2026-01-02T00:00:00Z" });
          return () => issueTracker.comments(number);
        }],
        ["createLabel", false, async (_platform, { issueTracker }) => () =>
          issueTracker.createLabel({ name: "bug", color: "ededed", description: "" })],
        ["createComment", false, async (platform, { issueTracker }) => {
          const number = platform.addIssue();
          return () => issueTracker.createComment(number, "hi");
        }],
        ["updateComment", false, async (platform, { issueTracker }) => {
          const number = platform.addIssue();
          platform.addComment(number, { author: mona, body: "hi", createdAt: "2026-01-02T00:00:00Z" });
          const [comment] = await issueTracker.comments(number);
          return () => issueTracker.updateComment(comment!.id, "edited");
        }],
        ["byHeadBranch", true, async (platform, { pullRequests }) => {
          platform.addPullRequest({ headBranch: "feature", headCommit: head });
          return () => pullRequests.byHeadBranch("feature");
        }],
        ["closing", true, async (platform, { pullRequests }) => {
          const issue = platform.addIssue();
          platform.addPullRequest({ headBranch: "feature", headCommit: head, closes: [issue] });
          return () => pullRequests.closing(issue);
        }],
        ["pullRequest", false, async (platform, { pullRequests }) => {
          const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
          return () => pullRequests.pullRequest(number);
        }],
        ["reviews", true, async (platform, { pullRequests }) => {
          const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
          platform.addReview(number, { author: mona, state: platform.words.approvedReview, commit: head, submittedAt: "2026-01-02T00:00:00Z" });
          return () => pullRequests.reviews(number);
        }],
        ["reviewThreads", true, async (platform, { pullRequests }) => {
          const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
          platform.addReviewThread(number, { resolved: false, outdated: false, path: "a.ts", author: mona });
          return () => pullRequests.reviewThreads(number);
        }],
        ["checks", true, async (platform, { pullRequests }) => {
          const { status, conclusion } = platform.words.finishedCheck;
          platform.addCheck(head, { name: "Test", status, conclusion, completedAt: "2026-01-02T00:00:00Z" });
          return () => pullRequests.checks(head);
        }],
        ["mergesThroughQueue", false, async (platform, { pullRequests }) => {
          const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
          return () => pullRequests.mergesThroughQueue(number);
        }],
        ["comment", false, async (platform, { pullRequests }) => {
          const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
          return () => pullRequests.comment(number, "hi");
        }],
        ["squashMerge", false, async (platform, { pullRequests }) => {
          const number = platform.addPullRequest({ headBranch: "feature", headCommit: head });
          return () => pullRequests.squashMerge(number, { expectedHead: head, title: "t", body: "b" });
        }],
        ["releases", true, async (platform, { releaseSource }) => {
          platform.addRelease({ tag: "v1.0.0", name: "1.0.0", draft: false, prerelease: false, publishedAt: "2026-01-02T00:00:00Z" });
          return () => releaseSource.releases();
        }],
        ["tagCommit of a lightweight tag", false, async (platform, { releaseSource }) => {
          platform.addTag("v1.0.0", head);
          return () => releaseSource.tagCommit("v1.0.0");
        }],
        ["tagCommit of an annotated tag", false, async (platform, { releaseSource }) => {
          platform.addTag("v1.0.0", head, { annotated: true });
          return () => releaseSource.tagCommit("v1.0.0");
        }],
        ["viewer", false, async (_platform, { access }) => () => access.viewer()],
        ["role", false, async (platform, { access }) => {
          platform.setRole("mona", platform.words.role);
          return () => access.role("mona");
        }],
      ];
      const every: Malformation[] = ["missingFields", "wrongTypes"];
      const lists: Malformation[] = ["brokenLists", "pageWithoutCursor"];
      for (const [name, list, prepare] of reads) {
        for (const malformation of list ? [...every, ...lists] : every) {
          it(`fails ${name} with invalidResponse and the response's status for ${malformation}`, async () => {
            const platform = harness.start();
            const call = await prepare(platform, platform.connect());
            const status = platform.malformNext(malformation);
            await assert.rejects(call(), (error) => {
              isReason("invalidResponse")(error);
              assert.equal((error as PlatformError).status, status);
              return true;
            });
          });
        }
      }
    });

    group("credentials", () => {
      for (const reason of ["unauthenticated", "rejected", "unavailable"] as const) {
        it(`keeps the credential out of a ${reason} error that echoes it`, async () => {
          const platform = harness.start();
          platform.failNext({ reason, echo: `token ${platform.token} refused` });
          await assert.rejects(platform.connect().releaseSource.releases(), (error) => {
            isReason(reason)(error);
            const seen = JSON.stringify(error, Object.getOwnPropertyNames(error)) + String((error as Error).cause);
            assert.doesNotMatch(seen, new RegExp(platform.token));
            assert.doesNotMatch((error as Error).message, new RegExp(platform.token));
            return true;
          });
        });
      }

      it("keeps the credential out of results that contain it", async () => {
        const platform = harness.start();
        const number = platform.addIssue({ body: `pasted ${platform.token}` });
        platform.addComment(number, { author: mona, body: `again ${platform.token}`, createdAt: "2026-01-01T00:00:00Z" });
        const tracker = platform.connect().issueTracker;
        const results = JSON.stringify([await tracker.issue(number), await tracker.comments(number)]);
        assert.doesNotMatch(results, new RegExp(platform.token));
        assert.match(results, /<REDACTED>/);
      });

      it("keeps a credential function's token out of errors and results", async () => {
        const platform = harness.start();
        const number = platform.addIssue({ body: `pasted ${platform.token}` });
        const connection = platform.connect({ tokenFunction: true });
        assert.doesNotMatch(JSON.stringify(await connection.issueTracker.issue(number)), new RegExp(platform.token));
        platform.failNext({ reason: "forbidden", echo: platform.token });
        await assert.rejects(connection.access.viewer(), (error) => {
          isReason("forbidden")(error);
          assert.doesNotMatch(JSON.stringify(error, Object.getOwnPropertyNames(error)), new RegExp(platform.token));
          return true;
        });
      });
    });
  });
}
