// The published package: what the tarball holds, and that its single runtime
// file works on its own. Run after `npm run build`.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = join(root, "dist/postern.mjs");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

describe("the published package", () => {
  let work: string;
  let tarball: string;
  let files: string[];

  before(() => {
    assert.ok(existsSync(bundle), "Run `npm run build` before the package tests.");
    work = mkdtempSync(join(tmpdir(), "postern-package-"));
    const [packed] = JSON.parse(
      execFileSync(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", work], { cwd: root, encoding: "utf8" }),
    ) as [{ filename: string; files: { path: string }[] }];
    tarball = join(work, packed.filename);
    files = packed.files.map((file) => file.path).sort();
  });

  after(() => rmSync(work, { recursive: true, force: true }));

  it("holds the runtime, its declarations, the README, the license and package.json only", () => {
    const declarations = files.filter((file) => file.startsWith("dist/types/"));
    assert.ok(declarations.includes("dist/types/index.d.ts"));
    assert.ok(declarations.every((file) => file.endsWith(".d.ts")));
    assert.deepEqual(
      files.filter((file) => !file.startsWith("dist/types/")),
      ["LICENSE", "README.md", "dist/postern.mjs", "package.json"],
    );
  });

  it("declares no runtime dependency fields", () => {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "bundleDependencies", "bundledDependencies"]) {
      assert.equal(field in manifest, false, `package.json has ${field}`);
    }
    assert.equal(manifest.name, "@lutzseverino/postern");
    assert.equal(manifest.version, "1.1.0");
    assert.equal(manifest.type, "module");
    assert.equal(manifest.license, "MIT");
    assert.deepEqual(manifest.engines, { node: "^24.0.0 || ^26.0.0" });
    assert.deepEqual(manifest.exports["."], { types: "./dist/types/index.d.ts", default: "./dist/postern.mjs" });
  });

  it("has a runtime that imports only Node.js built-ins and reads no environment or files", () => {
    const source = readFileSync(bundle, "utf8");
    const specifiers = [
      ...source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm),
      ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
      ...source.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
    ].map((match) => match[1]);
    for (const specifier of specifiers) assert.match(String(specifier), /^node:/);
    assert.doesNotMatch(source, /process\.env|readFileSync|readFile\(|child_process|\brequire\(/);
  });

  it("runs when its one file is copied alone into an empty directory", () => {
    const alone = join(work, "alone");
    mkdirSync(alone);
    copyFileSync(bundle, join(alone, "postern.mjs"));
    writeFileSync(
      join(alone, "check.mjs"),
      `import { connect, detectPlatform, PlatformError } from "./postern.mjs";
const identity = detectPlatform("git@github.com:octo/hello.git");
const fetch = async (url) => new Response(JSON.stringify([{ id: 1, tag_name: "v1.0.0", name: "1.0.0", draft: false, prerelease: false, published_at: "2026-01-01T00:00:00Z" }]), { status: 200 });
const releases = await connect(identity, { fetch }).releaseSource.releases();
let reason;
try { detectPlatform("https://gitlab.com/a/b.git"); } catch (error) { reason = error instanceof PlatformError && error.reason; }
console.log(JSON.stringify({ identity, tags: releases.map((release) => release.tag), reason }));
`,
    );
    const output = execFileSync(process.execPath, ["check.mjs"], { cwd: alone, encoding: "utf8" });
    assert.deepEqual(JSON.parse(output), {
      identity: { platform: "github", host: "github.com", path: "octo/hello" },
      tags: ["v1.0.0"],
      reason: "unsupported",
    });
  });

  it("installs from its tarball with types a TypeScript consumer resolves", () => {
    const consumer = join(work, "consumer");
    mkdirSync(consumer);
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
    execFileSync(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", tarball], { cwd: consumer, stdio: "pipe" });
    writeFileSync(
      join(consumer, "index.ts"),
      `import { connect, PlatformError, type Issue, type IssueEvent, type IssueEventKind, type PlatformEvent } from "@lutzseverino/postern";
const tracker = connect("https://github.com/octo/hello").issueTracker;
const event: PlatformEvent = { name: "issues", payload: {} };
export const normalize = (): Promise<IssueEvent | null> => tracker.issueEvent(event);
export const kind: IssueEventKind = "commentDeleted";
export const read = async (): Promise<Issue | string> => tracker.issue(1).catch((error: unknown) => error instanceof PlatformError ? error.reason : "other");
`,
    );
    writeFileSync(
      join(consumer, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "nodenext",
          moduleResolution: "nodenext",
          strict: true,
          exactOptionalPropertyTypes: true,
          noUncheckedIndexedAccess: true,
          noEmit: true,
          lib: ["es2024"],
          types: ["node"],
          typeRoots: [join(root, "node_modules/@types")],
        },
      }),
    );
    for (const fixture of ["published-1.0.0.d.ts", "legacy-types.ts", "additive-types.ts"]) {
      copyFileSync(join(root, `test/fixtures/${fixture}.txt`), join(consumer, fixture));
    }
    execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", consumer], { stdio: "pipe" });
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `import { detectPlatform } from "@lutzseverino/postern"; console.log(detectPlatform("https://github.com/a/b").path);`],
      { cwd: consumer, encoding: "utf8" },
    );
    assert.equal(output.trim(), "a/b");
  });
});

describe("the build script", () => {
  it("builds in a checkout whose path a file URL percent-encodes", () => {
    const work = mkdtempSync(join(tmpdir(), "postern-build-"));
    try {
      const checkout = join(work, "a checkout #1");
      mkdirSync(checkout);
      for (const entry of ["src", "scripts", "package.json", "tsconfig.json", "tsconfig.build.json"]) {
        cpSync(join(root, entry), join(checkout, entry), { recursive: true });
      }
      symlinkSync(join(root, "node_modules"), join(checkout, "node_modules"), "dir");
      execFileSync(process.execPath, [join(checkout, "scripts/build.mjs")], { cwd: checkout, stdio: "pipe" });
      assert.ok(existsSync(join(checkout, "dist/postern.mjs")));
      assert.ok(existsSync(join(checkout, "dist/types/index.d.ts")));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
