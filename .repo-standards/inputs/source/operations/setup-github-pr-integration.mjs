import {
  apiEndpoint,
  describeSettingChanges,
  requireOverwriteConfirmation,
  githubRequest,
  prepareGithubSetup,
  readOperationRequest,
  repositoryAdministrationRole,
  writeOperationResult as result,
} from "./lib/github-operation.mjs";

const operationName = "GitHub PR integration setup";
const checkName = "PR metadata";
const rulesetName = "Repo Canon required PR checks";
const workflowPath = ".github/workflows/pr-metadata.yml";
const mergeSettings = {
  allow_squash_merge: true,
  allow_merge_commit: false,
  allow_rebase_merge: false,
  squash_merge_commit_title: "PR_TITLE",
  squash_merge_commit_message: "PR_BODY",
};

// GitHub's values for a new repository. Merge settings still at all of them
// were never chosen, so the fix applies the standard without confirmation. One
// other value, or one absent field, makes the whole set count as chosen.
// https://docs.github.com/en/rest/repos/repos#create-an-organization-repository
// https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests
const stockMergeSettings = {
  allow_squash_merge: true,
  allow_merge_commit: true,
  allow_rebase_merge: true,
  squash_merge_commit_title: "COMMIT_OR_PR_TITLE",
  squash_merge_commit_message: "COMMIT_MESSAGES",
};
const stockNote =
  " The merge settings were at GitHub's stock values for a new repository, so no one had chosen them and they needed no confirmation.";

function matchingMergeSettings(repository) {
  return Object.entries(mergeSettings).every(
    ([name, value]) => repository[name] === value,
  );
}

function atStockMergeSettings(repository) {
  return Object.entries(stockMergeSettings).every(
    ([name, value]) => repository[name] === value,
  );
}

function mergeSettingChanges(repository) {
  return atStockMergeSettings(repository)
    ? []
    : describeSettingChanges(repository, mergeSettings, "repository");
}

// GitHub refuses classic protection and rulesets with a 403 naming the upgrade
// that would offer them when a private repository's plan offers neither. The
// read keeps its error so a caller that cannot rely on the limit still blocks.
function readEnforcement(response) {
  const planLimited =
    !response.ok &&
    response.failure?.status === 403 &&
    /Upgrade to GitHub .+ or make this repository public/i.test(
      response.failure?.platformMessage ?? "",
    );
  return planLimited ? { ...response, planLimited } : response;
}

async function readBranchProtection(identity, defaultBranch, access) {
  const endpoint = apiEndpoint(
    identity,
    `/branches/${encodeURIComponent(defaultBranch)}/protection`,
  );
  const response = await githubRequest(access, endpoint);
  const parsed = readEnforcement(response);
  if (parsed.planLimited) return parsed;
  if (
    !response.ok &&
    /Branch not protected/i.test(response.failure?.platformMessage ?? "") &&
    response.failure?.status === 404
  ) {
    return { value: null };
  }
  if (parsed.error) return parsed;
  const protection = parsed.value;
  if (
    !protection ||
    typeof protection !== "object" ||
    Array.isArray(protection)
  ) {
    return { error: "invalid branch protection response" };
  }
  const statusChecks = protection.required_status_checks;
  if (statusChecks === undefined || statusChecks === null) {
    return { value: { protection, statusChecks: null } };
  }
  if (
    typeof statusChecks !== "object" ||
    Array.isArray(statusChecks) ||
    !Array.isArray(statusChecks.contexts) ||
    (statusChecks.checks !== undefined && !Array.isArray(statusChecks.checks))
  ) {
    return {
      error: "invalid required status checks in branch protection response",
    };
  }
  if (
    !statusChecks.contexts.every((context) => typeof context === "string") ||
    !(statusChecks.checks ?? []).every(
      (check) => check && typeof check.context === "string",
    )
  ) {
    return {
      error: "invalid required status checks in branch protection response",
    };
  }
  return {
    value: {
      protection,
      statusChecks: { ...statusChecks, checks: statusChecks.checks ?? [] },
    },
  };
}

// GitHub runs the pull_request_target workflow that reports PR metadata only
// from the default branch, so the check can report only once the workflow file
// is there. The Actions workflow list is no evidence: it keeps a workflow after
// its file leaves the default branch.
async function readWorkflowPresence(identity, defaultBranch, access) {
  const response = await githubRequest(
    access,
    apiEndpoint(
      identity,
      `/contents/${workflowPath}?ref=${encodeURIComponent(defaultBranch)}`,
    ),
  );
  if (
    !response.ok &&
    /Not Found/i.test(response.failure?.platformMessage ?? "") &&
    response.failure?.status === 404
  ) {
    return { value: false };
  }
  const parsed = response;
  if (parsed.error) return parsed;
  if (parsed.value?.type !== "file") {
    return { error: "invalid workflow file response" };
  }
  return { value: true };
}

function hasRequiredCheck(statusChecks) {
  return (
    statusChecks !== null &&
    (statusChecks.contexts.includes(checkName) ||
      statusChecks.checks.some((check) => check.context === checkName))
  );
}

function flattenPages(value) {
  return Array.isArray(value) && value.every(Array.isArray)
    ? value.flat()
    : value;
}

async function readRulesets(identity, access) {
  const response = await githubRequest(
    access,
    `${apiEndpoint(identity, "/rulesets")}?includes_parents=false&per_page=100`,
    { paginate: true },
  );
  const list = readEnforcement(response);
  if (list.error) return list;
  const summaries = flattenPages(list.value);
  if (
    !Array.isArray(summaries) ||
    !summaries.every((ruleset) => ruleset && Number.isInteger(ruleset.id))
  ) {
    return { error: "invalid repository rulesets response" };
  }

  const rulesets = [];
  for (const summary of summaries) {
    const detail = await githubRequest(
      access,
      apiEndpoint(identity, `/rulesets/${summary.id}`),
    );
    if (detail.error)
      return {
        error: `could not inspect ruleset ${summary.id} (${detail.error})`,
      };
    if (
      !detail.value ||
      detail.value.id !== summary.id ||
      typeof detail.value.name !== "string"
    ) {
      return { error: `invalid repository ruleset ${summary.id} response` };
    }
    rulesets.push(detail.value);
  }
  return { value: rulesets };
}

function canonicalRuleset() {
  return {
    name: rulesetName,
    target: "branch",
    enforcement: "active",
    bypass_actors: [],
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [{ context: checkName }],
        },
      },
    ],
  };
}

function matchesDefaultRef(pattern, defaultRef) {
  if (pattern === "~DEFAULT_BRANCH" || pattern === "~ALL") return true;
  if (pattern === "~NON_DEFAULT_BRANCH") return false;
  if (typeof pattern !== "string" || /[\\[\]{}]/.test(pattern)) return null;

  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
      } else {
        expression += ".*";
        index += 1;
      }
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`).test(defaultRef);
}

function managedRulesetPlan(rulesets, defaultBranch) {
  const matches = rulesets.filter(
    (ruleset) => ruleset.name.toLowerCase() === rulesetName.toLowerCase(),
  );
  if (matches.length > 1) {
    return {
      error: `multiple rulesets are named ${rulesetName}; resolve the ambiguous managed rule before setup`,
    };
  }
  if (matches.length === 0)
    return { kind: "create", payload: canonicalRuleset() };

  const existing = matches[0];
  if (existing.target !== "branch") {
    return {
      error: `${rulesetName} targets ${existing.target ?? "an unknown resource"} instead of branches`,
    };
  }
  const conditions = structuredClone(existing.conditions ?? {});
  const refName = conditions.ref_name;
  if (
    !refName ||
    !Array.isArray(refName.include) ||
    !Array.isArray(refName.exclude)
  ) {
    return { error: `${rulesetName} has invalid branch conditions` };
  }
  const rules = structuredClone(existing.rules ?? []);
  if (
    !Array.isArray(rules) ||
    !rules.every((rule) => rule && typeof rule.type === "string")
  ) {
    return { error: `${rulesetName} has invalid rules` };
  }
  const statusRules = rules.filter(
    (rule) => rule.type === "required_status_checks",
  );
  if (statusRules.length > 1) {
    return { error: `${rulesetName} has multiple required status check rules` };
  }

  let changed = existing.enforcement !== "active";
  const defaultRef = `refs/heads/${defaultBranch}`;
  const evaluatedExclusions = refName.exclude.map((pattern) => ({
    pattern,
    matches: matchesDefaultRef(pattern, defaultRef),
  }));
  const ambiguousExclusion = evaluatedExclusions.find(
    ({ matches }) => matches === null,
  );
  if (ambiguousExclusion) {
    return {
      error: `${rulesetName} excludes ${ambiguousExclusion.pattern}; default-branch applicability cannot be established safely`,
    };
  }
  if (
    !refName.include.some(
      (pattern) => matchesDefaultRef(pattern, defaultRef) === true,
    )
  ) {
    refName.include.push("~DEFAULT_BRANCH");
    changed = true;
  }
  if (evaluatedExclusions.some(({ matches }) => matches)) {
    refName.exclude = evaluatedExclusions
      .filter(({ matches }) => !matches)
      .map(({ pattern }) => pattern);
    conditions.ref_name = refName;
    changed = true;
  }

  if (statusRules.length === 0) {
    rules.push(canonicalRuleset().rules[0]);
    changed = true;
  } else {
    const parameters = statusRules[0].parameters;
    if (
      !parameters ||
      !Array.isArray(parameters.required_status_checks) ||
      !parameters.required_status_checks.every(
        (check) => check && typeof check.context === "string",
      )
    ) {
      return { error: `${rulesetName} has invalid required status checks` };
    }
    if (parameters.strict_required_status_checks_policy !== true) {
      parameters.strict_required_status_checks_policy = true;
      changed = true;
    }
    if (
      !parameters.required_status_checks.some(
        (check) => check.context === checkName,
      )
    ) {
      parameters.required_status_checks.push({ context: checkName });
      changed = true;
    }
  }

  const payload = {
    name: existing.name,
    target: existing.target,
    enforcement: "active",
    bypass_actors: structuredClone(existing.bypass_actors ?? []),
    conditions,
    rules,
  };
  return changed
    ? { kind: "update", id: existing.id, payload }
    : { kind: "none", id: existing.id };
}

function rulesetMatches(rulesets, id, defaultBranch) {
  const existing = rulesets.find((ruleset) => ruleset.id === id);
  if (
    !existing ||
    existing.enforcement !== "active" ||
    existing.target !== "branch"
  )
    return false;
  const refName = existing.conditions?.ref_name;
  const defaultRef = `refs/heads/${defaultBranch}`;
  if (
    !refName?.include?.some(
      (pattern) => matchesDefaultRef(pattern, defaultRef) === true,
    ) ||
    refName.exclude?.some(
      (pattern) => matchesDefaultRef(pattern, defaultRef) !== false,
    )
  )
    return false;
  return existing.rules?.some(
    (rule) =>
      rule.type === "required_status_checks" &&
      rule.parameters?.strict_required_status_checks_policy === true &&
      rule.parameters?.required_status_checks?.some(
        (check) => check.context === checkName,
      ),
  );
}

function effectSummary(effects) {
  if (effects.length === 0) return "No changes were confirmed.";
  return `Confirmed partial effects: ${effects.join(" and ")}.`;
}

// Names what the final readback did not confirm, with GitHub's reason when
// the read itself failed.
function mismatch(subject, read) {
  return read.error ? `${subject} (${read.error})` : subject;
}

function blockReadback(identity, mismatches, effects) {
  const applied =
    effects.length > 0
      ? ` Applied changes: ${effects.join(" and ")}.`
      : " No changes were applied.";
  result(
    "blocked",
    `${operationName} is incomplete for ${identity}; final readback did not match ${mismatches.join(" and ")}.${applied}`,
  );
}

async function updateMergeSettings(identity, access, effects) {
  const mutation = await githubRequest(access, apiEndpoint(identity), {
    method: "PATCH",
    body: mergeSettings,
  });
  if (!mutation.ok) {
    result(
      "blocked",
      `${operationName} is incomplete for ${identity}; the squash merge settings mutation failed (${mutation.detail}). ${effectSummary(effects)} Squash merge settings remain; inspect remote state and retry.`,
    );
    return false;
  }
  effects.push("updated squash merge settings");
  return true;
}

// Requiring PR metadata is plan-gated, where GitHub offers neither branch
// protection nor rulesets, and deferred, while the default branch lacks the
// workflow that reports it. Either way only the merge settings apply, and the
// outcome names what applies and why the requirement does not.
async function setupMergeSettingsOnly(
  identity,
  repository,
  request,
  outcome,
  access,
) {
  if (
    requireOverwriteConfirmation(
      request,
      operationName,
      mergeSettingChanges(repository),
    )
  )
    return;
  const effects = [];
  if (
    !matchingMergeSettings(repository) &&
    !(await updateMergeSettings(identity, access, effects))
  ) {
    return;
  }
  const repositoryAfter = await githubRequest(access, apiEndpoint(identity));
  if (repositoryAfter.error || !matchingMergeSettings(repositoryAfter.value)) {
    blockReadback(
      identity,
      [mismatch("squash merge settings", repositoryAfter)],
      effects,
    );
    return;
  }
  if (effects.length === 0) {
    result("unchanged", outcome.unchanged);
    return;
  }
  result(
    "changed",
    `${operationName} changed ${identity}: ${effects.join(" and ")}. Final readback confirmed that ${outcome.changed}${atStockMergeSettings(repository) ? stockNote : ""}`,
  );
}

function unavailableRequirement(identity) {
  const offered = `matches what GitHub offers this repository: squash-only integration, PR-title subjects, and PR-body messages. Requiring \`${checkName}\` is unavailable because GitHub offers neither branch protection nor rulesets for this private repository on its current plan. Upgrade the plan or make the repository public; the next adoption or update then requires the check. Strict freshness is unconfirmed; unattended merging stops until GitHub enforcement is confirmed.`;
  return {
    unchanged: `GitHub PR integration for ${identity} ${offered}`,
    changed: `GitHub PR integration ${offered}`,
  };
}

function deferredRequirement(identity, defaultBranch) {
  const deferred = `GitHub PR integration for ${identity} applies squash-only integration, PR-title subjects, and PR-body messages. Requiring \`${checkName}\` is deferred because the default branch \`${defaultBranch}\` does not carry the PR metadata validation workflow yet, so GitHub cannot report the check. Merge this adoption through the owner; the next adoption or update then requires the check. Strict freshness is unconfirmed; unattended merging stops until GitHub enforcement is confirmed.`;
  return { unchanged: deferred, changed: deferred };
}

async function setupIntegration(request) {
  const prepared = await prepareGithubSetup(
    request,
    operationName,
    repositoryAdministrationRole,
  );
  if (prepared.blocked) {
    result("blocked", prepared.blocked);
    return;
  }
  const inferred = { identity: prepared.identity };
  const repository = prepared.repository;
  if (
    typeof repository.default_branch !== "string" ||
    repository.default_branch.length === 0
  ) {
    result(
      "blocked",
      `${operationName} could not identify the default branch for ${inferred.identity}.`,
    );
    return;
  }

  const branchBefore = await readBranchProtection(
    inferred.identity,
    repository.default_branch,
    prepared.access,
  );
  const rulesetsBefore = await readRulesets(inferred.identity, prepared.access);
  if (
    repository.private === true &&
    branchBefore.planLimited &&
    rulesetsBefore.planLimited
  ) {
    await setupMergeSettingsOnly(
      inferred.identity,
      repository,
      request,
      unavailableRequirement(inferred.identity),
      prepared.access,
    );
    return;
  }
  if (branchBefore.error) {
    result(
      "blocked",
      `${operationName} could not inspect required checks on ${repository.default_branch} (${branchBefore.error}).`,
    );
    return;
  }
  if (rulesetsBefore.error) {
    result(
      "blocked",
      `${operationName} could not inspect repository rulesets for ${inferred.identity} (${rulesetsBefore.error}).`,
    );
    return;
  }
  const workflow = await readWorkflowPresence(
    inferred.identity,
    repository.default_branch,
    prepared.access,
  );
  if (workflow.error) {
    result(
      "blocked",
      `${operationName} could not read ${workflowPath} on ${repository.default_branch} (${workflow.error}).`,
    );
    return;
  }
  if (!workflow.value) {
    await setupMergeSettingsOnly(
      inferred.identity,
      repository,
      request,
      deferredRequirement(inferred.identity, repository.default_branch),
      prepared.access,
    );
    return;
  }

  let checkAction;
  let checkLocation;
  let managedRulesetId;
  if (branchBefore.value?.statusChecks) {
    checkLocation = "branch";
    if (
      !hasRequiredCheck(branchBefore.value.statusChecks) ||
      branchBefore.value.statusChecks.strict !== true
    )
      checkAction = { type: "branch" };
  } else {
    const plan = managedRulesetPlan(
      rulesetsBefore.value,
      repository.default_branch,
    );
    if (plan.error) {
      result(
        "blocked",
        `${operationName} cannot reconcile required checks for ${inferred.identity}: ${plan.error}.`,
      );
      return;
    }
    checkLocation = "ruleset";
    managedRulesetId = plan.id;
    if (plan.kind !== "none") checkAction = { type: "ruleset", plan };
  }
  const settingsNeedUpdate = !matchingMergeSettings(repository);
  const changes = mergeSettingChanges(repository);
  if (checkAction?.type === "branch") {
    const { contexts, strict } = branchBefore.value.statusChecks;
    changes.push(
      ...describeSettingChanges(
        { contexts, strict },
        {
          contexts: hasRequiredCheck(branchBefore.value.statusChecks)
            ? contexts
            : [...contexts, checkName],
          strict: true,
        },
        `branch ${repository.default_branch} protection.required_status_checks`,
      ),
    );
  }
  if (checkAction?.type === "ruleset" && checkAction.plan.kind === "update") {
    const current = rulesetsBefore.value.find(
      (ruleset) => ruleset.id === checkAction.plan.id,
    );
    changes.push(
      ...describeSettingChanges(
        current,
        checkAction.plan.payload,
        `ruleset ${current.name} (${current.id})`,
      ),
    );
  }
  if (requireOverwriteConfirmation(request, operationName, changes)) return;
  const effects = [];

  if (checkAction?.type === "branch") {
    const endpoint = apiEndpoint(
      inferred.identity,
      `/branches/${encodeURIComponent(repository.default_branch)}/protection/required_status_checks/contexts`,
    );
    const statusChecks = branchBefore.value.statusChecks;
    const mutation = !hasRequiredCheck(statusChecks)
      ? await githubRequest(prepared.access, endpoint, {
          method: "POST",
          body: { contexts: [checkName] },
        })
      : { ok: true };
    const freshness =
      mutation.ok && statusChecks.strict !== true
        ? await githubRequest(
            prepared.access,
            endpoint.replace(/\/contexts$/, ""),
            {
              method: "PATCH",
              body: { strict: true },
            },
          )
        : mutation;
    if (!freshness.ok) {
      if (mutation.ok && !hasRequiredCheck(statusChecks))
        effects.push(
          `required ${checkName} through ${repository.default_branch} branch protection`,
        );
      result(
        "blocked",
        `${operationName} is incomplete for ${inferred.identity}; configuring ${checkName} and strict freshness on ${repository.default_branch} branch protection failed (${freshness.detail}). ${effectSummary(effects)} Required-check enforcement${settingsNeedUpdate ? " and squash merge settings remain" : " remains"}; inspect remote state and retry.`,
      );
      return;
    }
    effects.push(
      `required ${checkName} through ${repository.default_branch} branch protection with strict freshness`,
    );
  }

  if (checkAction?.type === "ruleset") {
    const suffix = checkAction.plan.id
      ? `/rulesets/${checkAction.plan.id}`
      : "/rulesets";
    const method = checkAction.plan.id ? "PUT" : "POST";
    const mutation = await githubRequest(
      prepared.access,
      apiEndpoint(inferred.identity, suffix),
      { method, body: checkAction.plan.payload },
    );
    if (!mutation.ok) {
      result(
        "blocked",
        `${operationName} is incomplete for ${inferred.identity}; the required-check ruleset mutation failed (${mutation.detail}). ${effectSummary(effects)} Required-check enforcement${settingsNeedUpdate ? " and squash merge settings remain" : " remains"}; inspect remote state and retry.`,
      );
      return;
    }
    const parsed = mutation;
    if (parsed.error || !Number.isInteger(parsed.value?.id)) {
      result(
        "blocked",
        `${operationName} is incomplete for ${inferred.identity}; the required-check ruleset mutation returned an invalid response. ${effectSummary(effects)} Inspect remote state and retry.`,
      );
      return;
    }
    checkAction.rulesetId = parsed.value.id;
    managedRulesetId = parsed.value.id;
    effects.push(
      method === "POST"
        ? "created required-check ruleset"
        : "updated required-check ruleset",
    );
  }

  if (
    settingsNeedUpdate &&
    !(await updateMergeSettings(inferred.identity, prepared.access, effects))
  ) {
    return;
  }

  const repositoryAfter = await githubRequest(
    prepared.access,
    apiEndpoint(inferred.identity),
  );
  const branchAfter = await readBranchProtection(
    inferred.identity,
    repository.default_branch,
    prepared.access,
  );
  const rulesetsAfter = await readRulesets(inferred.identity, prepared.access);
  const mismatches = [];
  if (repositoryAfter.error || !matchingMergeSettings(repositoryAfter.value)) {
    mismatches.push(mismatch("squash merge settings", repositoryAfter));
  }
  if (branchAfter.error) {
    mismatches.push(mismatch("branch protection readback", branchAfter));
  }
  if (checkLocation === "ruleset") {
    if (
      rulesetsAfter.error ||
      !rulesetMatches(
        rulesetsAfter.value,
        managedRulesetId,
        repository.default_branch,
      )
    ) {
      mismatches.push(
        mismatch(
          `${checkName} ruleset enforcement with strict freshness`,
          rulesetsAfter,
        ),
      );
    }
  } else if (
    !branchAfter.error &&
    (!hasRequiredCheck(branchAfter.value?.statusChecks ?? null) ||
      branchAfter.value?.statusChecks?.strict !== true)
  ) {
    mismatches.push(`${checkName} branch enforcement with strict freshness`);
  }
  if (rulesetsAfter.error && checkLocation !== "ruleset") {
    mismatches.push(mismatch("repository ruleset readback", rulesetsAfter));
  }
  if (mismatches.length > 0) {
    blockReadback(inferred.identity, mismatches, effects);
    return;
  }

  if (effects.length === 0) {
    result(
      "unchanged",
      `GitHub PR integration already matches the canonical configuration for ${inferred.identity}.`,
    );
    return;
  }
  result(
    "changed",
    `${operationName} changed ${inferred.identity}: ${effects.join(" and ")}. Final readback confirmed ${checkName} with strict freshness, squash-only integration, PR-title subjects, and PR-body messages; unrelated settings and rules were preserved.${atStockMergeSettings(repository) ? stockNote : ""}`,
  );
}

try {
  await setupIntegration(readOperationRequest(operationName, "fixes"));
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
