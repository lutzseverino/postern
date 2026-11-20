#!/usr/bin/env node

import { setTimeout as wait } from "node:timers/promises";
import { factorySkipLabel } from "../../../operations/lib/factory-labels.mjs";
import {
  contractFootprint,
  footprintRefusal,
  issueContractResult,
  isSpecification,
  noticePrecedes,
  observedChangeId,
  readyLabels,
  readIssueContractObservation,
  supersededWithoutFate,
  supersessionRefusal,
} from "../../../vendor/repo-canon/validate-issue-contract.mjs";
import {
  connectionFor,
  executedAsScript,
  pinnedFiles,
  requestData,
} from "../babysit/platform.mjs";

// The validator binds one ready label; a companion carries no other state.
const [readyLabel] = readyLabels;

// Seam (deferred): Scriptorium configuration reads; consumers: 6; extraction proposed in https://github.com/lutzseverino/repo-canon/issues/967.
// The model label prefix this readiness needs, or null: only where the
// destination's installed factory rules apply and its factory configuration
// names this ready label. Both come from one pinned default-branch commit,
// independently of the checkout that supplies this command.
async function modelPolicy(connection) {
  try {
    const { files, evidence } = await pinnedFiles(connection, {
      rules: ".repo-standards/rules/factory-workflow.md",
      configuration: ".scriptorium/config.json",
    });
    if (files.rules === null) return null;
    const { labels, modelLabelPrefix } =
      JSON.parse(files.configuration ?? "null") ?? {};
    if (typeof labels?.ready !== "string" || !modelLabelPrefix?.trim?.())
      throw new Error(
        `${evidence}: .scriptorium/config.json names no ready label and model label prefix.`,
      );
    return labels.ready === readyLabel ? modelLabelPrefix : null;
  } catch (error) {
    throw new Error(
      `Could not establish factory applicability: ${error.message}`,
      { cause: error },
    );
  }
}

// The authenticated login, whose own readiness event the validator's verdict
// must approve. /user excludes installation tokens, so ask GraphQL.
async function actingLogin(connection) {
  const identity = await requestData(connection, {
    method: "POST",
    path: "/graphql",
    body: {
      query: "query TriageActingAccount { viewer { __typename login } }",
    },
  });
  const viewer = identity?.data?.viewer;
  if (
    identity?.errors?.length ||
    !["User", "Bot"].includes(viewer?.__typename) ||
    typeof viewer.login !== "string" ||
    !viewer.login.trim()
  )
    throw new Error("Could not identify the readiness acting account.");
  // GraphQL omits the "[bot]" suffix that REST logins and events carry.
  return viewer.__typename === "Bot" && !viewer.login.endsWith("[bot]")
    ? `${viewer.login}[bot]`
    : viewer.login;
}

async function snapshot(connection, number) {
  const tracker = connection.issueTracker;
  const issue = await tracker.issue(number);
  const comments = await tracker.comments(number);
  const events = await tracker.labelChanges(number);
  // The validator's own reader interprets its published result.
  const result = issueContractResult(comments);
  const current =
    (result.state?.format === "repo-canon/issue-contract-state/v2" ||
     result.state?.baseFormat === "repo-canon/issue-contract-state/v2")
      ? result.state.observation ===
        (await readIssueContractObservation(
          connection,
          issue,
          comments,
          events,
        ))
      : true;
  return { issue, events, current, ...result };
}

// The validator's refusal of a new grant, checked before any label write,
// including the withdrawal that records approved readiness again: a direct
// contract's malformed footprint, or a specification's superseded issue
// without a fate.
async function grantRefusal(connection, { issue, state }) {
  const repository = connection.repository.path;
  const footprint = footprintRefusal(state.kind, issue.body, repository);
  if (footprint || !isSpecification(issue)) return footprint;
  const unfated = await supersededWithoutFate({
    specification: { repository, number: issue.number },
    footprint: contractFootprint(issue.body, repository),
    tickets: issue.subIssues,
    trackerFor: (path) =>
      path.toLowerCase() === repository.toLowerCase()
        ? connection.issueTracker
        : connectionFor(path).issueTracker,
  });
  return supersessionRefusal(unfated, repository);
}

// Whether the result has observed the latest readiness change.
const processed = ({ state, events, current }) =>
  current &&
  (state?.observedEventId ?? state?.reviewEventId ?? null) ===
    observedChangeId(events);

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

// Creates each required companion the repository lacks, keeping existing
// labels' metadata: model labels under the factory prefix and the skip label.
async function provisionLabels(connection, prefix, companions) {
  const requiredLabels = companions
    .filter((name) => prefix !== null && name.startsWith(prefix))
    .map((name) => ({
      name,
      color: "5319e7",
      description: `Factory model: ${name.slice(prefix.length)}`,
    }));
  if (prefix !== null && companions.includes(factorySkipLabel.name))
    requiredLabels.push(factorySkipLabel);
  if (!requiredLabels.length) return;
  const existing = await connection.issueTracker.labels();
  for (const definition of requiredLabels) {
    if (!existing.some((entry) => entry.name === definition.name))
      await connection.issueTracker.createLabel(definition);
  }
}

// Withdraws readiness so it can be recorded again, after attaching the given
// companions so readiness never comes off before them. The caller then waits
// for the validator to report the removal awaiting review.
async function withdrawReadiness(connection, number, prefix, companions) {
  if (companions.length) {
    await provisionLabels(connection, prefix, companions);
    await connection.issueTracker.addLabels(number, companions);
  }
  await connection.issueTracker.removeLabel(number, readyLabel);
}

function checkContract(current, revision) {
  if (current.state?.status === "needs-attention")
    throw new Error(`Incomplete contract.\n${current.comment.body}`);
  if (!current.state)
    throw new Error(
      current.comment
        ? "The validator's contract result has an unknown format; update this command."
        : "The validator's contract revision notice is missing.",
    );
  if (!["awaiting-review", "approved"].includes(current.state.status))
    throw new Error(
      "The feedback does not report a complete contract awaiting review.",
    );
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
  const [issue, revision, ...companions] = args;
  const number = Number(issue);
  if (
    !/^[1-9]\d*$/.test(issue ?? "") ||
    !Number.isSafeInteger(number) ||
    !/^sha256:[a-f0-9]{64}$/.test(revision ?? "") ||
    companions.some(
      (name) =>
        !name.trim() || name.startsWith("--") || name.startsWith("state:"),
    ) ||
    (flag !== -1 && (!repository || repository.startsWith("--")))
  )
    throw new Error(
      "Usage: node ready.mjs <issue> <sha256:reviewed-revision> [companion-label ...] [--repo owner/name]",
    );
  return {
    number,
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
  const { number, revision, companions, repository } = argumentsFor(argv);
  connection ??= connectionFor(repository);
  const login = await actingLogin(connection);
  const prefix = await modelPolicy(connection);
  const isModel = (name) => prefix !== null && name.startsWith(prefix);
  let before;
  let refusalChecked = false;
  for (;;) {
    before = await snapshot(connection, number);
    if (
      prefix !== null &&
      !before.issue.subIssues.length &&
      !isSpecification(before.issue) &&
      new Set([...before.issue.labels, ...companions].filter(isModel)).size !==
        1
    )
      throw new Error(
        `Factory agent readiness requires exactly one ${prefix} label in the resulting issue state; choose one and remove conflicting labels before retrying.`,
      );
    checkContract(before, revision);
    if (before.issue.state !== "open")
      throw new Error("Readiness requires an open issue.");
    if (!processed(before)) {
      await pause(2000);
      continue;
    }
    if (!refusalChecked) {
      const refusal = await grantRefusal(connection, before);
      if (refusal) throw new Error(refusal);
      refusalChecked = true;
    }
    const staleParent = parentNeedsReapply(before, readyLabel);
    // Approved readiness lacking a requested companion is recorded again.
    const missing =
      before.state.status === "approved" &&
      before.issue.labels.includes(readyLabel)
        ? companions.filter((name) => !before.issue.labels.includes(name))
        : [];
    if (
      before.state.status !== "awaiting-review" &&
      !(staleParent && before.state.status === "approved") &&
      !missing.length
    )
      throw new Error(
        "The feedback does not report a complete contract awaiting review.",
      );
    if (before.issue.subIssues.length && !before.issue.linkTime) {
      await pause(2000);
      continue;
    }
    if (staleParent || missing.length) {
      await withdrawReadiness(
        connection,
        number,
        prefix,
        staleParent ? [] : missing,
      );
      await pause(2000);
      continue;
    }
    if (before.issue.labels.includes(readyLabel))
      throw new Error(
        "Readiness is already present; remove the stale attempt and review the revision notice again.",
      );
    // Readiness follows the revision notice, and a parent's latest link, in a
    // strictly later second.
    const second = Math.floor(now() / 1000) * 1000;
    if (
      noticePrecedes(
        before,
        new Date(second).toISOString().replace(".000Z", "Z"),
      ) &&
      !(Date.parse(before.issue.linkTime) >= second)
    )
      break;
    await pause(2000);
  }
  await provisionLabels(connection, prefix, companions);
  await connection.issueTracker.addLabels(number, [...companions, readyLabel]);
  for (;;) {
    const current = await snapshot(connection, number);
    checkContract(current, revision);
    const own = current.events.findLast(
      (event) =>
        event.action === "added" &&
        event.label === readyLabel &&
        event.actor?.login === login &&
        !before.events.some((previous) => previous.id === event.id),
    );
    if (own && processed(current)) {
      if (current.state.rejectionReason)
        throw new Error(current.state.rejectionReason);
      if (
        current.state.status !== "approved" ||
        current.state.reviewer !== login ||
        current.state.label !== readyLabel ||
        current.state.reviewEventId !== String(own.id) ||
        !current.issue.labels.includes(readyLabel)
      )
        throw new Error(
          "The validator did not approve this account's readiness event.",
        );
      if (parentNeedsReapply(current, readyLabel)) {
        await withdrawReadiness(connection, number, prefix, []);
        await pause(2000);
        return main(argv, connection, pause, now);
      }
      console.log(
        `Issue #${number}: ${readyLabel} approved at ${revision} by @${login}.`,
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
