// Repository-owned names, shared by validation, wait and merge.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const requiredChecksTarget = ".github/required-checks.json";
export const readRequiredChecks = (root = process.cwd()) =>
  parseRequiredChecks(readFileSync(join(root, requiredChecksTarget), "utf8"));

export function parseRequiredChecks(text) {
  const invalid = (field) => {
    throw new Error(`${requiredChecksTarget}: ${field}`);
  };
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    invalid(`invalid JSON: ${error.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("root must be an object.");
  if (value.version !== 1) invalid("version must be 1.");
  if (!Array.isArray(value.checks) || !value.checks.length)
    invalid("checks must be a nonempty array.");
  value.checks.forEach((name, index) => {
    if (typeof name !== "string" || !name.trim())
      invalid(`checks[${index}] must be a nonempty string.`);
  });
  return value.checks;
}

export const failedConclusions = new Set([
  "ACTION_REQUIRED",
  "CANCELLED",
  "FAILURE",
  "STALE",
  "STARTUP_FAILURE",
  "TIMED_OUT",
  "ERROR",
]);

// Turns GitHub's status check rollup, read through Access, into check states. Any unfinished
// run keeps its check pending; otherwise the latest-started run wins.
export const checkStates = (rollup, positiveOnly = false) => {
  const latest = new Map();
  for (const item of rollup ?? []) {
    const isRun = item.__typename === "CheckRun";
    const name = isRun ? item.name : item.context;
    const key = `${positiveOnly ? item.__typename : ""}/${item.workflowName ?? ""}/${name}`;
    const known = latest.get(key);
    const result = isRun
      ? item.status === "COMPLETED"
        ? item.conclusion
        : "PENDING"
      : item.state;
    const pending = ["PENDING", "EXPECTED"].includes(result);
    if (known) {
      const knownPending = known.check.state === "pending";
      if (knownPending && !pending) continue;
      if (
        knownPending === pending &&
        (known.startedAt ?? "") > (item.startedAt ?? "")
      )
        continue;
    }
    if (
      positiveOnly &&
      known &&
      known.startedAt === item.startedAt &&
      known.check.state === "fail"
    )
      continue;
    latest.set(key, {
      startedAt: item.startedAt,
      check: {
        name,
        state: pending
          ? "pending"
          : (
                positiveOnly
                  ? result !== "SUCCESS"
                  : failedConclusions.has(result)
              )
            ? "fail"
            : "pass",
        link: isRun ? item.detailsUrl : item.targetUrl,
        ...(isRun
          ? {
              workflowName: item.workflowName,
              checkRunStartedAt: item.startedAt,
            }
          : {}),
      },
    });
  }
  return [...latest.values()].map((entry) => entry.check);
};

// Keep the existing observed-check/attempt protections, and additionally require
// positive success for each exact declared name. Duplicate identities must all
// succeed; conflicting evidence at an indistinguishable attempt fails closed.
export function requiredCheckStates(rollup, names, runs = []) {
  return names.flatMap((name) => {
    let matches = rollup.filter((item) => (item.name ?? item.context) === name);
    const statuses = matches.filter(
      (item) => item.__typename === "StatusContext",
    );
    if (statuses.length > 1) {
      if (statuses.some((item) => !Number.isFinite(Date.parse(item.createdAt))))
        throw new Error(
          `Ambiguous commit-status attempts for required check ${name}.`,
        );
      const latest = statuses
        .map((item) => item.createdAt)
        .sort()
        .at(-1);
      matches = matches.filter(
        (item) =>
          item.__typename !== "StatusContext" || item.createdAt === latest,
      );
    }
    const states = checkStates(matches, true);
    if (!states.length) return [{ name, state: "pending" }];
    for (const check of states) {
      if (!check.workflowName) continue;
      const link = /^(.*\/actions\/runs\/\d+)(?:[/?#]|$)/.exec(
        check.link ?? "",
      )?.[1];
      const linked = runs.find((run) => run.html_url === link);
      const named = runs.filter((run) => run.name === check.workflowName);
      const ids = new Set(named.map((run) => run.workflow_id));
      const id =
        linked?.workflow_id ?? (ids.size === 1 ? [...ids][0] : undefined);
      if (!linked && ids.size > 1)
        throw new Error(
          `Ambiguous workflow identity for required check ${name}.`,
        );
      if (
        runs.some(
          (run) =>
            run.workflow_id === id &&
            !Number.isFinite(Date.parse(run.run_started_at)),
        )
      )
        throw new Error(
          `Incomplete workflow attempt for required check ${name}.`,
        );
      const latest = runs
        .filter((run) => run.workflow_id === id)
        .sort((a, b) => b.run_started_at.localeCompare(a.run_started_at))[0];
      if (
        latest &&
        Date.parse(check.checkRunStartedAt) <
          Date.parse(latest.run_started_at) &&
        check.state !== "fail"
      )
        check.state = "pending";
    }
    return states;
  });
}

export function validationCheckStates(rollup, names, runs) {
  return [
    ...checkStates(rollup).filter((check) => !names.includes(check.name)),
    ...requiredCheckStates(rollup, names, runs),
  ];
}
