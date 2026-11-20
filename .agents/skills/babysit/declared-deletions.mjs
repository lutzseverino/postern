import { pages, pinnedFiles, requestData } from "./platform.mjs";
import { contractFootprint } from "../../../vendor/repo-canon/validate-issue-contract.mjs";

// The merge check of declared deletions. The issue owns its footprint and the
// issue-contract protocol its fields; this check owns how a deleted surface
// resolves to the files that hold it.
// Seam (deferred): surface-to-file resolution forms; consumers: 1; extract at 3.

const closingQuery = `query BabysitClosingContracts($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      closingIssuesReferences(first: 50) {
        nodes { number body repository { nameWithOwner } }
        pageInfo { hasNextPage }
      }
    }
  }
}`;
const openQuery = `query BabysitOpenContracts($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 100, after: $after) {
      nodes { number body }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

async function graphql(connection, query, variables) {
  const [owner, name] = connection.repository.path.split("/");
  const response = await requestData(connection, {
    method: "POST",
    path: "/graphql",
    body: { query, variables: { owner, name, ...variables } },
  });
  if (
    (response?.errors !== undefined &&
      (!Array.isArray(response.errors) || response.errors.length)) ||
    !response?.data?.repository
  )
    throw new Error("Could not read the contracts that declare deletions.");
  return response.data.repository;
}

function contract(node, repository) {
  if (
    !Number.isSafeInteger(node?.number) ||
    node.number <= 0 ||
    typeof node.body !== "string" ||
    typeof repository !== "string"
  )
    throw new Error("Could not read a contract that may declare deletions.");
  return { number: node.number, body: node.body, repository };
}

async function closingContracts(connection, number) {
  const references = (await graphql(connection, closingQuery, { number }))
    .pullRequest?.closingIssuesReferences;
  if (
    !Array.isArray(references?.nodes) ||
    references.pageInfo?.hasNextPage !== false
  )
    throw new Error(`Could not read every closing issue of PR #${number}.`);
  return references.nodes.map((node) =>
    contract(node, node?.repository?.nameWithOwner),
  );
}

async function openContracts(connection) {
  const issues = [];
  let after = null;
  do {
    const page = (await graphql(connection, openQuery, { after })).issues;
    if (
      !Array.isArray(page?.nodes) ||
      typeof page.pageInfo?.hasNextPage !== "boolean"
    )
      throw new Error("Could not read every open issue.");
    issues.push(
      ...page.nodes.map((node) => contract(node, connection.repository.path)),
    );
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (page.pageInfo.hasNextPage && typeof after !== "string")
      throw new Error("Could not read every open issue.");
  } while (after);
  return issues;
}

const slug = (words) => words.trim().toLowerCase().replace(/\s+/g, "-");

// The surface a `Deletes:` item names in a form the check resolves, or null.
// The issue-contract protocol lists these forms. The parser has already removed
// backticks, so a backticked name arrives unquoted.
export function surfaceOf(item) {
  const skill = /^skill\s+"?([\w.-]+)"?$/i.exec(item)?.[1];
  if (skill)
    return {
      key: `skill:${skill.toLowerCase()}`,
      holds: (path) => path.startsWith(`.agents/skills/${skill}/`),
    };
  const reference =
    /^reference\s+(?:"([^"]+)"|([^"()]+?))\s*\(\s*(?:skill\s+)?([\w.-]+)(?:\s+skill)?\s*\)$/i.exec(
      item,
    );
  if (reference) {
    const owner = reference[3];
    const directory = `.agents/skills/${owner}/references/`;
    const stem = slug(reference[1] ?? reference[2]);
    return {
      key: `reference:${directory}${stem}`.toLowerCase(),
      holds: (path) =>
        path.startsWith(directory) &&
        !path.slice(directory.length).includes("/") &&
        path
          .slice(directory.length)
          .replace(/\.[^.]*$/, "")
          .toLowerCase() === stem,
    };
  }
  const section =
    /^rule section\s+(?:"([^"]+)"|([^"()]+?))\s*\(\s*([^()]+?)\s+rules\s*\)$/i.exec(
      item,
    );
  if (section) {
    const name = slug(section[3]);
    const path = `rules/${name}.md`;
    const heading = (section[1] ?? section[2]).trim().toLowerCase();
    return {
      key: `rule section:${path}#${heading}`.toLowerCase(),
      rules: path,
      heading,
      holds: (candidate) => candidate === path,
    };
  }
  return null;
}

// The 1-based line range of the first ATX heading named `heading`, up to the
// next heading at its level or above, outside fenced code; or null.
function sectionRange(text, heading) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let fence = null;
  let found = null;
  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (
      marker &&
      (!fence || (marker[0] === fence[0] && marker.length >= fence.length))
    ) {
      fence = fence ? null : marker;
      continue;
    }
    if (fence) continue;
    const match = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
    if (!match) continue;
    if (found && match[1].length <= found.level) return [found.start, index];
    if (!found && match[2].trim().toLowerCase() === heading)
      found = { level: match[1].length, start: index + 1 };
  }
  return found ? [found.start, lines.length] : null;
}

async function treePaths(connection, revision) {
  const tree = await requestData(connection, {
    path: `/repos/${connection.repository.path}/git/trees/${revision}?recursive=1`,
  });
  if (tree?.truncated !== false || !Array.isArray(tree.tree))
    throw new Error(`Could not read the complete tree at ${revision}.`);
  return tree.tree
    .filter((entry) => entry?.type === "blob")
    .map((entry) => {
      if (typeof entry.path !== "string")
        throw new Error(`Could not read the tree at ${revision}.`);
      return entry.path;
    });
}

// The files that hold each surface at one revision, with the section's line
// range for a rule section.
async function revisionHolders(connection, revision, surfaces) {
  const paths = await treePaths(connection, revision);
  const rules = [
    ...new Set(
      surfaces
        .filter(({ rules }) => rules && paths.includes(rules))
        .map(({ rules }) => rules),
    ),
  ];
  const texts = rules.length
    ? (
        await pinnedFiles(
          connection,
          Object.fromEntries(
            rules.map((path, index) => [`rules${index}`, path]),
          ),
          { revision, evidence: `${connection.repository.path}@${revision}` },
        )
      ).files
    : {};
  return (surface) => {
    if (!surface.rules)
      return { files: paths.filter(surface.holds), range: null };
    const text = texts[`rules${rules.indexOf(surface.rules)}`];
    const range = text ? sectionRange(text, surface.heading) : null;
    return { files: range ? [surface.rules] : [], range };
  };
}

// Line numbers a patch adds, on the head side, and removes, on the base side.
function changedLines(patch) {
  const added = [];
  const removed = [];
  let base = 0;
  let head = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      base = Number(hunk[1]);
      head = Number(hunk[2]);
    } else if (line.startsWith("+")) added.push(head++);
    else if (line.startsWith("-")) removed.push(base++);
    else if (!line.startsWith("\\")) {
      base++;
      head++;
    }
  }
  return { added, removed };
}

const within = (lines, range) =>
  range !== null && lines.some((line) => line >= range[0] && line <= range[1]);

function edits(surface, holders, files) {
  const paths = new Set([...holders.base.files, ...holders.head.files]);
  for (const file of files) {
    const names = [file.filename, file.previous_filename].filter(Boolean);
    const held = names.filter(
      (name) => paths.has(name) || (!surface.rules && surface.holds(name)),
    );
    if (!held.length) continue;
    if (!surface.rules) return { file: held[0] };
    if (typeof file.patch !== "string") return { unreadable: held[0] };
    const { added, removed } = changedLines(file.patch);
    if (
      within(added, holders.head.range) ||
      within(removed, holders.base.range)
    )
      return { file: held[0] };
  }
  return null;
}

async function changedFiles(connection, number) {
  const files = (
    await pages(
      connection,
      `/repos/${connection.repository.path}/pulls/${number}/files?per_page=100`,
    )
  ).flat();
  if (files.some((file) => typeof file?.filename !== "string"))
    throw new Error(`Could not read the files PR #${number} changes.`);
  return files;
}

const fileList = (files) =>
  files.length > 3
    ? `${files.slice(0, 3).join(", ")} and ${files.length - 3} more`
    : files.join(", ");

const count = (number, noun) => `${number} ${noun}${number === 1 ? "" : "s"}`;

// Fails when a closing ticket's declared deletion is still present at the head,
// or when the change edits a surface another open ticket deletes. A surface
// that resolves at neither the merge base nor the head is reported.
export async function declaredDeletions(connection, number, branch, head) {
  const repository = connection.repository.path;
  const reference = ({ repository: from, number }) =>
    from.toLowerCase() === repository.toLowerCase()
      ? `#${number}`
      : `${from}#${number}`;
  const closing = await closingContracts(connection, number);
  const closes = new Set(closing.map((ticket) => reference(ticket)));
  const report = [];
  const deletions = [];
  for (const ticket of closing) {
    const footprint = contractFootprint(ticket.body, ticket.repository);
    report.push(
      footprint.known
        ? `${reference(ticket)} footprint: ${count(footprint.adds.length, "add")} against ${count(footprint.deletes.length, "delete")}, shown and never gated.`
        : `${reference(ticket)} footprint: unknown, without Supersedes:, Adds: and Deletes: lines.`,
    );
    for (const item of footprint.deletes)
      deletions.push({ ticket, item, own: true, surface: surfaceOf(item) });
  }
  for (const ticket of await openContracts(connection)) {
    if (closes.has(reference(ticket))) continue;
    for (const item of contractFootprint(ticket.body, repository).deletes)
      deletions.push({ ticket, item, own: false, surface: surfaceOf(item) });
  }
  const failures = [];
  const unresolved = deletions.filter(({ surface }) => !surface);
  const recognized = deletions.filter(({ surface }) => surface);
  if (recognized.length) {
    const comparison = await requestData(connection, {
      path: `/repos/${repository}/compare/${encodeURIComponent(branch)}...${head}`,
    });
    const mergeBase = comparison?.merge_base_commit?.sha;
    if (!/^[0-9a-f]{40}$/i.test(mergeBase ?? ""))
      throw new Error(`Could not read the merge base of ${head}.`);
    const surfaces = recognized.map(({ surface }) => surface);
    const at = {
      base: await revisionHolders(connection, mergeBase, surfaces),
      head: await revisionHolders(connection, head, surfaces),
    };
    const ownKeys = new Set(
      recognized.filter(({ own }) => own).map(({ surface }) => surface.key),
    );
    let files;
    for (const deletion of recognized) {
      const { ticket, item, own, surface } = deletion;
      const holders = { base: at.base(surface), head: at.head(surface) };
      if (!holders.base.files.length && !holders.head.files.length) {
        unresolved.push(deletion);
        continue;
      }
      if (own) {
        if (holders.head.files.length)
          failures.push(
            `${reference(ticket)} declares ${item} deleted, but ${fileList(holders.head.files)} still ${holders.head.files.length === 1 ? "holds" : "hold"} it.`,
          );
        continue;
      }
      if (ownKeys.has(surface.key)) continue;
      files ??= await changedFiles(connection, number);
      const edit = edits(surface, holders, files);
      if (edit?.unreadable)
        unresolved.push({
          ...deletion,
          reason: `the change to ${edit.unreadable} has no readable patch`,
        });
      else if (edit)
        failures.push(
          `This change edits ${item} in ${edit.file}, which open ${reference(ticket)} deletes; wait for ${reference(ticket)}.`,
        );
    }
  }
  if (unresolved.length)
    report.push(
      `Declared deletions not resolved to files, so not checked: ${unresolved
        .map(
          ({ ticket, item, reason }) =>
            `${reference(ticket)} "${item}"${reason ? ` (${reason})` : ""}`,
        )
        .join("; ")}.`,
    );
  return { failures, report };
}
