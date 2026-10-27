import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { spawnSync } from "node:child_process";

import { connect, PlatformError } from "../../vendor/postern/postern.mjs";

const resultFormat = "repo-standards/result/v2";
const maximumOutput = 1024 * 1024;

function failProcess(message) {
  throw new Error(message);
}

// Fixes and their readiness probes share one input; only the phase differs.
export function readOperationRequest(operationName, phase) {
  let request;
  try {
    request = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    failProcess(`${operationName} input must be one JSON object.`);
  }
  if (request?.format !== "repo-standards/operation/v2") {
    failProcess(`${operationName} requires repo-standards/operation/v2 input.`);
  }
  if (request.operation?.phase !== phase) {
    failProcess(`${operationName} must run as a ${phase} operation.`);
  }
  const { paths, directories } = request.allowedTargets ?? {};
  if (
    !Array.isArray(paths) ||
    paths.length !== 0 ||
    !Array.isArray(directories) ||
    directories.length !== 0
  ) {
    failProcess(
      `${operationName} requires an empty project-content target scope.`,
    );
  }
  if (
    typeof request.projectRoot !== "string" ||
    request.projectRoot.length === 0
  ) {
    failProcess(`${operationName} input must identify the project root.`);
  }
  if (typeof request.overwriteAllowed !== "boolean") {
    failProcess(
      `${operationName} input must specify boolean overwriteAllowed.`,
    );
  }
  return request;
}

export function writeOperationResult(status, message) {
  process.stdout.write(
    `${JSON.stringify({ format: resultFormat, status, message })}\n`,
  );
}

// Missing settings can be created freely; existing differing values need
// confirmation. Compare only the fields the fix plans to write.
export function describeSettingChanges(current, desired, prefix) {
  return Object.entries(desired).flatMap(([name, value]) => {
    if (
      !Object.hasOwn(current, name) ||
      isDeepStrictEqual(current[name], value)
    )
      return [];
    return [
      `${prefix}.${name} is ${JSON.stringify(current[name])}; the standard sets ${JSON.stringify(value)}`,
    ];
  });
}

export function requireOverwriteConfirmation(request, operationName, changes) {
  if (request.overwriteAllowed || changes.length === 0) return false;
  writeOperationResult(
    "confirmation-required",
    `${operationName} requires confirmation: ${changes.join("; ")}. No changes were made.`,
  );
  return true;
}

export function run(executable, args, cwd, input) {
  const outcome = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    input,
    maxBuffer: maximumOutput,
  });
  if (outcome.error) {
    const { code } = /** @type {NodeJS.ErrnoException} */ (outcome.error);
    return {
      ok: false,
      unavailable: code === "ENOENT",
      detail: code ?? "spawn error",
      stderr: "",
    };
  }
  if (outcome.status !== 0) {
    const processState = outcome.signal
      ? `signal ${outcome.signal}`
      : `exit ${outcome.status}`;
    const reason = outcome.stderr.replace(/\s+/g, " ").trim();
    return {
      ok: false,
      unavailable: false,
      detail: reason ? `${processState}: ${reason}` : processState,
      stderr: outcome.stderr,
    };
  }
  return { ok: true, stdout: outcome.stdout, stderr: outcome.stderr };
}

function versionFrom(output) {
  const match = output.match(/(?:^|[^0-9])v?(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/m);
  return match ? match.slice(1).map(Number) : null;
}

function atLeast(actual, minimum) {
  return (
    actual.some(
      (part, index) =>
        part > minimum[index] &&
        actual
          .slice(0, index)
          .every((earlier, earlierIndex) => earlier === minimum[earlierIndex]),
    ) || actual.every((part, index) => part === minimum[index])
  );
}

function githubIdentity(remoteUrl) {
  let owner;
  let repository;
  const scp = remoteUrl.match(/^(?:[^@/]+@)?github\.com:([^/]+)\/(.+)$/i);
  if (scp) {
    [, owner, repository] = scp;
  } else {
    try {
      const parsed = new URL(remoteUrl);
      if (parsed.hostname.toLowerCase() !== "github.com") return null;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length !== 2) return null;
      [owner, repository] = parts.map((part) => decodeURIComponent(part));
    } catch {
      return null;
    }
  }
  repository = repository.replace(/\.git$/i, "").replace(/\/$/, "");
  if (
    !owner ||
    !repository ||
    /[\s/?#]/.test(owner) ||
    /[\s/?#]/.test(repository)
  )
    return null;
  return `${owner}/${repository}`;
}

function inferRepository(projectRoot) {
  const remotes = run(
    "git",
    [
      "-C",
      projectRoot,
      "config",
      "--local",
      "--get-regexp",
      "^remote\\..*\\.(url|pushurl)$",
    ],
    projectRoot,
  );
  if (!remotes.ok)
    return {
      blocked: "No unambiguous github.com repository was found in Git remotes.",
    };
  const identities = new Map();
  for (const line of remotes.stdout.split(/\r?\n/)) {
    const separator = line.search(/\s/);
    if (separator < 0) continue;
    const identity = githubIdentity(line.slice(separator).trim());
    if (identity) identities.set(identity.toLowerCase(), identity);
  }
  if (identities.size === 0) {
    return {
      blocked: "No unambiguous github.com repository was found in Git remotes.",
    };
  }
  if (identities.size > 1) {
    return {
      blocked: `Multiple github.com repositories were found in Git remotes (${[...identities.values()].sort().join(", ")}); resolve the target before setup.`,
    };
  }
  return { identity: identities.values().next().value };
}

// Access owns authentication, pagination, transport and credential redaction.
// Keep the operation outcome shape shared by reads and mutations.
/**
 * @param {any} access
 * @param {string} path
 * @param {{ method?: string, body?: unknown, paginate?: boolean }} [options]
 */
export async function githubRequest(
  access,
  path,
  { method = "GET", body, paginate = false } = {},
) {
  try {
    const request = {
      path: `/${path}`,
      method,
      ...(body === undefined ? {} : { body }),
    };
    const value = paginate
      ? (await access.requestPages(request)).map((page) => page.data)
      : (await access.request(request)).data;
    return { ok: true, value };
  } catch (error) {
    const failure =
      error instanceof PlatformError
        ? error
        : new PlatformError("unavailable", "GitHub transport failed.");
    const detail =
      failure.reason === "invalidResponse"
        ? "invalid JSON response"
        : failure.status
          ? `${failure.platformMessage ?? "GitHub API request failed"} (HTTP ${failure.status})`
          : "GitHub transport failed";
    return { ok: false, error: detail, detail, failure };
  }
}

export function apiEndpoint(identity, suffix = "") {
  const [owner, repository] = identity.split("/");
  return `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}${suffix}`;
}

function repositoryReadFailure(operationName, identity, failure) {
  // A probe's reason is stable and neutral: never include platform messages,
  // account details, transport traces or credentials in deferred setup records.
  const diagnostic = `For full details, run gh api --hostname github.com ${apiEndpoint(identity)}.`;
  if (failure.reason === "invalidResponse") {
    return `${operationName} could not verify ${identity}; repository access is incomplete (invalid JSON response). ${diagnostic}`;
  }
  let next = "Retry later.";
  if (failure.reason === "notFound") {
    next =
      "Confirm the repository exists and the signed-in gh account can read it.";
  } else if (failure.reason === "unauthenticated") {
    next = "Sign in again with gh auth login --hostname github.com.";
  } else if (failure.reason === "rateLimited") {
    next = "Retry after the GitHub API rate limit resets.";
  } else if (failure.reason === "unavailable" && !(failure.status >= 500)) {
    return `${operationName} could not verify ${identity}; retry after investigating the failure. ${diagnostic}`;
  }
  const status = failure.status
    ? `: GitHub returned HTTP ${failure.status}.`
    : "; GitHub access failed.";
  return `${operationName} could not verify ${identity}${status} ${next} ${diagnostic}`;
}

export async function prepareGithubRepository(request, operationName) {
  const nodeVersion = process.versions.node.match(/^(24|26)\.\d+\.\d+$/);
  if (!nodeVersion) {
    return { blocked: `${operationName} requires stable Node.js 24 or 26.` };
  }

  const gitVersion = run("git", ["--version"], request.projectRoot);
  if (!gitVersion.ok) {
    return {
      blocked: `Git is unavailable; install Git 2.18.0 or newer before ${operationName}.`,
    };
  }
  const parsedGitVersion = versionFrom(gitVersion.stdout);
  if (!parsedGitVersion || !atLeast(parsedGitVersion, [2, 18, 0])) {
    return { blocked: `${operationName} requires Git 2.18.0 or newer.` };
  }

  const ghVersion = run("gh", ["--version"], request.projectRoot);
  if (!ghVersion.ok) {
    return {
      blocked: `GitHub CLI (gh) is unavailable; install gh 2.57.0 or newer before ${operationName}.`,
    };
  }
  const parsedGhVersion = versionFrom(ghVersion.stdout);
  if (!parsedGhVersion || !atLeast(parsedGhVersion, [2, 57, 0])) {
    return { blocked: `${operationName} requires gh 2.57.0 or newer.` };
  }

  const inferred = inferRepository(request.projectRoot);
  if (inferred.blocked) return inferred;

  const signIn = `${operationName} requires authenticated github.com access through gh; sign in with gh auth login --hostname github.com.`;
  const token = run(
    "gh",
    ["auth", "token", "--hostname", "github.com"],
    request.projectRoot,
  );
  if (!token.ok || !token.stdout.trim()) return { blocked: signIn };

  let access;
  try {
    ({ access } = connect(`https://github.com/${inferred.identity}`, {
      credential: token.stdout.trim(),
      timeoutMs: 15_000,
    }));
    if (!(await access.viewer())) return { blocked: signIn };
  } catch (error) {
    if (error instanceof PlatformError && error.reason !== "unauthenticated") {
      return {
        blocked: repositoryReadFailure(operationName, inferred.identity, error),
      };
    }
    return { blocked: signIn };
  }

  const repositoryResponse = await githubRequest(
    access,
    apiEndpoint(inferred.identity),
  );
  if (repositoryResponse.error) {
    return {
      blocked: repositoryReadFailure(
        operationName,
        inferred.identity,
        repositoryResponse.failure,
      ),
    };
  }
  const repository = repositoryResponse.value;
  if (
    typeof repository?.full_name !== "string" ||
    repository.full_name.toLowerCase() !== inferred.identity.toLowerCase()
  ) {
    const resolved =
      typeof repository?.full_name === "string"
        ? repository.full_name
        : "an unknown repository";
    return {
      blocked: `GitHub resolved ${inferred.identity} as ${resolved}; resolve the mismatched target before setup.`,
    };
  }
  return { identity: inferred.identity, repository, access };
}

// The repository roles the GitHub fixes need, as GitHub reports them in the
// repository's permissions. A fix and its readiness probe check the same role.
export const labelManagementRole = {
  access: "write, maintain, or admin access",
  granted: (permissions) =>
    Boolean(permissions.push || permissions.maintain || permissions.admin),
};

export const repositoryAdministrationRole = {
  access: "admin access",
  purpose: " to manage repository rules and merge settings",
  granted: (permissions) => Boolean(permissions.admin),
};

// Everything a GitHub fix needs before it reads or writes its own settings:
// the tools, one confirmed repository, authenticated access, and its role.
// None of it changes anything, locally or on GitHub.
export async function prepareGithubSetup(request, operationName, role) {
  const prepared = await prepareGithubRepository(request, operationName);
  if (prepared.blocked) return prepared;
  if (!role.granted(prepared.repository.permissions ?? {})) {
    return {
      blocked: `${operationName} requires ${role.access} to ${prepared.identity}${role.purpose ?? ""}.`,
    };
  }
  return prepared;
}

// A remote setup's readiness probe: ready exactly when its fix would get past
// preparation, and otherwise not ready with the reason the fix would block.
export async function probeGithubSetup(operationName, role) {
  try {
    const prepared = await prepareGithubSetup(
      readOperationRequest(operationName, "probes"),
      operationName,
      role,
    );
    if (prepared.blocked) {
      writeOperationResult("not-ready", prepared.blocked);
      return;
    }
    writeOperationResult(
      "ready",
      `${operationName} can run for ${prepared.identity} with ${role.access}.`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
