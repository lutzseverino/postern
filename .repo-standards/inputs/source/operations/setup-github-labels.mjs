import {
  apiEndpoint,
  describeSettingChanges,
  requireOverwriteConfirmation,
  githubRequest,
  labelManagementRole,
  prepareGithubSetup,
  readOperationRequest,
  writeOperationResult as result,
} from "./lib/github-operation.mjs";

const operationName = "GitHub label setup";
// Each label may name the labels it replaces: `formerly` holds a former name
// with the values Repo Canon or GitHub gave it. A repository lacking the label
// but carrying a former name gets that label renamed in place, so its issues
// keep it. A label still at a former name's values was never chosen by the
// repository, so the fix updates it without confirmation.
// https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels#about-default-labels
const canonicalLabels = [
  {
    name: "state:triage",
    color: "fbca04",
    description: "Waits on triage to review it, or review it again",
    formerly: [
      {
        name: "needs-triage",
        color: "fbca04",
        description: "Requires review or renewed review",
      },
    ],
  },
  {
    name: "state:reporter",
    color: "d4c5f9",
    description: "Waits on its outside reporter for a fact only they hold",
  },
  {
    name: "state:grill",
    color: "d876e3",
    description: "Waits on a grilling session for the owner's intent",
  },
  {
    name: "state:owner",
    color: "1d76db",
    description: "Waits on the owner's answer or work only the owner can do",
    formerly: [
      {
        name: "ready-for-human",
        color: "1d76db",
        description:
          "Reviewed; needs the owner's accounts, credentials or a reserved taste call",
      },
    ],
  },
  {
    name: "state:ready",
    color: "0e8a16",
    description: "Reviewed; waits on an agent to implement it",
    formerly: [
      {
        name: "ready-for-agent",
        color: "0e8a16",
        description:
          "Reviewed and sufficiently specified for agent implementation",
      },
    ],
  },
  {
    name: "type:bug",
    color: "d73a4a",
    description: "Something isn't working",
    formerly: [
      { name: "bug", color: "d73a4a", description: "Something isn't working" },
    ],
  },
  {
    name: "type:enhancement",
    color: "a2eeef",
    description: "New feature or request",
    formerly: [
      {
        name: "enhancement",
        color: "a2eeef",
        description: "New feature or request",
      },
    ],
  },
  {
    name: "priority:high",
    color: "d93f0b",
    description: "Picked up before normal and low priority work",
  },
  {
    name: "priority:normal",
    color: "bfdadc",
    description: "Picked up in the usual order; no priority label means this",
  },
  {
    name: "priority:low",
    color: "c2e0c6",
    description: "Picked up after high and normal priority work",
  },
  {
    name: "wontfix",
    color: "ffffff",
    description: "Will not be actioned",
    formerly: [
      {
        name: "wontfix",
        color: "ffffff",
        description: "This will not be worked on",
      },
    ],
  },
  {
    name: "wayfinder:map",
    color: "5319e7",
    description: "Planning map for related work",
  },
  {
    name: "wayfinder:research",
    color: "bfd4f2",
    description: "Research question in a planning map",
  },
  {
    name: "wayfinder:prototype",
    color: "bfd4f2",
    description: "Prototype question in a planning map",
  },
  {
    name: "wayfinder:grilling",
    color: "bfd4f2",
    description: "Design decision requiring discussion",
  },
  {
    name: "wayfinder:task",
    color: "bfd4f2",
    description: "Task in a planning map",
  },
];

// The factory profile's owner gates and factory labels. The factory creates
// running, failed and paused with its own values when they are missing; the
// repository never chose those.
const factoryLabels = [
  {
    name: "gate:owner-review",
    color: "e99695",
    description: "Waits on the owner's review before its pull request merges",
  },
  {
    name: "gate:major-release",
    color: "e99695",
    description: "Waits on the owner's go-ahead for a major release",
  },
  {
    name: "factory:running",
    color: "0052cc",
    description: "Waits on the factory run that holds it",
    formerly: [
      {
        name: "factory:running",
        color: "0052cc",
        description: "Factory state: running",
      },
    ],
  },
  {
    name: "factory:paused",
    color: "c5def5",
    description: "Waits on the factory to resume the run it paused",
    formerly: [
      {
        name: "factory:paused",
        color: "c5def5",
        description: "Factory state: paused",
      },
    ],
  },
  {
    name: "factory:failed",
    color: "b60205",
    description: "Waits on a person to deal with the failed run",
    formerly: [
      {
        name: "factory:failed",
        color: "b60205",
        description: "Factory state: failed",
      },
    ],
  },
  {
    name: "factory:skip",
    color: "c5def5",
    description: "Ready agent work the factory must not pick up",
  },
  {
    name: "factory:release-hold",
    color: "c5def5",
    description: "Hold other merges while a release PR is open",
  },
  {
    name: "factory:hold",
    color: "c5def5",
    description: "Pause factory pickups and other merges in this repository",
  },
];

async function readLabels(identity, access) {
  const response = await githubRequest(
    access,
    `${apiEndpoint(identity, "/labels")}?per_page=100`,
    { paginate: true },
  );
  if (response.error) return response;
  if (!Array.isArray(response.value))
    return { error: "invalid labels response" };
  const labels = response.value.every(Array.isArray)
    ? response.value.flat()
    : response.value;
  if (!labels.every((label) => label && typeof label.name === "string")) {
    return { error: "invalid labels response" };
  }
  return { value: labels };
}

function sameLabel(actual, expected) {
  return (
    actual.name === expected.name &&
    String(actual.color).toLowerCase() === expected.color &&
    (actual.description ?? "") === expected.description
  );
}

function isUnchosen(actual, desired) {
  return (desired.formerly ?? []).some((former) => sameLabel(actual, former));
}

// The repository's label for a canonical one: the label itself, matched
// case-insensitively, or else the first former name the repository carries.
function existingLabel(existing, desired) {
  for (const name of [
    desired.name,
    ...(desired.formerly ?? []).map((former) => former.name),
  ]) {
    const actual = existing.get(name.toLowerCase());
    if (actual) return actual;
  }
  return null;
}

function describeEffects(created, updated, renamed) {
  const effects = [];
  for (const [verb, names] of [
    ["created", created],
    ["updated", updated],
    ["renamed", renamed],
  ]) {
    if (names.length === 1) effects.push(`${verb} ${names[0]}`);
    else if (names.length > 1) effects.push(`${verb} ${names.length} labels`);
  }
  return effects.join(" and ");
}

async function mutateLabel(identity, action, access) {
  const body = {
    color: action.desired.color,
    description: action.desired.description,
  };
  if (action.kind === "create") {
    return githubRequest(access, apiEndpoint(identity, "/labels"), {
      method: "POST",
      body: { ...body, name: action.desired.name },
    });
  }
  return githubRequest(
    access,
    apiEndpoint(identity, `/labels/${encodeURIComponent(action.actual.name)}`),
    { method: "PATCH", body: { ...body, new_name: action.desired.name } },
  );
}

async function setupLabels(request) {
  const prepared = await prepareGithubSetup(
    request,
    operationName,
    labelManagementRole,
  );
  if (prepared.blocked) {
    result("blocked", prepared.blocked);
    return;
  }
  const inferred = { identity: prepared.identity };
  const labels =
    request.profile === "factory"
      ? [...canonicalLabels, ...factoryLabels]
      : canonicalLabels;

  const before = await readLabels(inferred.identity, prepared.access);
  if (before.error) {
    result(
      "blocked",
      `GitHub label setup could not inspect labels for ${inferred.identity} (${before.error}).`,
    );
    return;
  }
  const existing = new Map(
    before.value.map((label) => [label.name.toLowerCase(), label]),
  );
  /** @type {{ kind: string, actual?: any, desired: any }[]} */
  const actions = labels.flatMap((desired) => {
    const actual = existingLabel(existing, desired);
    if (!actual) return [{ kind: "create", desired }];
    return sameLabel(actual, desired)
      ? []
      : [{ kind: "update", actual, desired }];
  });

  const changes = actions.flatMap((action) =>
    action.kind === "update" && !isUnchosen(action.actual, action.desired)
      ? describeSettingChanges(
          {
            ...action.actual,
            color: String(action.actual.color).toLowerCase(),
            description: action.actual.description ?? "",
          },
          action.desired,
          `label ${action.actual.name}`,
        )
      : [],
  );
  if (requireOverwriteConfirmation(request, operationName, changes)) return;

  const created = [];
  const updated = [];
  const renamed = [];
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const mutation = await mutateLabel(
      inferred.identity,
      action,
      prepared.access,
    );
    if (!mutation.ok) {
      const effects = describeEffects(created, updated, renamed);
      const effectMessage = effects
        ? ` Confirmed partial effects: ${effects}.`
        : " No changes were confirmed.";
      const remaining = actions.length - index;
      result(
        "blocked",
        `GitHub label setup is incomplete for ${inferred.identity}; a GitHub API mutation failed (${mutation.detail}).${effectMessage} ${remaining} label${remaining === 1 ? "" : "s"} remain; inspect remote state and retry.`,
      );
      return;
    }
    if (action.kind === "create") created.push(action.desired.name);
    else if (
      action.actual.name.toLowerCase() === action.desired.name.toLowerCase()
    )
      updated.push(action.desired.name);
    else renamed.push(`${action.actual.name} to ${action.desired.name}`);
  }

  const after = await readLabels(inferred.identity, prepared.access);
  const effects = describeEffects(created, updated, renamed);
  if (after.error) {
    const effectMessage = effects ? ` Applied changes: ${effects}.` : "";
    result(
      "blocked",
      `GitHub label setup is incomplete for ${inferred.identity}; final readback failed (${after.error}).${effectMessage}`,
    );
    return;
  }
  const verified = new Map(
    after.value.map((label) => [label.name.toLowerCase(), label]),
  );
  const mismatches = labels.filter((desired) => {
    const actual = verified.get(desired.name.toLowerCase());
    return !actual || !sameLabel(actual, desired);
  });
  if (mismatches.length > 0) {
    const effectMessage = effects
      ? ` Applied changes: ${effects}.`
      : " No changes were applied.";
    result(
      "blocked",
      `GitHub label setup is incomplete for ${inferred.identity}; readback did not match ${mismatches.map((label) => label.name).join(", ")}.${effectMessage}`,
    );
    return;
  }

  if (!effects) {
    result(
      "unchanged",
      `GitHub labels already match the canonical configuration for ${inferred.identity}.`,
    );
    return;
  }
  result(
    "changed",
    `GitHub label setup changed ${inferred.identity}: ${effects}. Readback confirmed all ${labels.length} canonical labels; unrelated labels were preserved.`,
  );
}

try {
  await setupLabels(readOperationRequest(operationName, "fixes"));
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
