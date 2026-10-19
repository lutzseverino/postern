// Builds the published runtime, one self-contained ESM file, and the type
// declarations beside it.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const { name, version, license } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });

await build({
  absWorkingDir: root,
  entryPoints: ["src/index.ts"],
  outfile: "dist/postern.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  packages: "external",
  legalComments: "none",
  banner: { js: `/*! ${name} ${version} | ${license} License | https://github.com/lutzseverino/postern */` },
  logLevel: "warning",
});

const tsc = join(root, "node_modules/typescript/bin/tsc");
execFileSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], { cwd: root, stdio: "inherit" });

// Declarations keep the sources' `.ts` specifiers; consumers resolve `.js` to
// the `.d.ts` beside it.
const types = join(dist, "types");
for (const file of readdirSync(types, { recursive: true })) {
  if (!file.endsWith(".d.ts")) continue;
  const path = join(types, file);
  const text = readFileSync(path, "utf8");
  writeFileSync(path, text.replace(/(from\s+["']\.{1,2}\/[^"']+)\.ts(["'])/g, "$1.js$2"));
}
