import { readdirSync } from "node:fs";
import { join } from "node:path";

// Discovery copies contain kept files. Checks may run in a checkout; ignore
// Git, runtime state, dependencies and symlinks in either environment.
export function keptFiles(projectRoot) {
  const files = new Set();
  const visit = (directory) => {
    for (const entry of readdirSync(join(projectRoot, directory), {
      withFileTypes: true,
    })) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (
        [".git", "node_modules", ".repo-standards"].includes(entry.name) ||
        /^(?:\.agents|\.claude)\/skills\/(?:repository-standards|author-standards)(?:\/|$)/.test(
          path,
        )
      )
        continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.add(path);
    }
  };
  visit("");
  return files;
}
