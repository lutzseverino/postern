import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, posix, relative, sep } from "node:path";

export function resolvedLocalPath(sourcePath, target) {
  if (/^(?:[a-z][a-z+.-]*:|\/|\\)/i.test(target)) return null;
  try {
    const root = new URL("https://repository.invalid/project/");
    const encodedSourcePath = sourcePath
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const source = new URL(encodedSourcePath, root);
    const destination = new URL(target, source);
    if (destination.origin !== root.origin) return null;
    if (!destination.pathname.startsWith(root.pathname)) return undefined;
    const decoded = decodeURIComponent(
      destination.pathname.slice(root.pathname.length),
    );
    if (decoded.includes("\\")) return undefined;
    const normalized = posix.normalize(decoded);
    if (
      posix.isAbsolute(normalized) ||
      normalized === ".." ||
      normalized.startsWith("../")
    )
      return undefined;
    return normalized;
  } catch {
    return undefined;
  }
}

export function localPathExists(projectRoot, path) {
  try {
    const root = realpathSync(projectRoot);
    let current = root;
    const segments = path.split("/").filter(Boolean);
    for (const [index, segment] of segments.entries()) {
      if (!readdirSync(current).includes(segment)) return false;
      const candidate = join(current, segment);
      const entry = lstatSync(candidate);
      current = entry.isSymbolicLink() ? realpathSync(candidate) : candidate;
      const fromRoot = relative(root, current);
      if (
        fromRoot === ".." ||
        fromRoot.startsWith(`..${sep}`) ||
        isAbsolute(fromRoot)
      )
        return false;
      if (index < segments.length - 1 && !statSync(current).isDirectory())
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Every rendered link or image in `elements` whose target is local, as
// `{ target, path, broken }`. `path` is the target's repository-relative path,
// or undefined when the target leaves the project, which makes the link broken.
// External and absolute targets are not local links.
export function localLinks(projectRoot, sourcePath, elements) {
  const links = [];
  for (const element of elements) {
    if (!["link", "image"].includes(element.type)) continue;
    const path = resolvedLocalPath(sourcePath, element.target);
    if (path === null) continue;
    links.push({
      target: element.target,
      path,
      broken: path === undefined || !localPathExists(projectRoot, path),
    });
  }
  return links;
}

export function brokenLocalLinks(projectRoot, sourcePath, elements) {
  return localLinks(projectRoot, sourcePath, elements)
    .filter((link) => link.broken)
    .map(({ target, path }) => ({ target, path }));
}
