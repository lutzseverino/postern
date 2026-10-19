// Platform detection from a Git remote URL.

import { PlatformError } from "./errors.ts";

/** A hosting platform Postern has an adapter for. */
export type PlatformName = "github";

/** Where a repository lives: its platform, host and path on that host. */
export interface RepositoryIdentity {
  platform: PlatformName;
  host: string;
  /** The repository's full path, such as `octo/hello`. GitLab paths can nest groups. */
  path: string;
}

const githubSshHosts = new Set(["github.com", "ssh.github.com"]);

/**
 * Identifies the hosting platform and repository path of a Git remote in HTTPS
 * or SSH form. Fails with reason `unsupported` for any remote no adapter serves.
 */
export function detectPlatform(remote: string): RepositoryIdentity {
  const location = parseRemote(typeof remote === "string" ? remote.trim() : "");
  if (location) {
    const host = location.host.toLowerCase();
    const isGitHub =
      host === "github.com" || (location.ssh && githubSshHosts.has(host));
    const path = location.path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "");
    const segments = path.split("/");
    if (
      isGitHub &&
      segments.length === 2 &&
      segments.every((segment) => /^[A-Za-z0-9_.-]+$/.test(segment) && segment !== "." && segment !== "..")
    ) {
      return { platform: "github", host: "github.com", path };
    }
  }
  throw new PlatformError(
    "unsupported",
    `No platform adapter serves the remote ${describeRemote(location)}.`,
  );
}

interface RemoteLocation {
  host: string;
  path: string;
  ssh: boolean;
}

function parseRemote(remote: string): RemoteLocation | null {
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(remote);
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(remote)) {
    return { host: scp[1]!, path: scp[2]!, ssh: true };
  }
  let url: URL;
  try {
    url = new URL(remote);
  } catch {
    return null;
  }
  const protocol = url.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "ssh:" && protocol !== "git+ssh:") return null;
  if (url.search || url.hash) return null;
  if (protocol === "https:" && url.port && url.port !== "443") return null;
  return { host: url.hostname, path: decodeURIComponent(url.pathname), ssh: protocol !== "https:" };
}

// Names the remote by host and path only, so credentials in it never reach a message.
function describeRemote(location: RemoteLocation | null): string {
  return location ? `on host ${location.host}` : "in an unrecognized form";
}
