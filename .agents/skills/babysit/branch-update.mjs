#!/usr/bin/env node

// Read-only recovery decision (merge-tree may write unreachable Git objects).
// Usage: branch-update.mjs <previous base> <previous head> <new base> <updates used> [<replacement head>]
// Full SHAs only. Exit 0 permits update, 3 requires owner handoff, 1 is an error.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const sha = /^[0-9a-f]{40}$/;

function git(root, args, input) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    input,
    timeout: 45_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.signal || ![0, 1].includes(result.status))
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result;
}

function output(root, args, input) {
  const result = git(root, args, input);
  if (result.status !== 0)
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function ancestor(root, base, head) {
  if (git(root, ["merge-base", "--is-ancestor", base, head]).status !== 0)
    throw new Error(
      `${base} is not an ancestor of ${head}; preserve work and establish ownership.`,
    );
}

const paths = (text) => new Set(text.split("\0").filter(Boolean));

function advance(previousBase, previousHead, newBase, root) {
  for (const commit of [previousBase, previousHead, newBase]) {
    if (!sha.test(commit ?? "")) throw new Error("Expected full commit SHAs.");
    output(root, ["cat-file", "-e", `${commit}^{commit}`]);
  }
  ancestor(root, previousBase, previousHead);
  ancestor(root, previousBase, newBase);
  if (previousBase === newBase) throw new Error("The base has not advanced.");
  const changed = paths(
    output(root, [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      `${previousBase}...${previousHead}`,
    ]),
  );
  // Inspect every added commit, including reverted changes and merge parents.
  const added = paths(
    output(root, [
      "log",
      "--format=",
      "--name-only",
      "--no-renames",
      "-z",
      "-m",
      `${previousBase}..${newBase}`,
    ]),
  );
  const overlapPaths = [...changed].filter((path) => added.has(path));
  const merge = git(root, [
    "merge-tree",
    "--write-tree",
    previousHead,
    newBase,
  ]);
  const clean = merge.status === 0;
  return {
    nonOverlapping: overlapPaths.length === 0 && clean,
    overlapPaths,
    clean,
  };
}

function patchId(root, base, head) {
  const diff = output(root, [
    "diff",
    "--binary",
    "--full-index",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    `${base}...${head}`,
  ]);
  return output(root, ["patch-id", "--stable"], diff).trim().split(" ")[0];
}

export function assessUpdate(
  previousBase,
  previousHead,
  newBase,
  updates,
  replacement,
  root = process.cwd(),
) {
  if (!Number.isSafeInteger(updates) || updates < 0)
    throw new Error("Updates used must be a nonnegative integer.");
  const result = advance(previousBase, previousHead, newBase, root);
  const reason =
    updates >= 3
      ? "base did not settle"
      : updates > 0 && !result.nonOverlapping
        ? "overlapping advance"
        : null;
  let patchUnchanged = false;
  if (replacement !== undefined) {
    if (!sha.test(replacement))
      throw new Error("Expected a full replacement head SHA.");
    ancestor(root, newBase, replacement);
    patchUnchanged =
      patchId(root, previousBase, previousHead) ===
      patchId(root, newBase, replacement);
  }
  return {
    action: reason ? "owner" : "update",
    reason,
    ...result,
    patchUnchanged,
  };
}

// Recompute proof against the actual platform head at each request/wait. No
// caller-supplied boolean, host state or configuration can waive review.
export function unchangedUpdate(proof, head, root = process.cwd()) {
  if (proof === undefined) return null;
  const commits = proof.split(":");
  if (commits.length !== 3)
    throw new Error(
      "--updated-from needs <previous base>:<previous head>:<new base> (full SHAs).",
    );
  const [base, previous, next] = commits;
  const result = assessUpdate(base, previous, next, 1, head, root);
  if (!result.nonOverlapping || !result.patchUnchanged)
    throw new Error(
      "Update is overlapping or its patch changed; repeat internal and external review without --updated-from.",
    );
  return previous;
}

export function main(argv = process.argv.slice(2)) {
  const [base, head, next, count, replacement, ...extra] = argv;
  if (extra.length || !/^\d+$/.test(count ?? ""))
    throw new Error(
      "Usage: branch-update.mjs <previous base> <previous head> <new base> <updates used> [<replacement head>]",
    );
  const result = assessUpdate(base, head, next, Number(count), replacement);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.action === "owner" ? 3 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
