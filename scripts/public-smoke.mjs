// Checks a published version as a public user gets it: installs it from the
// npm registry into an empty project, verifies its registry signatures and
// provenance, reads this repository's releases anonymously through it, and
// runs its single file copied alone. Usage: node scripts/public-smoke.mjs <version>

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const name = "@lutzseverino/postern";
const repository = "https://github.com/lutzseverino/postern.git";
const version = process.argv[2];
assert.match(version ?? "", /^\d+\.\d+\.\d+$/, "Pass the published version, such as 1.0.0.");

const npm = (args, cwd) => execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

// The registry reaches every reader eventually; wait up to ten minutes for it.
const deadline = Date.now() + 600_000;
for (;;) {
  try {
    if (JSON.parse(npm(["view", `${name}@${version}`, "version", "--json"])) === version) break;
  } catch {
    // Not visible yet.
  }
  assert.ok(Date.now() < deadline, `${name}@${version} did not appear on the registry within ten minutes.`);
  console.log(`Waiting for ${name}@${version} on the registry`);
  await sleep(10_000);
}

const project = mkdtempSync(join(tmpdir(), "postern-public-"));
writeFileSync(join(project, "package.json"), JSON.stringify({ name: "postern-public-check", private: true, type: "module" }));
npm(["install", "--ignore-scripts", "--no-fund", `${name}@${version}`], project);
npm(["audit", "signatures"], project);

const runtime = join(project, "node_modules", ...name.split("/"), "dist", "postern.mjs");
const postern = await import(pathToFileURL(runtime).href);
const connection = postern.connect(repository);
const tags = (await connection.releaseSource.releases()).map((release) => release.tag);
assert.ok(tags.includes(`v${version}`), `The GitHub release v${version} is not listed.`);
assert.match(await connection.releaseSource.tagCommit(`v${version}`), /^[0-9a-f]{40}$/);

const alone = join(project, "alone");
mkdirSync(alone);
copyFileSync(runtime, join(alone, "postern.mjs"));
const copied = await import(pathToFileURL(join(alone, "postern.mjs")).href);
assert.equal(copied.detectPlatform(repository).path, "lutzseverino/postern");

console.log(`${name}@${version} installs, verifies, reads its own release and runs alone on Node.js ${process.versions.node}.`);
