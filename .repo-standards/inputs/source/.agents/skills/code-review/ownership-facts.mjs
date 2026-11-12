#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

/** Collect facts for two pinned trees; ownership judgments belong to review. */
export function ownershipFacts(cwd, comparisonBase, head) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  const commit = (ref) =>
    git("rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`).trim();
  const baseSha = commit(comparisonBase);
  const headSha = commit(head);
  const paths = (output) => output.split("\0").filter(Boolean);
  const basePaths = paths(git("ls-tree", "-r", "--name-only", "-z", baseSha));
  const extensions = new Set(basePaths.map((path) => posix.extname(path)));
  const directory = (path) => (path.includes("/") ? path.split("/")[0] : null);
  const directories = new Set(basePaths.map(directory).filter(Boolean));
  const diff = [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    "--name-only",
    "-z",
  ];
  const touched = paths(git(...diff, baseSha, headSha, "--"));
  const added = new Set(
    paths(git(...diff, "--diff-filter=A", baseSha, headSha, "--")),
  );
  if (!touched.length) return [];

  const attributed = new Set();
  // --source pins tree attributes, but the source repository's info/attributes
  // and global/system attributes still override or supplement that tree.
  const isolated = mkdtempSync(join(tmpdir(), "rc-ownership-"));
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
    ),
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_OBJECT_DIRECTORY: git(
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "objects",
    ).trim(),
  };
  try {
    execFileSync(
      "git",
      [
        "init",
        "--bare",
        "--quiet",
        "--template=",
        `--object-format=${git("rev-parse", "--show-object-format").trim()}`,
        isolated,
      ],
      { env },
    );
    for (const sha of [baseSha, headSha]) {
      const attributes = execFileSync(
        "git",
        [
          "--git-dir",
          isolated,
          "-c",
          "core.attributesFile=",
          "check-attr",
          `--source=${sha}`,
          "-z",
          "--stdin",
          "linguist-vendored",
        ],
        {
          cwd,
          env,
          encoding: "utf8",
          input: `${touched.join("\0")}\0`,
          maxBuffer: 32 * 1024 * 1024,
        },
      ).split("\0");
      for (let i = 0; i + 2 < attributes.length; i += 3)
        if (["set", "true"].includes(attributes[i + 2]))
          attributed.add(attributes[i]);
    }
  } finally {
    rmSync(isolated, { recursive: true, force: true });
  }

  const facts = [];
  for (const path of touched) {
    const sources = [];
    if (path.startsWith("vendor/")) sources.push("vendor");
    if (attributed.has(path)) sources.push("linguist-vendored");
    if (sources.length) facts.push({ kind: "vendored", path, sources });
    if (!added.has(path)) continue;
    const extension = posix.extname(path);
    const top = directory(path);
    const newExtension = extensions.has(extension)
      ? {}
      : { newExtension: extension };
    const newDirectory =
      !top || directories.has(top) ? {} : { newTopLevelDirectory: top };
    if (Object.keys(newExtension).length || Object.keys(newDirectory).length)
      facts.push({
        kind: "added-file",
        path,
        ...newExtension,
        ...newDirectory,
      });
  }
  return facts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [base, head, ...extra] = process.argv.slice(2);
    if (!base || !head || extra.length)
      throw new Error(
        "Usage: node ownership-facts.mjs <comparison-base> <head>",
      );
    console.log(
      JSON.stringify(ownershipFacts(process.cwd(), base, head), null, 2),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
