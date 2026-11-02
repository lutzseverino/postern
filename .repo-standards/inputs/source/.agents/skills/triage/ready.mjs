#!/usr/bin/env node

import { setTimeout as wait } from "node:timers/promises";
import {
  issueContractResult,
  isSpecification,
} from "../../../scripts/validate-issue-contract.mjs";
import {
  connectionFor,
  executedAsScript,
  requestData,
} from "../babysit/platform.mjs";

const readiness = new Set(["ready-for-agent", "ready-for-human"]);

// Eligibility follows installed rules in the selected destination, independently
// of the checkout that supplies this command. Pin the default tip before reading.
async function factoryPolicy(connection) {
  const repository = connection.repository.path;
  const [owner, name] = repository.split("/");
  const query = async (source, variables = {}) => {
    const response = await requestData(connection, {
      method: "POST",
      path: "/graphql",
      body: { query: source, variables: { owner, name, ...variables } },
    });
    if (response?.errors?.length || !response?.data?.repository)
      throw new Error(
        `Could not establish factory applicability for ${repository}.`,
      );
    return response.data.repository;
  };
  const destination =
    await query(`query TriageReadinessPolicy($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      nameWithOwner
      defaultBranchRef { name target { __typename oid } }
    }
  }`);
  const branch = destination.defaultBranchRef;
  const revision = branch?.target?.oid;
  if (
    destination.nameWithOwner?.toLowerCase() !== repository.toLowerCase() ||
    typeof branch?.name !== "string" ||
    !branch.name ||
    branch.target?.__typename !== "Commit" ||
    !/^[0-9a-f]{40}$/i.test(revision ?? "")
  )
    throw new Error(
      `Could not establish factory applicability for ${repository}: missing default-branch commit.`,
    );
  const evidence = `${repository} default branch ${branch.name}@${revision}`;
  const files = await query(
    `query TriageFactoryRules($owner: String!, $name: String!, $revision: GitObjectID!, $rules: String!) {
    repository(owner: $owner, name: $name) {
      commit: object(oid: $revision) { __typename oid }
      rules: object(expression: $rules) { __typename }
    }
  }`,
    {
      revision,
      rules: `${revision}:.repo-standards/rules/factory-workflow.md`,
    },
  );
  if (
    files.commit?.__typename !== "Commit" ||
    files.commit.oid !== revision ||
    !(files.rules === null || files.rules?.__typename === "Blob")
  )
    throw new Error(
      `Could not establish factory applicability at ${evidence}.`,
    );
  return { factory: files.rules !== null, evidence };
}

async function actingAccount(connection) {
  // /user excludes installation tokens. Resolve the authenticated login through
  // GraphQL, then retain REST's precise account type using the same credential.
  const identity = await requestData(connection, {
    method: "POST",
    path: "/graphql",
    body: {
      query:
        "query TriageActingAccount { viewer { __typename login databaseId } }",
    },
  });
  const viewer = identity?.data?.viewer;
  if (
    identity?.errors?.length ||
    !["User", "Bot"].includes(viewer?.__typename) ||
    typeof viewer.login !== "string" ||
    !viewer.login.trim() ||
    !Number.isInteger(viewer.databaseId)
  )
    throw new Error("Could not identify the readiness acting account.");
  // GraphQL omits the "[bot]" suffix that REST logins and events carry.
  const login =
    viewer.__typename === "Bot" && !viewer.login.endsWith("[bot]")
      ? `${viewer.login}[bot]`
      : viewer.login;
  const actor = await requestData(connection, {
    path: `/users/${encodeURIComponent(login)}`,
  });
  // The matching account ID keeps a same-named person from standing in for it.
  if (
    !["User", "Bot", "App"].includes(actor?.type) ||
    actor.login !== login ||
    actor.id !== viewer.databaseId
  )
    throw new Error("Could not identify the readiness acting account.");
  return actor;
}

async function snapshot(connection, number) {
  const tracker = connection.issueTracker;
  const issue = await tracker.issue(number);
  const comments = await tracker.comments(number);
  const events = await tracker.labelChanges(number);
  // The validator's own reader interprets its published result.
  const { comment: feedback, state } = issueContractResult(comments);
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
  if (current.state?.status === "needs-attention")
    throw new Error(`Incomplete contract.\n${current.feedback.body}`);
  if (!current.state)
    throw new Error(
      current.feedback
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
  const actor = await actingAccount(connection);
  const policy = await factoryPolicy(connection);
  if (
    policy.factory &&
    (actor.type !== "User" || actor.login.endsWith("[bot]"))
  )
    throw new Error(
      `Readiness at ${policy.evidence} requires a person acting account; bot and App accounts cannot start factory work. ` +
        "Stop at acceptance: report the reviewed brief, revision, suggested labels and blockers to an authorized person. No factory work was started.",
    );
  let before;
  for (;;) {
    before = await snapshot(connection, number);
    if (
      policy.factory &&
      label === "ready-for-agent" &&
      !before.issue.subIssues.length &&
      !isSpecification(before.issue)
    ) {
      const models = new Set(
        [...before.issue.labels, ...companions].filter((name) =>
          name.startsWith("model:"),
        ),
      );
      if (models.size !== 1)
        throw new Error(
          "Factory agent readiness requires exactly one model: label in the resulting issue state; choose one and remove conflicting labels before retrying.",
        );
    }
    checkContract(before, revision);
    if (before.issue.state !== "open")
      throw new Error("Readiness requires an open issue.");
    if (!processed(before)) {
      await pause(2000);
      continue;
    }
    const staleParent = parentNeedsReapply(before, label);
    if (
      before.state.status !== "awaiting-review" &&
      !(staleParent && before.state.status === "approved")
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
  const chosenModels = companions.filter((name) => name.startsWith("model:"));
  if (policy.factory && chosenModels.length) {
    const existing = await connection.issueTracker.labels();
    for (const name of chosenModels) {
      if (!existing.some((entry) => entry.name === name))
        await connection.issueTracker.createLabel({
          name,
          color: "5319e7",
          description: `Factory model: ${name.slice("model:".length)}`,
        });
    }
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
