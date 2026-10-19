// Builds the published runtime, one self-contained ESM file, and the type
// declarations beside it.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const { name, version, license } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const dist = new URL("dist/", root);

rmSync(dist, { recursive: true, force: true });

await build({
  absWorkingDir: root.pathname,
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

const tsc = new URL("node_modules/typescript/bin/tsc", root);
execFileSync(process.execPath, [tsc.pathname, "-p", "tsconfig.build.json"], { cwd: root, stdio: "inherit" });

// Declarations keep the sources' `.ts` specifiers; consumers resolve `.js` to
// the `.d.ts` beside it.
const types = new URL("types/", dist);
for (const file of readdirSync(types, { recursive: true })) {
  if (!file.endsWith(".d.ts")) continue;
  const path = new URL(file, types);
  const text = readFileSync(path, "utf8");
  writeFileSync(path, text.replace(/(from\s+["']\.{1,2}\/[^"']+)\.ts(["'])/g, "$1.js$2"));
}
