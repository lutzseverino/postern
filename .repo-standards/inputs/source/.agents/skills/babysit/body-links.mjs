import { marked } from "../../../vendor/marked/marked.esm.js";
import { parseFragment } from "../../../vendor/parse5/parse5.esm.js";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { requestData } from "./platform.mjs";

// Parse rendered Markdown so references, autolinks and HTML use the same rule.
function headLinks(body, repository, branch, definitions = body) {
  const links = new Set();
  const visit = (node) => {
    for (const attribute of node.attrs ?? []) {
      if (attribute.name !== "href" && attribute.name !== "src") continue;
      try {
        const url = new URL(attribute.value, "https://github.com");
        const path = decodeURIComponent(url.pathname);
        const prefix = `/${repository}/blob/`;
        if (
          url.hostname.toLowerCase() === "github.com" &&
          path.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase() &&
          path.slice(prefix.length).startsWith(`${branch}/`)
        )
          links.add(attribute.value);
      } catch {
        // A malformed or unrelated URL is outside this own-head link check.
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  const lexer = new marked.Lexer();
  // Reference definitions can live in the exempt prefix while their uses are
  // appended by the author. Resolve those uses as the complete body does.
  if (definitions !== body)
    Object.assign(lexer.tokens.links, marked.lexer(definitions).links);
  visit(parseFragment(marked.parser(lexer.lex(body))));
  return [...links];
}

export class HeadBranchLinks extends Error {}

// Commands use argument arrays, bounded foreground waits and no partial stdout.
function command(executable, args, cwd, timeout = 15_000) {
  try {
    return execFileSync(executable, args, {
      cwd,
      timeout,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(
      `${executable} ${args.join(" ")} failed (${error.code ?? error.signal ?? `exit ${error.status}`}).`,
      { cause: error },
    );
  }
}

function rebuiltSummary(pull, details) {
  const root = command("git", ["rev-parse", "--show-toplevel"]).trim();
  const temporaryRoot = realpathSync(tmpdir());
  const within = relative(realpathSync(root), temporaryRoot);
  if (!isAbsolute(within) && within !== ".." && !within.startsWith(`..${sep}`))
    throw new Error("The temporary directory is inside the author's checkout.");
  for (const [label, sha] of [
    ["PR base", details.base?.sha],
    ["PR head", pull.headCommit],
  ]) {
    if (!/^[a-f0-9]{40}$/i.test(sha ?? ""))
      throw new Error(`${label} commit is unavailable.`);
    try {
      command("git", ["cat-file", "-e", `${sha}^{commit}`], root);
    } catch {
      throw new Error(`${label} commit ${sha} is unavailable locally.`);
    }
  }
  const base = command(
    "git",
    ["merge-base", details.base.sha, pull.headCommit],
    root,
  ).trim();
  const directory = mkdtempSync(join(temporaryRoot, "babysit-summary-"));
  const worktree = join(directory, "tree");
  try {
    command("git", ["worktree", "add", "--detach", worktree, base], root);
    command(
      "git",
      ["restore", `--source=${pull.headCommit}`, "--worktree", ":/"],
      worktree,
    );
    if (
      !existsSync(join(worktree, ".repo-standards/runtime/package-lock.json"))
    )
      throw new Error("The PR head has no pinned runtime lockfile.");
    command(
      "npm",
      ["ci", "--ignore-scripts", "--prefix", ".repo-standards/runtime"],
      worktree,
      120_000,
    );
    const summary = command(
      ".repo-standards/runtime/node_modules/.bin/repo-standards",
      ["status", "--summary"],
      worktree,
      60_000,
    );
    if (!summary.startsWith("# Repository Standards adoption record\n"))
      throw new Error(
        "The pinned tool did not emit a complete adoption summary.",
      );
    return summary;
  } finally {
    // A failed cleanup also denies the exemption, rather than leaving a silent leak.
    // A checkout hook can fail after Git has already registered the worktree.
    try {
      const registered = command(
        "git",
        ["worktree", "list", "--porcelain", "-z"],
        root,
      )
        .split("\0")
        .includes(`worktree ${worktree}`);
      if (registered)
        command("git", ["worktree", "remove", "--force", worktree], root);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

export async function checkBodyLinks(pull, connection) {
  if (!pull.body) return;
  // The port reports destination identity; Access supplies source identity for forks
  // and the immutable base needed to rebuild an adoption's pre-commit state.
  const details = await requestData(connection, {
    path: `/repos/${connection.repository.path}/pulls/${pull.number}`,
  });
  const repository = details.head?.repo?.full_name;
  if (
    details.head?.sha !== pull.headCommit ||
    details.head?.ref !== pull.headBranch ||
    typeof repository !== "string" ||
    !/^[^/]+\/[^/]+$/.test(repository)
  )
    throw new Error(
      "Could not establish the PR's current head repository and ref.",
    );
  let links = headLinks(pull.body, repository, pull.headBranch);
  if (!links.length) return;
  let reason;
  try {
    const summary = rebuiltSummary(pull, details);
    if (pull.body.startsWith(summary)) {
      links = headLinks(
        pull.body.slice(summary.length),
        repository,
        pull.headBranch,
        pull.body,
      );
    } else {
      reason =
        "the body does not start with the complete rebuilt summary byte for byte";
    }
  } catch (error) {
    reason = error.message;
  }
  if (links.length)
    throw new HeadBranchLinks(
      `${reason ? `No adoption-summary exemption applied: ${reason}. Checking the whole body.\n` : ""}` +
        `Replace these PR-body head-branch file links with commit-SHA links and rerun request.mjs:\n${links.join("\n")}`,
    );
}
