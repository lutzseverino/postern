import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Secrets } from "../src/secrets.ts";

const secretsOf = (...values: string[]) => {
  const secrets = new Secrets();
  for (const value of values) secrets.add(value);
  return secrets;
};

describe("redaction", () => {
  it("redacts objects without a prototype", () => {
    const value = Object.assign(Object.create(null) as Record<string, unknown>, { note: "uses t0ken", list: ["t0ken"] });
    assert.deepEqual({ ...secretsOf("t0ken").redact(value) }, { note: "uses <REDACTED>", list: ["<REDACTED>"] });
  });

  for (const [name, values, text, expected] of [
    ["a credential that extends an earlier one", ["abc", "abcdef"], "token abcdef", "token <REDACTED>"],
    ["a credential contained in a later one", ["abcdef", "abc"], "abc then abcdef", "<REDACTED> then <REDACTED>"],
    ["credentials that overlap", ["abcdef", "defghi"], "xabcdefghix", "x<REDACTED>x"],
    ["a credential that overlaps itself", ["aa"], "aaa", "<REDACTED>"],
    ["adjacent credentials", ["abc", "def"], "abcdef", "<REDACTED><REDACTED>"],
  ] as const) {
    it(`leaves no part of ${name}`, () => {
      assert.equal(secretsOf(...values).redactText(text), expected);
    });
  }

  it("redacts the name of an error's cause", () => {
    const cause = new Error("failed");
    cause.name = "s3cr3t-value";
    const error = secretsOf("s3cr3t-value").sanitize(cause);
    assert.equal((error.cause as Error).name, "<REDACTED>");
  });
});
