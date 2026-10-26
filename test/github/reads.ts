// Reads over the GitHub fake that each seed what they read and return the
// call, so a test can change the fake's response before making it.

import type { ConnectionWithLabels } from "../../src/index.ts";
import type { ContractPlatform } from "../contract/harness.ts";

export type Read = (
  platform: ContractPlatform,
  connection: ConnectionWithLabels,
) => () => Promise<unknown>;

export const head = "a".repeat(40);
export const mona = { login: "mona", bot: false };

export const reads = {
  issue: (platform, { issueTracker }) => {
    const parent = platform.addIssue();
    const number = platform.addIssue({
      parent,
      labels: ["bug"],
      blockedBy: [parent],
      bodyEditTime: "2026-01-04T00:00:00Z",
    });
    platform.addIssue({ parent: number });
    return () => issueTracker.issue(number);
  },
  issues: (platform, { issueTracker }) => {
    const parent = platform.addIssue({ labels: ["bug"] });
    platform.addIssue({ parent, blockedBy: [parent] });
    return () => issueTracker.issues();
  },
  labelChanges: (platform, { issueTracker }) => {
    const number = platform.addIssue();
    platform.addLabelChange(number, {
      action: "added",
      label: "bug",
      actor: mona,
      time: "2026-01-02T00:00:00Z",
    });
    return () => issueTracker.labelChanges(number);
  },
  comments: (platform, { issueTracker }) => {
    const number = platform.addIssue();
    platform.addComment(number, {
      author: mona,
      body: "hi",
      createdAt: "2026-01-02T00:00:00Z",
    });
    return () => issueTracker.comments(number);
  },
  createComment: (platform, { issueTracker }) => {
    const number = platform.addIssue();
    return () => issueTracker.createComment(number, "hi");
  },
  closeIssue: (platform, { issueTracker }) => {
    const number = platform.addIssue();
    return () => issueTracker.closeIssue(number);
  },
  pullRequest: (platform, { pullRequests }) => {
    const number = platform.addPullRequest({
      headBranch: "feature",
      headCommit: head,
    });
    return () => pullRequests.pullRequest(number);
  },
  byHeadBranch: (platform, { pullRequests }) => {
    platform.addPullRequest({ headBranch: "feature", headCommit: head });
    return () => pullRequests.byHeadBranch("feature");
  },
  closing: (platform, { pullRequests }) => {
    const issue = platform.addIssue();
    platform.addPullRequest({
      headBranch: "feature",
      headCommit: head,
      closes: [issue],
    });
    return () => pullRequests.closing(issue);
  },
  reviews: (platform, { pullRequests }) => {
    const number = platform.addPullRequest({
      headBranch: "feature",
      headCommit: head,
    });
    platform.addReview(number, {
      author: mona,
      state: "APPROVED",
      commit: head,
      submittedAt: "2026-01-02T00:00:00Z",
    });
    return () => pullRequests.reviews(number);
  },
  reviewThreads: (platform, { pullRequests }) => {
    const number = platform.addPullRequest({
      headBranch: "feature",
      headCommit: head,
    });
    platform.addReviewThread(number, {
      resolved: false,
      outdated: false,
      path: "a.ts",
      author: mona,
    });
    return () => pullRequests.reviewThreads(number);
  },
  checks: (platform, { pullRequests }) => {
    platform.addCheck(head, {
      name: "Test",
      status: "completed",
      conclusion: "success",
      completedAt: "2026-01-02T00:00:00Z",
    });
    return () => pullRequests.checks(head);
  },
  mergesThroughQueue: (platform, { pullRequests }) => {
    const number = platform.addPullRequest({
      headBranch: "feature",
      headCommit: head,
      mergeQueue: true,
    });
    return () => pullRequests.mergesThroughQueue(number);
  },
  squashMerge: (platform, { pullRequests }) => {
    const number = platform.addPullRequest({
      headBranch: "feature",
      headCommit: head,
    });
    return () =>
      pullRequests.squashMerge(number, {
        expectedHead: head,
        title: "t",
        body: "b",
      });
  },
  releases: (platform, { releaseSource }) => {
    platform.addRelease({
      tag: "v1.0.0",
      name: "1.0.0",
      draft: false,
      prerelease: false,
      publishedAt: "2026-01-02T00:00:00Z",
    });
    return () => releaseSource.releases();
  },
  tagCommit: (platform, { releaseSource }) => {
    platform.addTag("v1.0.0", head);
    return () => releaseSource.tagCommit("v1.0.0");
  },
  annotatedTagCommit: (platform, { releaseSource }) => {
    platform.addTag("v1.0.0", head, { annotated: true });
    return () => releaseSource.tagCommit("v1.0.0");
  },
  role: (platform, { access }) => {
    platform.setRole("mona", "maintain");
    return () => access.role("mona");
  },
  viewer:
    (_platform, { access }) =>
    () =>
      access.viewer(),
  createLabel:
    (_platform, { issueTracker }) =>
    () =>
      issueTracker.createLabel({
        name: "bug",
        color: "ededed",
        description: "",
      }),
  labels: (platform, { issueTracker }) => {
    platform.defineLabel({ name: "bug", color: "ededed", description: "" });
    return () => issueTracker.labels();
  },
  updateLabel: (platform, { issueTracker }) => {
    platform.defineLabel({ name: "bug", color: "ededed", description: "" });
    return () =>
      issueTracker.updateLabel("bug", {
        name: "triaged",
        color: "abcdef",
        description: "Updated",
      });
  },
} satisfies Record<string, Read>;
