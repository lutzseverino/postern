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
const canonicalLabels = [
  {
    name: "needs-triage",
    color: "fbca04",
    description: "Requires review or renewed review",
  },
  {
    name: "needs-info",
    color: "d4c5f9",
    description:
      "Missing information; the orchestrating agent answers or routes it",
  },
  {
    name: "ready-for-agent",
    color: "0e8a16",
    description: "Reviewed and sufficiently specified for agent implementation",
  },
  {
    name: "ready-for-human",
    color: "1d76db",
    description:
      "Reviewed; needs the owner's accounts, credentials or a reserved taste call",
  },
  { name: "wontfix", color: "ffffff", description: "Will not be actioned" },
  { name: "bug", color: "d73a4a", description: "Something isn't working" },
  {
    name: "enhancement",
    color: "a2eeef",
    description: "New feature or request",
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

// GitHub's documented default labels that the canonical table also names. A
// label still at both stock values was never chosen by the repository, so the
// fix updates it without confirmation. The other default labels, and any
// custom default of an owner or organization, are not canonical names.
// https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels#about-default-labels
const stockLabels = [
  { name: "bug", color: "d73a4a", description: "Something isn't working" },
  {
    name: "enhancement",
    color: "a2eeef",
    description: "New feature or request",
  },
  {
    name: "wontfix",
    color: "ffffff",
    description: "This will not be worked on",
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

function isStockLabel(actual) {
  return stockLabels.some((stock) => sameLabel(actual, stock));
}

function describeEffects(created, updated) {
  const effects = [];
  if (created.length === 1) effects.push(`created ${created[0]}`);
  else if (created.length > 1) effects.push(`created ${created.length} labels`);
  if (updated.length === 1) effects.push(`updated ${updated[0]}`);
  else if (updated.length > 1) effects.push(`updated ${updated.length} labels`);
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
  const actions = canonicalLabels.flatMap((desired) => {
    const actual = existing.get(desired.name.toLowerCase());
    if (!actual) return [{ kind: "create", desired }];
    return sameLabel(actual, desired)
      ? []
      : [{ kind: "update", actual, desired }];
  });

  const changes = actions.flatMap((action) =>
    action.kind === "update" && !isStockLabel(action.actual)
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
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const mutation = await mutateLabel(
      inferred.identity,
      action,
      prepared.access,
    );
    if (!mutation.ok) {
      const effects = describeEffects(created, updated);
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
    (action.kind === "create" ? created : updated).push(action.desired.name);
  }

  const after = await readLabels(inferred.identity, prepared.access);
  const effects = describeEffects(created, updated);
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
  const mismatches = canonicalLabels.filter((desired) => {
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
    `GitHub label setup changed ${inferred.identity}: ${effects}. Readback confirmed all ${canonicalLabels.length} canonical labels; unrelated labels were preserved.`,
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
