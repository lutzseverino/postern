#!/usr/bin/env node

import { setTimeout as wait } from "node:timers/promises";
import {
  connectionFor,
  executedAsScript,
  requestData,
} from "../babysit/platform.mjs";

const readiness = new Set(["ready-for-agent", "ready-for-human"]);
const marker = "<!-- repo-canon:issue-contract-feedback -->";

async function snapshot(connection, number) {
  const tracker = connection.issueTracker;
  const issue = await tracker.issue(number);
  const comments = await tracker.comments(number);
  const events = await tracker.labelChanges(number);
  const feedback = comments.findLast(
    (comment) =>
      comment.author?.login === "github-actions[bot]" &&
      comment.body.includes(marker),
  );
  const encoded = /<!-- repo-canon:issue-contract-state (.+) -->/.exec(
    feedback?.body ?? "",
  );
  const state = encoded ? JSON.parse(encoded[1]) : null;
  const latest = events.findLast(
    (event) =>
      readiness.has(event.label) &&
      !(
        event.action === "removed" &&
        event.actor?.login === "github-actions[bot]"
      ),
  );
  return { issue, events, feedback, state, latest };
}

const processed = ({ state, latest }) =>
  (state?.observedEventId ?? state?.reviewEventId ?? null) ===
  (latest ? String(latest.id) : null);

function parentNeedsReapply({ issue, events }, label) {
  if (
    !issue.subIssues.length ||
    !issue.linkTime ||
    !issue.labels.includes(label)
  )
    return false;
  const applied = events.findLast(
    (event) => event.label === label && event.action === "added",
  );
  return !applied || Date.parse(applied.time) <= Date.parse(issue.linkTime);
}

function checkContract(current, revision) {
  if (current.feedback?.body.includes("## Issue contract needs attention"))
    throw new Error(`Incomplete contract.\n${current.feedback.body}`);
  if (!current.state)
    throw new Error("The validator's contract revision notice is missing.");
  if (current.state.revision !== revision)
    throw new Error(
      "The reviewed revision differs from the current revision; review the current notice again.",
    );
}

function argumentsFor(argv) {
  const args = [...argv];
  let repository;
  const flag = args.indexOf("--repo");
  if (flag !== -1) {
    repository = args[flag + 1];
    args.splice(flag, 2);
  }
  const [issue, label, revision, ...companions] = args;
  const number = Number(issue);
  if (
    !/^[1-9]\d*$/.test(issue ?? "") ||
    !Number.isSafeInteger(number) ||
    !readiness.has(label) ||
    !/^sha256:[a-f0-9]{64}$/.test(revision ?? "") ||
    companions.some(
      (name) => !name.trim() || name.startsWith("--") || readiness.has(name),
    ) ||
    (flag !== -1 && (!repository || repository.startsWith("--")))
  )
    throw new Error(
      "Usage: node ready.mjs <issue> <ready-for-agent|ready-for-human> <sha256:reviewed-revision> [companion-label ...] [--repo owner/name]",
    );
  return {
    number,
    label,
    revision,
    companions: [...new Set(companions)],
    repository,
  };
}

// The caller bounds this foreground wait. Reuse the validator's two-second
// timeline polling cadence; there is no invocation timeout here.
/**
 * @param {string[]} [argv]
 * @param {any} [connection]
 * @param {(milliseconds: number) => Promise<unknown>} [pause]
 * @param {() => number} [now]
 */
export async function main(
  argv = process.argv.slice(2),
  connection,
  pause = wait,
  now = Date.now,
) {
  const { number, label, revision, companions, repository } =
    argumentsFor(argv);
  connection ??= connectionFor(repository);
  // The neutral account port loses the distinction between App and User.
  const actor = await requestData(connection, { path: "/user" });
  if (actor?.type !== "User" || !actor.login || actor.login.endsWith("[bot]"))
    throw new Error(
      "Readiness requires a person acting account; bot and App accounts cannot start factory work.",
    );
  let before;
  for (;;) {
    before = await snapshot(connection, number);
    const models = companions.filter((name) => name.startsWith("model:"));
    if (
      models.length > 1 ||
      before.issue.labels.some(
        (name) => name.startsWith("model:") && !models.includes(name),
      )
    )
      throw new Error(
        "A different model: label already exists, or multiple model: labels were given.",
      );
    checkContract(before, revision);
    if (before.issue.state !== "open")
      throw new Error("Readiness requires an open issue.");
    if (!processed(before)) {
      await pause(2000);
      continue;
    }
    const staleParent = parentNeedsReapply(before, label);
    if (
      !(
        before.state.status === "awaiting-review" &&
        before.feedback.body.includes("## Issue contract awaiting review")
      ) &&
      !(
        staleParent &&
        before.state.status === "approved" &&
        before.feedback.body.includes("## Issue contract readiness recorded")
      )
    )
      throw new Error(
        "The feedback does not report a complete contract awaiting review.",
      );
    if (before.issue.subIssues.length && !before.issue.linkTime) {
      await pause(2000);
      continue;
    }
    if (staleParent) {
      await connection.issueTracker.removeLabel(number, label);
      await pause(2000);
      continue;
    }
    if (before.issue.labels.some((name) => readiness.has(name)))
      throw new Error(
        "Readiness is already present; remove the stale attempt and review the revision notice again.",
      );
    // The validator requires its revision notice in a strictly earlier second.
    const barrier = Math.max(
      Date.parse(before.feedback.updatedAt),
      Date.parse(before.issue.linkTime) || 0,
    );
    if (Math.floor(now() / 1000) <= Math.floor(barrier / 1000)) {
      await pause(2000);
      continue;
    }
    break;
  }
  await connection.issueTracker.addLabels(number, [...companions, label]);
  for (;;) {
    const current = await snapshot(connection, number);
    checkContract(current, revision);
    const own = current.events.findLast(
      (event) =>
        event.action === "added" &&
        event.label === label &&
        event.actor?.login === actor.login &&
        !before.events.some((previous) => previous.id === event.id),
    );
    if (own && processed(current)) {
      if (current.state.rejectionReason)
        throw new Error(current.state.rejectionReason);
      if (
        current.state.status !== "approved" ||
        current.state.reviewer !== actor.login ||
        current.state.label !== label ||
        current.state.reviewEventId !== String(own.id) ||
        !current.issue.labels.includes(label)
      )
        throw new Error(
          "The validator did not approve this account's readiness event.",
        );
      if (parentNeedsReapply(current, label)) {
        await connection.issueTracker.removeLabel(number, label);
        await pause(2000);
        return main(argv, connection, pause, now);
      }
      console.log(
        `Issue #${number}: ${label} approved at ${revision} by @${actor.login}.`,
      );
      return 0;
    }
    await pause(2000);
  }
}

if (import.meta.main ?? executedAsScript(import.meta.url)) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
