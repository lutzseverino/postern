import { canonicalLabels } from "./lib/canonical-labels.mjs";
import { factorySkipLabel } from "./lib/factory-labels.mjs";
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
  factorySkipLabel,
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
