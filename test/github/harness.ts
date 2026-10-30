// The GitHub adapter's contract harness over the local GitHub fake.

import { connect } from "../../src/index.ts";
import type {
  Account,
  ConnectOptions,
  ConnectionWithLinkAdditions,
} from "../../src/index.ts";
import type {
  AdapterHarness,
  ContractPlatform,
  Failure,
  Malformation,
  SeedReference,
} from "../contract/harness.ts";
import { githubIssueEvent } from "./events.ts";
import { GitHubFake, graphqlUser } from "./fake.ts";
import type { FakeUser, Injected, Malformed } from "./fake.ts";

const path = "octo/hello";
const token = "ghp_contractToken0123456789";
const viewer: FakeUser = { login: "octocat", type: "User" };

const fakeUser = (account: Account | undefined): FakeUser | null =>
  account ? { login: account.login, type: account.bot ? "Bot" : "User" } : null;

// The response GitHub sends for each failure reason.
function githubFailure({ reason, retryAt, echo = "" }: Failure): Injected {
  const body = (message: string) =>
    JSON.stringify({ message: `${message}${echo ? ` (${echo})` : ""}` });
  const reset =
    retryAt === undefined ? undefined : String(Date.parse(retryAt) / 1000);
  switch (reason) {
    case "unauthenticated":
      return { status: 401, body: body("Bad credentials") };
    case "forbidden":
      return {
        status: 403,
        body: body("Resource not accessible by integration"),
      };
    case "notFound":
      return { status: 404, body: body("Not Found") };
    case "conflict":
      return { status: 409, body: body("Conflict") };
    case "rejected":
      return { status: 422, body: body("Validation Failed") };
    case "rateLimited":
      return {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          ...(reset === undefined ? {} : { "x-ratelimit-reset": reset }),
        },
        body: body("API rate limit exceeded"),
      };
    case "unavailable":
      return { status: 502, body: body("Server Error") };
    case "invalidResponse":
      return { status: 200, body: `<html>${echo}</html>` };
  }
}

// Fields a malformation leaves alone, so the adapter still reaches the facts
// it reads: an event's or Git object's kind, an account's type, and a
// connection's pagination.
const structural = new Set([
  "event",
  "type",
  "__typename",
  "hasNextPage",
  "endCursor",
]);

// Every scalar field outside the structural ones, in every object of a
// response, changed; a change to `undefined` drops the field.
function everyScalar(
  value: unknown,
  change: (scalar: unknown) => unknown,
): unknown {
  if (Array.isArray(value))
    return value.map((item) => everyScalar(item, change));
  if (value === null || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const next =
      item !== null && typeof item === "object"
        ? everyScalar(item, change)
        : structural.has(key)
          ? item
          : change(item);
    if (next !== undefined) result[key] = next;
  }
  return result;
}

function everyList(value: unknown): unknown {
  if (Array.isArray(value)) return {};
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, everyList(item)]),
  );
}

function withoutCursors(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCursors);
  if (value === null || typeof value !== "object") return value;
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, withoutCursors(item)]),
  );
  return "hasNextPage" in result
    ? { ...result, hasNextPage: true, endCursor: null }
    : result;
}

// Every GraphQL `pageInfo` in a response, with its `hasNextPage` changed; a
// change to `undefined` drops it.
function everyPageFlag(value: unknown, change: () => unknown): unknown {
  if (Array.isArray(value))
    return value.map((item) => everyPageFlag(item, change));
  if (value === null || typeof value !== "object") return value;
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      everyPageFlag(item, change),
    ]),
  );
  if (!("hasNextPage" in result)) return result;
  const { hasNextPage: _, ...rest } = result;
  const flag = change();
  return flag === undefined ? rest : { ...rest, hasNextPage: flag };
}

// A next page GitHub's API could serve.
const nextPageUrl = "https://api.github.com/repositories/1/items?page=2";

// How GitHub's responses are malformed. A REST list states its next page in
// its Link header, so there a list without a cursor has a next-page link with
// no URL, and a page that does not say whether another follows has a Link
// header that cannot be read: a link without its relation, or a value that is
// no list of links.
const malformations: Record<Malformation, Omit<Malformed, "status">> = {
  missingFields: { body: (json) => everyScalar(json, () => undefined) },
  wrongTypes: {
    body: (json) =>
      everyScalar(json, (scalar) => (typeof scalar === "string" ? 0 : "x")),
  },
  brokenLists: { body: everyList },
  pageWithoutCursor: {
    headers: { link: '; rel="next"' },
    body: withoutCursors,
  },
  pageFlagMissing: {
    headers: { link: `<${nextPageUrl}>` },
    body: (json) => everyPageFlag(json, () => undefined),
  },
  pageFlagNull: {
    headers: { link: "null" },
    body: (json) => everyPageFlag(json, () => null),
  },
  pageFlagWrongType: {
    headers: { link: "true" },
    body: (json) => everyPageFlag(json, () => "true"),
  },
};

/** Opens a connection the way `connect` does. */
export type Opener = (
  remote: string,
  options: ConnectOptions,
) => ConnectionWithLinkAdditions;

/** A harness over the GitHub fake whose connections `open` makes, by default through `connect`. */
export const harnessOver = (
  name: string,
  open: Opener = connect,
): AdapterHarness => ({
  name,
  start: () => startGitHub(open).platform,
});

/** A contract platform over a fresh GitHub fake, with the fake itself for GitHub-specific tests. */
export function startGitHub(open: Opener = connect): {
  platform: ContractPlatform;
  fake: GitHubFake;
} {
  const fake = new GitHubFake(path);
  fake.tokens.set(token, viewer);
  fake.users.set(viewer.login, viewer);
  const key = (reference: SeedReference) =>
    typeof reference === "number"
      ? `${path}#${reference}`
      : `${reference.repository}#${reference.number}`;
  const issue = (number: number) => {
    const found = fake.issues.get(`${path}#${number}`);
    if (!found) throw new Error(`No seeded issue ${number}`);
    return found;
  };
  const pull = (number: number) => {
    const found = fake.pullRequests.get(`${path}#${number}`);
    if (!found) throw new Error(`No seeded pull request ${number}`);
    return found;
  };
  const platform: ContractPlatform = {
    remote: `https://github.com/${path}.git`,
    path,
    token,
    viewer: { login: viewer.login, bot: false },
    words: {
      role: "maintain",
      approvedReview: "APPROVED",
      finishedCheck: { status: "completed", conclusion: "success" },
    },
    connect({ anonymous = false, tokenFunction = false, ...options } = {}) {
      const credential = anonymous
        ? {}
        : { credential: tokenFunction ? async () => token : token };
      return open(`https://github.com/${path}.git`, {
        ...options,
        ...credential,
        fetch: fake.fetch,
      });
    },
    serveTransportPages(pages) {
      fake.transportPages.splice(
        0,
        fake.transportPages.length,
        ...pages.map((page) => {
          const next = page.next;
          const link =
            next === undefined
              ? {}
              : {
                  link:
                    next === "unreadable"
                      ? "not a Link header"
                      : `<${next === "foreign" ? "https://elsewhere.example/items" : `https://api.github.com/contract-pages?page=${next}`}>; rel="next"`,
                };
          return {
            status: page.status,
            data: page.data,
            headers: { ...page.headers, ...link },
          };
        }),
      );
      return "/contract-pages?page=0";
    },
    pageSize(size) {
      fake.maxPageSize = size;
    },
    issueEvent: (seed, variation) =>
      githubIssueEvent(
        { ...seed, repository: seed.repository ?? path },
        variation,
      ),
    addIssue(seed = {}) {
      const repository = seed.repository ?? path;
      const number = fake.nextNumber(repository);
      const databaseId = fake.nextId();
      fake.issues.set(`${repository}#${number}`, {
        repository,
        number,
        databaseId,
        nodeId: `I_${databaseId}`,
        state: seed.state === "closed" ? "CLOSED" : "OPEN",
        title: seed.title ?? `Issue ${number}`,
        body: seed.body ?? "",
        author: fakeUser(seed.author ?? { login: "mona", bot: false }),
        labels: [...(seed.labels ?? [])],
        createdAt: seed.createdAt ?? "2026-01-01T00:00:00Z",
        lastEditedAt: seed.bodyEditTime ?? null,
        parent: seed.parent === undefined ? null : key(seed.parent),
        blockedBy: (seed.blockedBy ?? []).map(key),
        subIssueLinkAdditions: [],
        events: [],
      });
      if (seed.parent !== undefined) {
        const parent = fake.issues.get(key(seed.parent));
        if (!parent) throw new Error("Seed the parent first");
        parent.subIssueLinkAdditions.push({
          createdAt: seed.linkedAt ?? "2026-01-01T00:00:00Z",
          actor: graphqlUser(viewer),
          subIssue: {
            number,
            state: seed.state === "closed" ? "CLOSED" : "OPEN",
            repository: { nameWithOwner: repository },
          },
        });
      }
      return number;
    },
    sectionBody(sections) {
      return Object.entries(sections)
        .map(([name, references]) => {
          const links = references.map((reference) =>
            typeof reference === "number"
              ? `#${reference}`
              : `${reference.repository}#${reference.number}`,
          );
          return `## ${name}\n\n${links.map((link) => `- ${link}`).join("\n")}`;
        })
        .join("\n\n");
    },
    addSubIssueLinkAddition(number, addition) {
      const actor = addition.actor;
      const subIssue = addition.subIssue;
      issue(number).subIssueLinkAdditions.push({
        createdAt: addition.time,
        actor: graphqlUser(actor === null ? null : fakeUser(actor)),
        subIssue:
          subIssue === null
            ? null
            : {
                number: subIssue.number,
                state: subIssue.state.toUpperCase(),
                repository: { nameWithOwner: subIssue.repository },
              },
      });
    },
    addLabelChange(number, change) {
      const actor = fakeUser(change.actor)!;
      fake.users.set(actor.login, actor);
      issue(number).events.push({
        id: fake.nextId(),
        node_id: `LE_${fake.nextId()}`,
        event: change.action === "added" ? "labeled" : "unlabeled",
        actor: { login: actor.login, type: actor.type },
        label: { name: change.label, color: "ededed" },
        created_at: change.time,
      });
      issue(number).events.push({
        id: fake.nextId(),
        event: "mentioned",
        actor: null,
        created_at: change.time,
      });
    },
    addComment(number, comment) {
      fake.addComment(
        `${path}#${number}`,
        fakeUser(comment.author)!,
        comment.body,
        comment.createdAt,
        comment.updatedAt,
      );
    },
    defineLabel(label) {
      const labels = fake.labels.get(path) ?? new Map();
      labels.set(label.name, { id: fake.nextId(), ...label, default: false });
      fake.labels.set(path, labels);
    },
    addPullRequest(seed) {
      const number = fake.nextNumber(path);
      const databaseId = fake.nextId();
      fake.pullRequests.set(`${path}#${number}`, {
        repository: path,
        number,
        databaseId,
        nodeId: `PR_${databaseId}`,
        state:
          seed.state === "merged"
            ? "MERGED"
            : seed.state === "closed"
              ? "CLOSED"
              : "OPEN",
        title: seed.title ?? `Pull request ${number}`,
        body: seed.body ?? "",
        author: fakeUser(seed.author ?? { login: "mona", bot: false }),
        createdAt: seed.createdAt ?? "2026-01-01T00:00:00Z",
        headRefName: seed.headBranch,
        headRefOid: seed.headCommit,
        baseRefName: seed.baseBranch ?? "main",
        isCrossRepository: seed.crossRepository ?? false,
        closes: (seed.closes ?? []).map((closed) => `${path}#${closed}`),
        reviews: [],
        threads: [],
        isMergeQueueEnabled: seed.mergeQueue ?? false,
        merge: null,
        labels: [],
        events: [],
      });
      return number;
    },
    addReview(number, review) {
      const id = fake.nextId();
      const author = fakeUser(review.author)!;
      pull(number).reviews.push({
        id,
        node_id: `PRR_${id}`,
        user: { login: author.login, type: author.type },
        body: review.body ?? "",
        state: review.state,
        commit_id: review.commit,
        submitted_at: review.submittedAt,
      });
    },
    addReviewThread(number, thread) {
      const author = fakeUser(thread.author)!;
      pull(number).threads.push({
        id: `PRRT_${fake.nextId()}`,
        isResolved: thread.resolved,
        isOutdated: thread.outdated,
        path: thread.path,
        comments: {
          nodes: [
            {
              author:
                author.type === "Bot"
                  ? {
                      __typename: "Bot",
                      login: author.login.replace(/\[bot\]$/, ""),
                    }
                  : { __typename: "User", login: author.login },
            },
          ],
        },
      });
    },
    addCheck(commit, check) {
      const entry = fake.checks.get(commit) ?? { runs: [], statuses: [] };
      fake.checks.set(commit, entry);
      entry.runs.push({
        id: fake.nextId(),
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        completed_at: check.completedAt,
      });
    },
    addRelease(release) {
      fake.releases.push({
        id: fake.nextId(),
        tag_name: release.tag,
        name: release.name,
        draft: release.draft,
        prerelease: release.prerelease,
        published_at: release.publishedAt,
      });
    },
    addTag(name, commit, { annotated = false } = {}) {
      if (!annotated) {
        fake.tagRefs.set(name, { type: "commit", sha: commit });
        return;
      }
      const outer = fake.nextId().toString(16).padStart(40, "e");
      const inner = fake.nextId().toString(16).padStart(40, "f");
      fake.tagRefs.set(name, { type: "tag", sha: outer });
      fake.tagObjects.set(outer, { type: "tag", sha: inner });
      fake.tagObjects.set(inner, { type: "commit", sha: commit });
    },
    setRole(login, role) {
      fake.users.set(login, { login, type: "User" });
      fake.collaborators.set(
        login,
        role === null
          ? { permission: "none", role_name: "none" }
          : { permission: "write", role_name: role },
      );
    },
    issueLabels: (number) => [...issue(number).labels],
    issueState: (number) =>
      issue(number).state === "OPEN" ? "open" : "closed",
    commentBodies: (number) =>
      [...fake.comments.values()]
        .filter((comment) => comment.key === `${path}#${number}`)
        .map((comment) => String(comment.body)),
    label(name) {
      const found = fake.labels.get(path)?.get(name);
      return found
        ? {
            name: String(found.name),
            color: String(found.color),
            description: String(found.description),
          }
        : undefined;
    },
    pullRequestState: (number) =>
      pull(number).state.toLowerCase() as "open" | "closed" | "merged",
    mergeOf(number) {
      const merge = pull(number).merge;
      return merge ? { title: merge.title, body: merge.message } : null;
    },
    failNext(failure) {
      fake.inject(githubFailure(failure));
    },
    malformNext(malformation) {
      // A success status GitHub's API does not use, so the error shows it came from this response.
      const status = 203;
      fake.malformNext({ status, ...malformations[malformation] });
      return status;
    },
  };
  return { platform, fake };
}

export const githubHarness = harnessOver("GitHub");
