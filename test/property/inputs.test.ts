// Property: every input a caller passes is either accepted and sent exactly
// as the copy Postern checked, or rejected before any request. Each case
// builds a plain model of an input, then a realization of it a caller could
// pass: getters, Proxies, null prototypes, hidden fields, shared references,
// odd Unicode and URL-significant characters, with or without a defect such
// as a cycle, a hole, a symbol key or a getter that throws. Requests go
// through the real `fetch` to a loopback server, so the check is against what
// arrives on the wire.

import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { PlatformError, connect } from "../../src/index.ts";
import type { Connection } from "../../src/index.ts";
import { Random, caseRandom, reproduce, runs } from "./random.ts";

const token = "ghp_propertyToken0123456789";
const repository = "/repos/octo/hello";

interface Received {
  method: string;
  target: string;
  headers: [string, string][];
  body: string;
}

let received: Received[] = [];
// Requests an operation started, which may still arrive after it failed.
let inFlight: Promise<unknown>[] = [];

// Calls an operation and waits for every request it started; its failure, if any.
async function attempt(call: () => Promise<unknown>): Promise<unknown> {
  received = [];
  inFlight = [];
  let failure: unknown;
  try {
    await call();
  } catch (error) {
    failure = error ?? new Error("failed without an error");
  }
  await Promise.all(inFlight);
  return failure;
}
let server: http.Server;
let connection: Connection;

before(async () => {
  server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const raw = request.rawHeaders;
      const headers = Array.from({ length: raw.length / 2 }, (_, index) => [raw[2 * index]!, raw[2 * index + 1]!] as [string, string]);
      received.push({ method: request.method!, target: request.url!, headers, body: Buffer.concat(chunks).toString("utf8") });
      response.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // GitHub's API, moved to the loopback server: the request target is unchanged.
  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const response = globalThis.fetch(`${origin}${url.pathname}${url.search}`, init);
    // The server records a request before it answers, so an answer means it arrived.
    inFlight.push(response.catch(() => {}));
    return response;
  };
  connection = connect(`https://github.com${repository.slice("/repos".length)}`, { credential: token, fetch });
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

// What a case expects: acceptance, rejection, or either, as long as an
// accepted input arrives exactly as modeled.
type Expected = "accepted" | "rejected" | "either";

interface Generated<T = unknown> {
  value: T;
  model: unknown;
  expected: Expected;
  /** Whether `value` reads the same however often it is read, so it may be shared. */
  stable: boolean;
}

const combine = (...expectations: Expected[]): Expected =>
  expectations.includes("rejected") ? "rejected" : expectations.includes("either") ? "either" : "accepted";

// Text JSON carries as it is: odd Unicode, but no unpaired surrogate.
const textPieces = ["a", "Z", "0", " ", "é", "ß", "😀", "́", "\u0000", "\u001f", " ", "﻿", '"', "\\", "/", "<", "#", "?", "%", "&", "=", "+", "\n"];
const keyPieces = ["a", "b", "0", "1", "10", "é", "😀", " ", "%", "#"];
const specialKeys = ["", "__proto__", "constructor", "toJSON", "toString", "length", "0", "01", "4294967295"];
const numbers = [0, -0, 1, -1, 1.5, 1e21, 5e-324, Number.MAX_SAFE_INTEGER + 2, 0.1];

const key = (random: Random) => (random.chance(0.3) ? random.pick(specialKeys) : random.text(keyPieces, 4));

// A plain value as JSON holds it; objects may be shared, never cyclic.
function jsonModel(random: Random, depth: number, pool: object[]): unknown {
  if (depth > 0 && pool.length > 0 && random.chance(0.1)) return random.pick(pool);
  switch (random.below(depth > 0 ? 7 : 5)) {
    case 0:
    case 4:
      return random.text(textPieces, 6);
    case 1:
      return random.pick(numbers);
    case 2:
      return random.chance(0.5);
    case 3:
      return null;
    case 5: {
      const array = Array.from({ length: random.below(4) }, () => jsonModel(random, depth - 1, pool));
      pool.push(array);
      return array;
    }
    default: {
      const object: Record<string, unknown> = random.chance(0.2) ? Object.create(null) : {};
      for (let count = random.below(4); count > 0; count--) define(object, key(random), jsonModel(random, depth - 1, pool));
      pool.push(object);
      return object;
    }
  }
}

function hasNegativeZero(model: unknown): boolean {
  if (typeof model === "number") return Object.is(model, -0);
  if (model === null || typeof model !== "object") return false;
  return Object.values(model).some(hasNegativeZero);
}

function define(target: object, name: PropertyKey, value: unknown, enumerable = true): void {
  Object.defineProperty(target, name, { value, enumerable, writable: true, configurable: true });
}

// A getter that gives `first` once and something no check would accept after.
function once(first: unknown): () => unknown {
  let reads = 0;
  return () => (reads++ === 0 ? first : Symbol("read again"));
}

// A Proxy that gives each field once, and something no check would accept after.
function readOnce<T extends object>(target: T): T {
  const reads = new Map<PropertyKey, number>();
  return new Proxy(target, {
    get(object, name, receiver) {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      return count === 1 ? Reflect.get(object, name, receiver) : Symbol("read again");
    },
  });
}

function revoked(): object {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  return proxy;
}

const throwing = () => {
  throw new Error("unreadable");
};

// Values JSON would drop, coerce or refuse, or a request cannot carry.
const badValues: (() => unknown)[] = [
  () => undefined,
  () => Number.NaN,
  () => Number.POSITIVE_INFINITY,
  () => () => 1,
  () => Symbol("s"),
  () => 1n,
  () => new Date(0),
  () => new Map(),
  () => new Number(1),
  () => "a\uD800",
  () => "\uDC00b",
  () => ({ toJSON: () => 1 }),
  () => new (class Thing {})(),
  revoked,
];

const defect = 0.04;

// A value a caller could pass for `model`, with the same JSON, unless the
// result says it carries a defect. `ancestors` are the realized containers
// around it, `shared` the stable realizations of models seen before.
function realize(random: Random, model: unknown, ancestors: object[], shared: Map<object, unknown>): Generated {
  if (random.chance(defect)) return { value: random.pick(badValues)(), model, expected: "rejected", stable: false };
  if (model === null || typeof model !== "object") return { value: model, model, expected: "accepted", stable: true };
  if (shared.has(model)) return { value: shared.get(model), model, expected: "accepted", stable: true };
  const array = Array.isArray(model);
  const target: Record<PropertyKey, unknown> = array ? [] : Object.create(Object.getPrototypeOf(model));
  const children = Reflect.ownKeys(model).filter((name) => !array || name !== "length");
  const inside = [...ancestors, target];
  let expected: Expected = "accepted";
  let stable = true;
  for (const name of children) {
    const child = realize(random, (model as Record<PropertyKey, unknown>)[name], inside, shared);
    expected = combine(expected, child.expected);
    stable &&= child.stable;
    if (random.chance(0.2)) {
      Object.defineProperty(target, name, { get: once(child.value), enumerable: true, configurable: true });
      stable = false;
    } else {
      define(target, name, child.value);
    }
  }
  if (array) (target as unknown as unknown[]).length = (model as unknown[]).length;
  // What a check must refuse: a hole, a field JSON would drop, a cycle, a
  // getter that throws, or a prototype JSON does not write as it reads.
  if (random.chance(defect)) {
    expected = "rejected";
    stable = false;
    const change = random.below(array ? 9 : 6);
    if (change === 0) define(target, Symbol("s"), 1);
    else if (change === 1) define(target, children.length > 0 ? random.pick(children) : "x", ancestors.at(-1) ?? target);
    else if (change === 2) Object.defineProperty(target, "unreadable", { get: throwing, enumerable: true });
    else if (change === 3) Object.setPrototypeOf(target, array ? Object.create(Array.prototype) : { inherited: 1 });
    else if (change === 4) define(target, "cycle", target);
    else if (change === 5) Object.defineProperty(target, Symbol("hidden"), { get: throwing, enumerable: true });
    else if (change === 6) (target as unknown as unknown[]).length += 1;
    else if (change === 7) define(target, random.pick(["extra", "01", "-1", "1.5"]), 1, random.chance(0.5));
    else define(target, Symbol("hidden"), 1, false);
  } else if (!array && random.chance(0.1)) {
    // Fields JSON never writes, and a check never reads: hidden ones and hidden symbols.
    Object.defineProperty(target, random.chance(0.5) ? "hidden" : Symbol("hidden"), { get: throwing, enumerable: false });
  }
  let value: object = target;
  if (random.chance(0.15)) {
    value = readOnce(target);
    stable = false;
  } else if (random.chance(0.03)) {
    value = new Proxy(target, { ownKeys: throwing });
    expected = "rejected";
    stable = false;
  }
  if (stable && expected === "accepted") shared.set(model, value);
  return { value, model, expected, stable };
}

// Path pieces: those a URL keeps as written, and those it might change.
const pathSafe = ["repos", "octo", "hello", "issues", "1", "a-b", "x_y", "~z", "!$&'()*+,;=:@", "%41", "v1.0", "...", "|", "[x]"];
const pathRisky = ["#", "#frag", "?", "\\", " ", "\t", "\n", "\u0000", "\u007f", "é", "😀", ".", "..", "%2e", "%2E%2e", "%", "%zz", "^", "`", "{", "}", '"', "<", ">", ""];
const querySafe = ["a=1", "q=x+y", "b=%20", "c", "d=1&e=2", "f=/:@?"];
const queryRisky = ["#", " ", "'", '"', "<", "é", "", "\n", "\\"];

function path(random: Random): Generated<string> {
  if (random.chance(defect)) {
    const value = random.pick(["", "repos/octo", "//elsewhere.example/x", "/a\uD800", "/x?\uDC00", "https://api.github.com/user"]);
    return { value, model: value, expected: "rejected", stable: true };
  }
  let expected: Expected = "accepted";
  const piece = (safe: string[], risky: string[]) => {
    if (!random.chance(0.15)) return random.pick(safe);
    expected = "either";
    return random.pick(risky);
  };
  const segments = Array.from({ length: 1 + random.below(4) }, () => piece(pathSafe, pathRisky));
  let value = `/${segments.join("/")}`;
  if (random.chance(0.3)) value += `?${Array.from({ length: 1 + random.below(3) }, () => piece(querySafe, queryRisky)).join("&")}`;
  return { value, model: value, expected, stable: true };
}

function query(random: Random, shared: Map<object, unknown>): Generated {
  const model: Record<string, unknown> = random.chance(0.2) ? Object.create(null) : {};
  for (let count = random.below(4); count > 0; count--) {
    const scalar = random.pick([() => random.text(textPieces, 5), () => random.pick(numbers), () => random.chance(0.5)])();
    define(model, key(random), scalar);
  }
  if (random.chance(defect)) define(model, "nested", random.pick([{}, [], null]));
  const realized = realize(random, model, [], shared);
  const nested = Object.values(model).some((value) => value !== null && typeof value === "object") || Object.values(model).includes(null);
  return { ...realized, expected: nested ? "rejected" : realized.expected };
}

const headerSafe = ["x-a", "x-b", "x-c", "accept", "user-agent", "x-github-api-version", "if-none-match", "accept-language"];
const headerRisky = [
  "X-A",
  "authorization",
  "Authorization",
  "content-type",
  "connection",
  "host",
  "content-length",
  "transfer-encoding",
  "expect",
  "upgrade",
  "keep-alive",
  "te",
  "bad name",
  "",
  "x-é",
];
const valueSafe = ["a", "Z", "0", "-", "/", ";", "=", ",", '"', "*/*", "a b"];
const valueRisky = [" lead", "trail ", "\t", "a\u0001b", "\u007f", "é", "Ā", "\r\n", "", "a\u0000"];

function headers(random: Random, shared: Map<object, unknown>): Generated {
  const model: Record<string, unknown> = {};
  let expected: Expected = "accepted";
  for (let count = random.below(4); count > 0; count--) {
    let name = random.pick(headerSafe);
    if (random.chance(0.2)) {
      name = random.pick(headerRisky);
      expected = "either";
    }
    if (Object.keys(model).some((other) => other.toLowerCase() === name.toLowerCase())) expected = "either";
    let value = random.text(valueSafe, 3) || "v";
    if (random.chance(0.15)) {
      value = random.pick(valueRisky);
      expected = "either";
    }
    define(model, name, value);
  }
  if (random.chance(defect)) {
    define(model, "x-d", random.pick([1, true, null, "\uD800"]));
    expected = "rejected";
  }
  const realized = realize(random, model, [], shared);
  return { ...realized, expected: combine(expected, realized.expected) };
}

const methods = [undefined, "GET", "get", "POST", "post", "PUT", "Patch", "DELETE", "OPTIONS", "HEAD"];

function transportRequest(random: Random): Generated {
  const shared = new Map<object, unknown>();
  const requestPath = path(random);
  const parts: Record<string, Generated> = { path: requestPath };
  let method: unknown = random.pick(methods);
  let expected: Expected = "accepted";
  if (random.chance(defect)) {
    method = random.pick(["TRACE", "CONNECT", "", "BAD METHOD", 42]);
    expected = "rejected";
  }
  if (method !== undefined) parts.method = { value: method, model: method, expected, stable: true };
  if (random.chance(0.4)) parts.query = query(random, shared);
  if (random.chance(0.4)) parts.headers = headers(random, shared);
  const verb = typeof method === "string" ? method.toUpperCase() : "GET";
  if (random.chance(verb === "GET" || verb === "HEAD" ? 0.05 : 0.8)) {
    const model = jsonModel(random, 3, []);
    const body = realize(random, model, [], shared);
    // JSON writes -0 as 0, so a body holding it is not the value validated.
    parts.body = verb === "GET" || verb === "HEAD" || hasNegativeZero(model) ? { ...body, expected: "rejected" } : body;
  }
  // A field given as undefined is absent.
  for (const [name, part] of Object.entries(parts)) if (part.value === undefined) delete parts[name];
  if (parts.query !== undefined && requestPath.value.includes("?")) expected = combine(expected, "either");
  const model = Object.fromEntries(Object.entries(parts).map(([name, part]) => [name, part.model]));
  const fields = Object.fromEntries(Object.entries(parts).map(([name, part]) => [name, part.value]));
  expected = combine(expected, ...Object.values(parts).map((part) => part.expected));
  // The request object itself: plain, read through getters or a Proxy, or unreadable.
  let value: unknown = fields;
  if (random.chance(defect)) {
    value = random.chance(0.5) ? revoked() : Object.defineProperty({ ...fields }, "path", { get: throwing });
    expected = "rejected";
  } else if (random.chance(0.2)) {
    value = readOnce(fields);
  } else if (random.chance(0.2)) {
    value = Object.defineProperties(
      {},
      Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, { get: once(field), enumerable: true }])),
    );
  }
  return { value, model, expected, stable: false };
}

// The request target, body and headers an accepted request must arrive with.
function assertSent(model: Record<string, unknown>, sent: Received, context: string): void {
  const method = typeof model.method === "string" ? model.method.toUpperCase() : "GET";
  assert.equal(sent.method, method, `${context}: method`);
  const query = model.query as Record<string, unknown> | undefined;
  const pairs = Object.entries(query ?? {}).map(([name, value]): [string, string] => [name, String(value)]);
  const search = pairs.length > 0 ? `?${new URLSearchParams(pairs).toString()}` : "";
  assert.equal(sent.target, `${model.path}${search}`, `${context}: request target`);
  assert.equal(sent.body, model.body === undefined ? "" : JSON.stringify(model.body), `${context}: body`);
  for (const [name, value] of Object.entries((model.headers ?? {}) as Record<string, string>)) {
    const values = sent.headers.filter(([other]) => other.toLowerCase() === name.toLowerCase()).map(([, sentValue]) => sentValue);
    assert.deepEqual(values, [value], `${context}: header ${JSON.stringify(name)}`);
  }
  const credential = sent.headers.filter(([name]) => name.toLowerCase() === "authorization").map(([, value]) => value);
  assert.deepEqual(credential, [`Bearer ${token}`], `${context}: credential`);
}

const isRejected = (error: unknown) => error instanceof PlatformError && error.reason === "rejected";

describe("caller inputs (property)", () => {
  it("are sent exactly as checked, or rejected before any request: transport requests", async () => {
    const property = "transport requests";
    const tally = { accepted: 0, rejected: 0 };
    for (let index = 0; index < runs; index++) {
      const context = reproduce(property, index);
      const { value, model, expected } = transportRequest(caseRandom(property, index));
      const failure = await attempt(() => connection.access.request(value as never));
      if (failure === undefined) {
        assert.notEqual(expected, "rejected", `${context}: accepted an input with a defect: ${show(model)}`);
        assert.equal(received.length, 1, `${context}: requests sent`);
        assertSent(model as Record<string, unknown>, received[0]!, `${context}: ${show(model)}`);
        tally.accepted++;
      } else {
        assert.ok(isRejected(failure), `${context}: failed with ${String(failure)} for ${show(model)}`);
        assert.notEqual(expected, "accepted", `${context}: rejected a valid input (${(failure as Error).message}): ${show(model)}`);
        assert.equal(received.length, 0, `${context}: sent a request before rejecting`);
        tally.rejected++;
      }
    }
    // Both outcomes occur, so neither half of the property holds vacuously.
    assert.ok(tally.accepted > runs / 5 && tally.rejected > runs / 10, `accepted ${tally.accepted}, rejected ${tally.rejected}`);
  });

  const argumentPieces = ["a", "B", "1", "-", "/", ".", "..", "%", "%2e", "%2F", "#", "?", "&", "=", "+", "\\", " ", "\t", "é", "😀", "\u0000", ";", ":", "@"];

  // An argument string: any non-empty, well-formed text, or one with a defect.
  function argument(random: Random): { value: string; valid: boolean } {
    if (random.chance(0.05)) return { value: random.pick(["", "\uD800", "a\uDC00"]), valid: false };
    const value = random.chance(0.05) ? random.pick([".", ".."]) : random.text(argumentPieces, 5) || "x";
    return { value, valid: true };
  }
  const decoded = (sent: Received, prefix: string, suffix = "") => {
    assert.ok(sent.target.startsWith(prefix) && sent.target.endsWith(suffix), `request target ${sent.target}`);
    return sent.target.slice(prefix.length, sent.target.length - suffix.length);
  };
  const segment = (text: string) => text !== "." && text !== "..";
  type Operation = [
    name: string,
    valid: (text: string) => boolean,
    call: (text: string) => Promise<unknown>,
    check: (sent: Received[], text: string) => void,
  ];
  const operations: Operation[] = [
    [
      "removeLabel",
      segment,
      (text) => connection.issueTracker.removeLabel(1, text),
      ([sent], text) => assert.equal(decodeURIComponent(decoded(sent!, `${repository}/issues/1/labels/`)), text),
    ],
    [
      "role",
      segment,
      (text) => connection.access.role(text),
      ([sent], text) => assert.equal(decodeURIComponent(decoded(sent!, `${repository}/collaborators/`, "/permission")), text),
    ],
    [
      "checks",
      segment,
      (text) => connection.pullRequests.checks(text),
      (sent, text) => {
        for (const request of sent) {
          const commit = request.target.slice(`${repository}/commits/`.length).split("/")[0]!;
          assert.equal(decodeURIComponent(commit), text);
        }
      },
    ],
    [
      "tagCommit",
      (text) => !text.split("/").some((part) => part === "." || part === ".."),
      (text) => connection.releaseSource.tagCommit(text),
      ([sent], text) =>
        assert.equal(decoded(sent!, `${repository}/git/ref/tags/`).split("/").map(decodeURIComponent).join("/"), text),
    ],
    [
      "createComment",
      () => true,
      (text) => connection.issueTracker.createComment(1, text),
      ([sent], text) => assert.equal(sent!.body, JSON.stringify({ body: text })),
    ],
    [
      "byHeadBranch",
      () => true,
      (text) => connection.pullRequests.byHeadBranch(text),
      ([sent], text) => assert.equal((JSON.parse(sent!.body) as { variables: { branch: unknown } }).variables.branch, text),
    ],
  ];
  it("are sent exactly as checked, or rejected before any request: string arguments", async () => {
    for (const [name, valid, call, check] of operations) {
      const property = `string arguments to ${name}`;
      for (let index = 0; index < runs; index++) {
        const context = reproduce(property, index);
        const generated = argument(caseRandom(property, index));
        const text = generated.value;
        const expected: Expected = !generated.valid ? "rejected" : valid(text) ? "accepted" : "either";
        const failure = await attempt(() => call(text));
        if (isRejected(failure) && received.length === 0) {
          assert.notEqual(expected, "accepted", `${context}: rejected ${JSON.stringify(text)}`);
          continue;
        }
        assert.ok(!(failure instanceof PlatformError && failure.reason === "unavailable"), `${context}: ${String(failure)}`);
        assert.notEqual(expected, "rejected", `${context}: sent ${JSON.stringify(text)}`);
        assert.ok(received.length > 0, `${context}: no request and no rejection for ${JSON.stringify(text)}: ${String(failure)}`);
        check(received, text);
      }
    }
  });

  it("are sent exactly as checked, or rejected before any request: label lists", async () => {
    const property = "label lists";
    for (let index = 0; index < runs; index++) {
      const context = reproduce(property, index);
      const random = caseRandom(property, index);
      const model = Array.from({ length: 1 + random.below(3) }, () => random.text(textPieces, 4) || "bug");
      const labels = realize(random, model, [], new Map());
      // Only the items of a list of labels are sent, so its prototype does not matter.
      let otherPrototype = false;
      try {
        otherPrototype = Object.getPrototypeOf(labels.value) !== Array.prototype;
      } catch {}
      const expected = otherPrototype ? "either" : labels.expected;
      const failure = await attempt(() => connection.issueTracker.addLabels(1, labels.value as string[]));
      if (failure === undefined) {
        assert.notEqual(expected, "rejected", `${context}: accepted ${show(model)}`);
        assert.equal(received[0]?.body, JSON.stringify({ labels: model }), context);
      } else {
        assert.ok(isRejected(failure), `${context}: ${String(failure)}`);
        assert.notEqual(expected, "accepted", `${context}: rejected ${show(model)}: ${(failure as Error).message}`);
        assert.equal(received.length, 0, context);
      }
    }
  });
});

function show(model: unknown): string {
  try {
    return JSON.stringify(model) ?? String(model);
  } catch {
    return String(model);
  }
}
