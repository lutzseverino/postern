#!/usr/bin/env node

// Usage: node merge.mjs <number> <head SHA>, from the repository root.
// Exit codes: 0 merged, 1 usage or platform error, 2 head changed; wait again,
// 3 not merged; needs the owner.
import { connectionFor, executedAsScript } from "./platform.mjs";

function needsOwner(message) {
  console.error(message);
  process.exitCode = 3;
}

function retry() {
  console.error("PR head changed; wait again before merging.");
  process.exitCode = 2;
}

export async function main(argv = process.argv.slice(2), connection) {
  const [number, head, ...extra] = argv;
  if (
    !/^[1-9]\d*$/.test(number ?? "") ||
    !/^[a-f0-9]{40}$/i.test(head ?? "") ||
    extra.length
  ) {
    throw new Error("Usage: node merge.mjs <number> <head SHA>");
  }
  connection ??= connectionFor();
  const pullRequest = await connection.pullRequests.pullRequest(Number(number));
  if (pullRequest.headCommit !== head) return retry();
  if (await connection.pullRequests.mergesThroughQueue(Number(number))) {
    return needsOwner(
      "The base branch requires a merge queue, which cannot apply the explicit squash message CONTRIBUTING.md requires; needs the owner.",
    );
  }
  let mergedCommit;
  try {
    mergedCommit = await connection.pullRequests.squashMerge(Number(number), {
      expectedHead: head,
      title: `${pullRequest.title} (#${number})`,
      body: pullRequest.body ?? "",
    });
  } catch (error) {
    if (
      (await connection.pullRequests.pullRequest(Number(number))).headCommit !==
      head
    )
      return retry();
    if (
      error.reason === "invalidResponse" &&
      error.message === "GitHub answered the merge without merging."
    )
      return needsOwner("The pull request did not merge; needs the owner.");
    throw error;
  }
  if (
    (await connection.pullRequests.pullRequest(Number(number))).state !==
    "merged"
  ) {
    return needsOwner("The pull request did not merge; needs the owner.");
  }
  process.stdout.write(`${mergedCommit}\n`);
}

if (import.meta.main ?? executedAsScript(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
