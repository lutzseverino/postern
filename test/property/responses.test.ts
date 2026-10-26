// Property: a GitHub response changed in one place either reads as the
// response it came from, or fails with `invalidResponse` carrying its status.
// Each case takes one real response of the GitHub fake for a port operation
// and drops, retypes or corrupts one field anywhere in it, such as a time, an
// ID, a commit, a URL, a state or a page flag, or adds malformed GraphQL
// errors. A raw error, another reason or a different result fails the case.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlatformError } from "../../src/index.ts";
import { startGitHub } from "../github/harness.ts";
import { reads } from "../github/reads.ts";
import type { Read } from "../github/reads.ts";
import { Random, caseRandom, reproduce, runs } from "./random.ts";

// A success status GitHub does not use, so an error shows which response it came from.
const status = 203;

interface Outcome {
  value?: unknown;
  error?: unknown;
  requests: number;
}

async function run(
  read: Read,
  change?: { skip: number; body: (json: unknown) => unknown },
): Promise<Outcome> {
  const { platform, fake } = startGitHub();
  const call = read(platform, platform.connect());
  if (change) fake.malformNext({ status, body: change.body }, change.skip);
  try {
    return { value: await call(), requests: fake.requests.length };
  } catch (error) {
    return { error, requests: fake.requests.length };
  }
}

const drop = Symbol("drop");
type Change = [name: string, value: unknown];

// Times GitHub never sends: dates off the calendar, times off the clock and other shapes.
const badTimes = [
  "2024-02-30T12:00:00Z",
  "2026-02-29T12:00:00Z",
  "2026-04-31T00:00:00Z",
  "2026-00-01T00:00:00Z",
  "2026-13-01T00:00:00Z",
  "2026-01-00T00:00:00Z",
  "2026-01-32T00:00:00Z",
  "2026-01-01T24:00:00Z",
  "2026-01-01T12:60:00Z",
  "2026-01-01T12:00:60Z",
  "2026-01-01T12:00:00+24:00",
  "2026-01-01T12:00:00+01:60",
  "2026-01-01T12:00:00",
  "2026-01-01 12:00:00Z",
  "2026-01-01",
  "2026-01-01t12:00:00z",
  "+002026-01-01T12:00:00Z",
  "Thu, 01 Jan 2026 12:00:00 GMT",
  "1767268800",
];
// Fields GitHub sends as `null` when they have no value, which Postern reads
// as `null` or "", or, for an issue or pull request a query looks up, as not found.
const nullable = new Set([
  "parent",
  "lastEditedAt",
  "author",
  "user",
  "actor",
  "conclusion",
  "completed_at",
  "published_at",
  "commit_id",
  "submitted_at",
  "body",
  "description",
  "name",
  "endCursor",
  "issue",
  "pullRequest",
]);
// Names, logins, identifiers and platform words, which are never empty.
const words = new Set([
  "login",
  "node_id",
  "headRefName",
  "baseRefName",
  "tag_name",
  "path",
  "state",
  "status",
  "context",
  "event",
  "type",
  "__typename",
  "permission",
  "role_name",
  "conclusion",
]);
const malformedErrors = [
  [{}],
  [null],
  ["boom"],
  [{ type: "NOT_FOUND" }],
  [{ message: 1 }],
  [{ message: "m", type: 2 }],
  "boom",
  {},
  1,
];

// The changes to one value that make it unreadable wherever the adapter
// reads it, so the result can only be the original one or `invalidResponse`.
function changes(value: unknown, key: string | number | null): Change[] {
  const result: Change[] = [];
  if (typeof key === "string") result.push(["drop", drop]);
  const retypes: Record<string, unknown[]> = {
    string: [0, true, {}, []],
    number: ["1", false, {}, []],
    boolean: ["true", 1, {}, []],
    object:
      value === null
        ? ["x", 0, {}, []]
        : Array.isArray(value)
          ? [{}, "x", 1]
          : ["x", 1, [], true],
  };
  for (const other of retypes[typeof value] ?? [])
    result.push([`retype to ${JSON.stringify(other)}`, other]);
  if (value !== null && !(typeof key === "string" && nullable.has(key)))
    result.push(["retype to null", null]);
  const corrupt = (values: unknown[]) =>
    values.forEach((other) =>
      result.push([`corrupt to ${JSON.stringify(other)}`, other]),
    );
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) corrupt(badTimes);
    if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value))
      corrupt([value.slice(1), `${value}0`, `g${value.slice(1)}`, ""]);
    if (/^[1-9][0-9]*$/.test(value))
      corrupt(["", "0", "01", "1.0", "-1", "1e3", " 1", "9007199254740993"]);
    if (/^(?:OPEN|CLOSED|MERGED)$/.test(value))
      corrupt(["open", "Open", "DRAFT", ""]);
    if (/^https?:\/\//.test(value))
      corrupt(["", "not a url", "ftp://github.com/x", "javascript:alert(1)"]);
    if (key === "nameWithOwner")
      corrupt(["", "octo", "a/b/c", "/hello", "octo/"]);
    if (typeof key === "string" && words.has(key)) corrupt([""]);
  }
  if (Number.isInteger(value) && (value as number) > 0)
    corrupt([0, -1, 1.5, 2 ** 53, 1e300]);
  return result;
}

// Every place in a response: each field and item, and the response itself.
function places(
  value: unknown,
  path: (string | number)[] = [],
): (string | number)[][] {
  const here = [path];
  if (Array.isArray(value))
    return here.concat(
      ...value.map((item, index) => places(item, [...path, index])),
    );
  if (value !== null && typeof value === "object") {
    return here.concat(
      ...Object.entries(value).map(([key, item]) =>
        places(item, [...path, key]),
      ),
    );
  }
  return here;
}

// The response with one value changed, and what changed.
function mutate(
  random: Random,
  json: unknown,
): { json: unknown; change: string } {
  const copy = structuredClone(json);
  const isGraphql =
    copy !== null &&
    typeof copy === "object" &&
    !Array.isArray(copy) &&
    "data" in copy;
  if (isGraphql && random.chance(0.1)) {
    const errors = random.pick(malformedErrors);
    return {
      json: { ...copy, errors },
      change: `errors set to ${JSON.stringify(errors)}`,
    };
  }
  const path = random.pick(places(copy));
  const key = path.at(-1) ?? null;
  const parent = path
    .slice(0, -1)
    .reduce(
      (node, step) => node[step] as Record<string | number, unknown>,
      copy as Record<string | number, unknown>,
    );
  const value = key === null ? copy : parent[key];
  const options = changes(value, key);
  if (options.length === 0) return { json: copy, change: "nothing" };
  const [name, next] = random.pick(options);
  const change = `${name} at ${path.join(".") || "the root"}`;
  if (key === null) return { json: next, change };
  if (next === drop) delete parent[key];
  else parent[key] = next;
  return { json: copy, change };
}

describe("GitHub responses changed in one place (property)", () => {
  for (const [name, read] of Object.entries(reads) as [string, Read][]) {
    it(`read as the original or fail with invalidResponse and the status: ${name}`, async () => {
      const original = await run(read);
      assert.equal(
        original.error,
        undefined,
        `${name} fails on the fake's own responses`,
      );
      const property = `responses to ${name}`;
      let unreadable = 0;
      for (let index = 0; index < runs; index++) {
        const random = caseRandom(property, index);
        let change = "nothing";
        const outcome = await run(read, {
          skip: random.below(original.requests),
          body: (json) => {
            const mutated = mutate(random, json);
            change = mutated.change;
            return mutated.json;
          },
        });
        const context = `${reproduce(property, index)}: ${change}`;
        if (outcome.error === undefined) {
          assert.deepEqual(
            outcome.value,
            original.value,
            `${context}: read a different result`,
          );
          continue;
        }
        const error = outcome.error;
        assert.ok(
          error instanceof PlatformError,
          `${context}: failed with ${String(error)}`,
        );
        assert.equal(
          error.reason,
          "invalidResponse",
          `${context}: failed with ${error.reason}: ${error.message}`,
        );
        assert.equal(error.status, status, `${context}: lost the status`);
        unreadable++;
      }
      // Some changes hit a field the adapter reads, so the property is not vacuous.
      assert.ok(unreadable > 0, `none of ${runs} changes was unreadable`);
    });
  }
});
