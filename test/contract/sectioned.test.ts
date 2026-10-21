// Runs the suite's relationship cases against a test double of a platform
// without native links, so the cases GitHub skips are exercised too. Its
// adapter reads `## Name` sections listing `#number` references, standing in
// for the section reader the first such adapter will bring.

import { createConnection } from "../../src/connection.ts";
import type { AdapterContext, AdapterPorts } from "../../src/connection.ts";
import { PlatformError } from "../../src/index.ts";
import type { Issue, IssueReference } from "../../src/index.ts";
import type { AdapterHarness, ContractPlatform } from "./harness.ts";
import { runAdapterContract } from "./suite.ts";

const path = "octo/sectioned";

interface StoredIssue {
  number: number;
  state: "open" | "closed";
  body: string;
}

function sectionReferences(body: string, name: string, issues: Map<number, StoredIssue>): IssueReference[] {
  const section = body.split(/^## /m).find((part) => part.split("\n", 1)[0]?.trim() === name);
  const numbers = [...(section ?? "").matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
  return numbers.flatMap((number) => {
    const issue = issues.get(number);
    return issue ? [{ repository: path, number, state: issue.state }] : [];
  });
}

function sectionedAdapter(issues: Map<number, StoredIssue>) {
  return (context: AdapterContext): AdapterPorts => {
    const unused = () => Promise.reject(new Error("not part of the relationship cases"));
    const read = (stored: StoredIssue): Issue => {
      const sections = context.relationshipSections;
      return {
        number: stored.number,
        id: stored.number,
        nodeId: null,
        url: `https://example.test/${stored.number}`,
        state: stored.state,
        title: "",
        body: stored.body,
        author: null,
        labels: [],
        createdAt: "2026-01-01T00:00:00Z",
        parent: sections ? (sectionReferences(stored.body, sections.parent, issues)[0] ?? null) : null,
        subIssues: [],
        blockedBy: sections ? sectionReferences(stored.body, sections.blockedBy, issues) : [],
        bodyEditTime: null,
        linkTime: null,
      };
    };
    return {
      issueTracker: {
        capabilities: {},
        issues: async () => [...issues.values()].map(read),
        issue: async (number) => {
          const stored = issues.get(number);
          if (!stored) throw new PlatformError("notFound", `No issue ${number}`);
          return read(stored);
        },
        labelChanges: unused,
        comments: unused,
        addLabels: unused,
        removeLabel: unused,
        createLabel: unused,
        createComment: unused,
        updateComment: unused,
        closeIssue: unused,
      },
      pullRequests: {
        capabilities: {},
        byHeadBranch: unused,
        closing: unused,
        pullRequest: unused,
        reviews: unused,
        reviewThreads: unused,
        checks: unused,
        mergesThroughQueue: unused,
        comment: unused,
        squashMerge: unused,
      },
      releaseSource: { capabilities: {}, releases: unused, tagCommit: unused },
      access: { capabilities: {}, viewer: unused, role: unused, request: unused, requestPages: unused },
    };
  };
}

const sectionedHarness: AdapterHarness = {
  name: "Sectioned test double",
  start(): ContractPlatform {
    const issues = new Map<number, StoredIssue>();
    const unused = (): never => {
      throw new Error("not part of the relationship cases");
    };
    return {
      remote: `https://example.test/${path}.git`,
      path,
      token: "unused-token",
      viewer: { login: "viewer", bot: null },
      words: { role: "", approvedReview: "", finishedCheck: { status: "", conclusion: "" } },
      connect: ({ anonymous: _anonymous, tokenFunction: _tokenFunction, ...options } = {}) =>
        createConnection({ platform: "github", host: "example.test", path }, sectionedAdapter(issues), options),
      pageSize: () => {},
      serveTransportPages: unused,
      addIssue(seed = {}) {
        if (seed.parent !== undefined || seed.blockedBy !== undefined) unused();
        const number = issues.size + 1;
        issues.set(number, { number, state: seed.state ?? "open", body: seed.body ?? "" });
        return number;
      },
      sectionBody: (sections) =>
        Object.entries(sections)
          .map(([name, references]) => `## ${name}\n\n${references.map((reference) => `- #${String(reference)}`).join("\n")}`)
          .join("\n\n"),
      addLabelChange: unused,
      addComment: unused,
      defineLabel: unused,
      addPullRequest: unused,
      addReview: unused,
      addReviewThread: unused,
      addCheck: unused,
      addRelease: unused,
      addTag: unused,
      setRole: unused,
      issueLabels: unused,
      issueState: unused,
      commentBodies: unused,
      label: unused,
      pullRequestState: unused,
      mergeOf: unused,
      failNext: unused,
      malformNext: unused,
    };
  },
};

runAdapterContract(sectionedHarness, ["capability flags", "issue relationships"]);
