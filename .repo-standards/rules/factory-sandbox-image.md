# Factory toolchain image rules

`.factory/Dockerfile` holds only the repository's toolchain and delivery
runtime. It provides the runtimes, compilers, package managers, and command-line
tools that the development guide's Setup and validation section requires, at
the versions it names, plus the Node.js runtime the installed `babysit` scripts
need.

The factory builds the toolchain image from this file, then
adds its own agent layer on top, and every run starts its agent in the result.
The factory's layer brings Git, the GitHub CLI, the agent CLIs, the `agent` user, the working
directory, and the entrypoint, so do not install those for the agent, create
users, or add `ENTRYPOINT` or `CMD`.

Start from a Debian or Ubuntu base where `apt-get` is available, install the
toolchain system-wide, and assume no user or home directory other than `agent`
and `/home/agent`. The factory's layer adds no Node.js. The image must provide
Node.js at a major the installed `babysit` scripts support, currently stable Node.js
24 or 26, because the installed delivery workflow runs those scripts to wait for
checks and merge pull requests. This applies even when the development guide
names no Node.js. Start from a Debian-based Node image, such as
`node:24-bookworm`, or install stable Node.js 24 or 26 system-wide. A toolchain that already
provides either supported major needs nothing extra.

The factory builds the image without a build context, so install with `RUN`
from package sources, not `COPY` or `ADD` from the repository. Leave the
project's own dependencies, such as `npm ci`, to the run, which installs them in
its worktree as the development guide says. The factory's
[sandbox image contract](https://github.com/lutzseverino/repo-canon/blob/scriptorium-v1.0.1/factory/docs/usage/sandbox-image.md)
governs the image.
