import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlatformError, detectPlatform } from "../src/index.ts";

describe("detectPlatform", () => {
  const github = { platform: "github", host: "github.com", path: "octo/hello" };

  for (const remote of [
    "https://github.com/octo/hello",
    "https://github.com/octo/hello.git",
    "https://github.com/octo/hello/",
    "https://GitHub.com/octo/hello.git",
    "https://someone@github.com/octo/hello.git",
    "git@github.com:octo/hello.git",
    "git@github.com:octo/hello",
    "ssh://git@github.com/octo/hello.git",
    "ssh://git@ssh.github.com:443/octo/hello.git",
    "git+ssh://git@github.com/octo/hello.git",
  ]) {
    it(`maps ${remote} to the GitHub repository path`, () => {
      assert.deepEqual(detectPlatform(remote), github);
    });
  }

  for (const remote of [
    "https://gitlab.com/group/subgroup/project.git",
    "git@codeberg.org:octo/hello.git",
    "https://github.example.com/octo/hello.git",
    "https://github.com/octo",
    "https://github.com/octo/hello/tree/main",
    "/srv/git/hello.git",
    "file:///srv/git/hello.git",
    "",
  ]) {
    it(`fails with unsupported for ${JSON.stringify(remote)}`, () => {
      assert.throws(
        () => detectPlatform(remote),
        (error) => error instanceof PlatformError && error.reason === "unsupported",
      );
    });
  }

  it("keeps credentials in a remote out of its error", () => {
    assert.throws(
      () => detectPlatform("https://x-access-token:s3cr3t-value@gitlab.com/a/b.git"),
      (error) =>
        error instanceof PlatformError &&
        !JSON.stringify({ ...error, message: error.message }).includes("s3cr3t-value"),
    );
  });
});
