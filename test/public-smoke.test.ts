// The public check's provenance gate: `scripts/public-smoke.mjs` run against a
// stand-in `npm` that answers as the registry would, so no test reaches it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/public-smoke.mjs", import.meta.url));
const version = "1.0.0";
const provenance = { url: `https://registry.npmjs.org/-/npm/v1/attestations/@lutzseverino/postern@${version}`, provenance: { predicateType: "https://slsa.dev/provenance/v1" } };

describe("the public check", { skip: process.platform === "win32" }, () => {
  let bin: string;

  before(() => {
    bin = mkdtempSync(join(tmpdir(), "postern-smoke-"));
  });

  after(() => rmSync(bin, { recursive: true, force: true }));

  // Runs the check with an `npm` that reports the version as published, its
  // signatures as verified, and `attestations` as the version's
  // `dist.attestations`, printing nothing when it is undefined, as npm does.
  function check(attestations: unknown) {
    const npm = join(bin, "npm");
    writeFileSync(
      npm,
      `#!${process.execPath}
const args = process.argv.slice(2);
const attestations = ${JSON.stringify(attestations === undefined ? null : JSON.stringify(attestations))};
if (args[0] === "view" && args.includes("version")) console.log(JSON.stringify(${JSON.stringify(version)}));
else if (args[0] === "view" && args.includes("dist.attestations")) { if (attestations !== null) console.log(attestations); }
`,
    );
    chmodSync(npm, 0o755);
    return spawnSync(process.execPath, [script, version], {
      encoding: "utf8",
      // The check's scratch project goes under `bin`, which `after` removes.
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, TMPDIR: bin },
    });
  }

  it("fails a version published without attestations", () => {
    const result = check(undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no provenance attestation/);
  });

  it("fails a version whose attestations hold no SLSA provenance", () => {
    const result = check({ url: provenance.url });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no provenance attestation/);
  });

  it("passes the provenance gate for a version with a SLSA provenance attestation", () => {
    // The stand-in installs nothing, so the check stops when it imports the package.
    const result = check(provenance);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /no provenance attestation/);
    assert.match(result.stderr, /ERR_MODULE_NOT_FOUND/);
  });
});
