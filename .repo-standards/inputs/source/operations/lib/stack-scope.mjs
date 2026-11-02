import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import {
  isWorkspaceMember,
  manifestName,
  parentOf,
  pnpmWorkspaceName,
  readManifest,
  stackDifferences,
  unreadableWorkspaceYamlCause,
  workspaceConfiguration,
} from "./typescript-node-stack.mjs";
import { keptFiles } from "./stack-files.mjs";
import {
  classifyWebPackages,
  webStackDifferences,
} from "./typescript-web-stack.mjs";

// Drafts each TypeScript stack scope of a repository from its manifests
// and workspace configuration, as a Repository Standards scope proposal: one
// `package.json` per Project. It is that declaration's discovery script:
// Repository Standards runs it during inspection in a copy of the project,
// which holds the files Git keeps without Git metadata or `.repo-standards`,
// and passes a discovery request on standard input. A Project that matches the
// stack's manifest facts is included and one that differs is excluded with
// its differences, through the module the stack's check uses. Without an
// included Project the draft proposes no scope. It reads the copy and writes
// the proposal to standard output.

const requestFormat = "repo-standards/discovery/v1";
const proposalFormat = "repo-standards/scope/v2";

// Directory names that hold test fixtures, generated output, or copied
// third-party code rather than a maintained Project. A manifest below one is
// excluded unless a workspace lists it as a member.
const unmaintainedDirectories = [
  "__fixtures__",
  "__mocks__",
  "build",
  "coverage",
  "dist",
  "fixture",
  "fixtures",
  "generated",
  "out",
  "testdata",
  "vendor",
];

/** @returns {never} */
function fail(message) {
  throw new Error(message);
}

function code(path) {
  return `\`${path}\``;
}

function isWithin(path, directory) {
  return path === directory || path.startsWith(`${directory}/`);
}

function byPath(left, right) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

// The discovery request on standard input: its project root.
function readRequest(argv, declarationId) {
  if (argv.length > 0)
    fail(
      `Unknown argument ${argv[0]}. The drafter takes no arguments; it reads a ${requestFormat} request on standard input.`,
    );
  let request;
  try {
    request = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return fail(`Standard input must hold a ${requestFormat} request.`);
  }
  if (request?.format !== requestFormat)
    fail(`Standard input must hold a ${requestFormat} request.`);
  if (request.declaration !== declarationId)
    fail(
      `The request names the ${code(String(request.declaration))} declaration; the drafter drafts ${code(declarationId)}.`,
    );
  if (
    typeof request.projectRoot !== "string" ||
    !isAbsolute(request.projectRoot)
  )
    fail("The request's projectRoot must be an absolute path.");
  return { projectRoot: request.projectRoot };
}

function relativeTo(directory, ancestor) {
  return ancestor === "" ? directory : directory.slice(ancestor.length + 1);
}

// The workspaces of the copy, by root directory: each directory whose
// `pnpm-workspace.yaml` or `package.json` configures one.
function workspaces(projectRoot, files) {
  const directories = new Set(
    [...files]
      .filter((path) =>
        [manifestName, pnpmWorkspaceName].includes(
          path.slice(path.lastIndexOf("/") + 1),
        ),
      )
      .map(parentOf),
  );
  const found = new Map();
  for (const directory of directories) {
    const configuration = workspaceConfiguration(projectRoot, directory);
    if (configuration) found.set(directory, configuration);
  }
  return found;
}

// Each workspace that lists a directory as a member, nearest first.
function* listingWorkspaces(directory, found) {
  for (
    let ancestor = directory;
    ancestor !== "";
    ancestor = parentOf(ancestor)
  ) {
    const root = parentOf(ancestor);
    const configuration = found.get(root);
    if (
      configuration?.patterns &&
      isWorkspaceMember(configuration.patterns, relativeTo(directory, root))
    )
      yield { root, configuration };
  }
}

// The outermost ancestor of a directory, or the directory itself, named as
// one that holds fixtures, generated output, or copied code, if any.
function unmaintainedAncestor(directory) {
  if (directory === "") return undefined;
  return directory
    .split("/")
    .map((_, index, segments) => segments.slice(0, index + 1).join("/"))
    .find((ancestor) =>
      unmaintainedDirectories.includes(
        ancestor.slice(ancestor.lastIndexOf("/") + 1),
      ),
    );
}

// The nearest workspace that lists a directory as a maintained member: one
// whose root lies outside the directory's unmaintained ancestor, or whose
// root a workspace outside it lists in turn. A fixture's own workspace, or its
// local pnpm settings, makes nothing under it maintained by itself.
function maintainedListing(directory, found) {
  const unmaintained = unmaintainedAncestor(directory);
  for (const listing of listingWorkspaces(directory, found))
    if (
      !unmaintained ||
      !isWithin(listing.root, unmaintained) ||
      maintainedListing(listing.root, found) !== null
    )
      return listing;
  return null;
}

const reasons = {
  matches: (path) =>
    `The Project of ${code(path)} matches the typescript-node stack's manifest facts: pnpm 11, its lockfile, Node.js 24 or 26, oxlint 1, Prettier 3 and a validate script.`,
  differs: (path, differences) =>
    `The Project of ${code(path)} differs from the typescript-node stack, so it stays out of the scope until a migration brings it in: ${differences.join(" ")}`,
  workspaceRoot: (path) =>
    `${code(path)} supplies shared workspace configuration without evidence of its own maintained package; its members are the Projects.`,
  unmaintained: (path, directory) =>
    `${code(path)} lies under ${code(directory)}, which holds fixtures, generated output, or copied code rather than a maintained Project, and no workspace outside it lists it.`,
};

const questions = {
  root: (path) =>
    `Is the workspace root ${code(path)} itself a maintained package with its own responsibility and development commands, alongside its members? The kept evidence does not settle its membership. Include it when it matches the stack, or exclude it naming its differences; exclude a shared-only configuration root as no maintained Project.`,
  standalone: (path) =>
    `Is ${code(path)} the manifest of a maintained Project? No workspace lists it. If it is, include it when it matches the stack, or exclude it naming its differences; otherwise exclude it as no maintained Project.`,
  workspace: (path) => {
    const unreadable = path.endsWith(pnpmWorkspaceName)
      ? `The drafter cannot read workspace configuration from ${code(path)}: ${unreadableWorkspaceYamlCause}.`
      : `${code(path)} states its workspace members in a form the drafter cannot read.`;
    return `${unreadable} Which manifests under it belong to maintained Projects? Include each one that matches the stack and exclude the rest with their reasons.`;
  },
};

function coverage({ included, projects, unresolved }, stack) {
  const drafterPath = `discovery/draft-typescript-${stack}-stack-scope.mjs`;
  const drafted = `Drafted from manifests and workspace configuration by ${code(drafterPath)}: one ${code(manifestName)} per Project, included when it matches the stack's manifest facts and excluded naming its differences otherwise. A maintained workspace root package is a Project alongside its members; a shared-only root is not. Uncertain root membership stays unresolved. A root package without workspace members is a Project.`;
  if (included > 0) return drafted;
  if (unresolved > 0)
    return `${drafted} No Project is included in this draft, so it proposes no scope; unresolved questions must be settled before confirming membership.`;
  if (projects === 0)
    return `${drafted} ${stack === "node" ? "The repository holds no Node.js Project," : "The repository holds no matching web Project,"} so the declaration has no scope.`;
  return `${drafted} No Project matches the stack, so the declaration has no scope; each differing Project stays out until a migration brings it in.`;
}

// Entry targets may be strings, bin maps or nested conditional exports.
function entryPointTargets(value) {
  if (typeof value === "string") return [value];
  if (value !== null && typeof value === "object")
    return Object.values(value).flatMap(entryPointTargets);
  return [];
}

// Relate kept script sources to entry points whose compiled output is absent.
function entryPointStem(path) {
  return path
    .slice(path.lastIndexOf("/") + 1)
    .replace(/(?:\.d)?\.(?:[cm]?[jt]s|[jt]sx)$/, "");
}

// Conservative root-package evidence, independent of stack conformity. Entry
// points plus development commands and kept source files establish a
// package's own responsibility. Other packages' files, fixtures and tool
// configuration do not establish it. Script helpers need a link to a declared
// entry point to establish package responsibility. Anything partial stays for assessment.
function rootPackageEvidence(projectRoot, path, files, manifests, web) {
  const webProject = web.get(path);
  if (
    ["site", "app"].includes(webProject?.kind) &&
    webProject.evidence.some(
      (file) => /\.(?:astro|[jt]sx?)$/.test(file) && !/\.config\./.test(file),
    )
  )
    return { evidence: webProject.evidence };
  const { manifest } = readManifest(projectRoot, path);
  if (!manifest) return { unresolved: true };
  const directory = parentOf(path);
  const nested = manifests
    .filter(
      (other) =>
        other !== path && (directory === "" || isWithin(other, directory)),
    )
    .map(parentOf);
  const sources = [...files]
    .filter((file) => {
      if (directory !== "" && !isWithin(file, directory)) return false;
      const relative = relativeTo(file, directory);
      return (
        /\.(?:[cm]?[jt]s|[jt]sx)$/.test(relative) &&
        !/(?:^|\/)\.|(?:^|\/)[^/]+\.config\.|\.(?:test|spec)\./.test(
          relative,
        ) &&
        !unmaintainedAncestor(parentOf(relative)) &&
        !nested.some((root) => isWithin(file, root))
      );
    })
    .sort();
  const entryFields = [
    "bin",
    "main",
    "module",
    "exports",
    "types",
    "typings",
  ].map((field) => manifest[field]);
  const entryPoints = entryFields.some((value) => {
    return typeof value === "string"
      ? value.trim() !== ""
      : value !== null &&
          typeof value === "object" &&
          Object.keys(value).length > 0;
  });
  const commands = Object.values(manifest.scripts ?? {}).some(
    (command) => typeof command === "string" && command.trim() !== "",
  );
  const entryStems = new Set(
    entryFields.flatMap(entryPointTargets).map(entryPointStem),
  );
  const packageSource = sources.find((file) => {
    const relative = relativeTo(file, directory);
    return (
      !relative.startsWith("scripts/") ||
      entryStems.has(entryPointStem(relative))
    );
  });
  if (entryPoints && commands && packageSource)
    return { evidence: [packageSource] };
  if (!entryPoints && sources.length === 0) return { sharedOnly: true };
  return { unresolved: true };
}

function draftStackScope({ projectRoot }, stack) {
  const declarationId = `typescript-${stack}-stack`;
  const files = keptFiles(projectRoot);
  const found = workspaces(projectRoot, files);
  const web = classifyWebPackages(projectRoot, files);
  const candidates = [];
  const unresolved = [];
  let projects = 0;

  for (const configuration of found.values())
    if (configuration.unreadable)
      unresolved.push(questions.workspace(configuration.sources[0]));

  const manifests = [...files]
    .filter(
      (path) => path === manifestName || path.endsWith(`/${manifestName}`),
    )
    .sort();
  // The workspace roots that list at least one kept member manifest. A
  // directory whose workspace configuration lists none, such as a single
  // package that keeps pnpm settings in `pnpm-workspace.yaml`, is a package.
  const memberRoots = new Set(
    manifests
      .map((path) => maintainedListing(parentOf(path), found)?.root)
      .filter((root) => root !== undefined),
  );
  for (const path of manifests) {
    const directory = parentOf(path);
    const ownWorkspace = found.get(directory);
    const unreadableAbove = [...found].some(
      ([root, configuration]) =>
        configuration.unreadable &&
        root !== directory &&
        (root === "" || isWithin(directory, root)),
    );
    const listed = maintainedListing(directory, found) !== null;
    const unmaintained = unmaintainedAncestor(directory);
    // Under an unmaintained directory, only a listing by a workspace outside
    // it makes a Project; the manifest's own workspace configuration does not.
    const isProject =
      listed ||
      (!unmaintained && (directory === "" || ownWorkspace !== undefined));
    if (!isProject) {
      if (unreadableAbove) continue;
      if (unmaintained)
        candidates.push({
          path,
          decision: "exclude",
          reason: reasons.unmaintained(path, unmaintained),
          evidence: [path],
        });
      else unresolved.push(questions.standalone(path));
      continue;
    }
    let membershipEvidence = [];
    // Unreadable membership cannot establish that a root is a standalone
    // Project or shared-only configuration. Independent package evidence or
    // an ancestor's readable member listing can still establish membership.
    if (memberRoots.has(directory) || (ownWorkspace?.unreadable && !listed)) {
      const root = rootPackageEvidence(
        projectRoot,
        path,
        files,
        manifests,
        web,
      );
      if (root.unresolved || (ownWorkspace?.unreadable && root.sharedOnly)) {
        if (!ownWorkspace?.unreadable) unresolved.push(questions.root(path));
        continue;
      }
      if (root.sharedOnly) {
        candidates.push({
          path,
          decision: "exclude",
          reason: reasons.workspaceRoot(path),
          evidence: [...new Set([path, ...found.get(directory).sources])],
        });
        continue;
      }
      membershipEvidence = root.evidence;
    }
    const membership = web.get(path);
    if (membership && (stack === "node" || membership.stack !== stack)) {
      candidates.push({
        path,
        decision: "exclude",
        reason: `${membership.reason} ${membership.stack ? `Intended stack: typescript-${membership.stack}.` : "Do not use Node as a fallback."}`,
        evidence: [
          ...new Set([path, ...membership.evidence, ...membershipEvidence]),
        ],
      });
      if (
        membership.kind === "unresolved" ||
        (membership.kind === "shared" && !membership.stack)
      )
        unresolved.push(
          `Settle web membership of ${code(path)} from repository evidence; ${membership.reason}`,
        );
      continue;
    }
    if (stack !== "node" && !membership) {
      candidates.push({
        path,
        decision: "exclude",
        reason: `${code(path)} has no evidence of membership in typescript-${stack}; assess independently, without assigning a web stack from tool conformity alone.`,
        evidence: [path, ...membershipEvidence],
      });
      continue;
    }
    const { differences, evidence } =
      stack === "node"
        ? stackDifferences(projectRoot, path)
        : webStackDifferences(projectRoot, path, stack, files);
    projects += 1;
    candidates.push(
      differences.length === 0
        ? {
            path,
            decision: "include",
            reason:
              stack === "node"
                ? reasons.matches(path)
                : `${membership.reason} The Project matches typescript-${stack} manifest facts; confirm the remaining rules through assessment.`,
            evidence: [...new Set([...evidence, ...membershipEvidence])],
          }
        : {
            path,
            decision: "exclude",
            reason:
              stack === "node"
                ? reasons.differs(path, differences)
                : `The Project differs from typescript-${stack} and stays excluded until migration: ${differences.join(" ")}`,
            evidence: [path, ...membershipEvidence],
          },
    );
  }

  const included = candidates.filter(
    (candidate) => candidate.decision === "include",
  ).length;
  const entry = {
    id: declarationId,
    coverage: coverage(
      { included, projects, unresolved: unresolved.length },
      stack,
    ),
    candidates: candidates.sort(byPath),
    unresolved: unresolved.sort(),
  };
  if (included === 0) entry.noScope = true;
  return { format: proposalFormat, declarations: [entry] };
}

export function runScopeDrafter(stack) {
  try {
    process.stdout.write(
      `${JSON.stringify(draftStackScope(readRequest(process.argv.slice(2), `typescript-${stack}-stack`), stack), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
