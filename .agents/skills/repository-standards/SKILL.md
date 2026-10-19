---
name: repository-standards
description: In a project with .repo-standards/, read the repository-wide installed rules and report available CLI and standards updates at the start of any work, including work that changes no file. Look up installed rules before changing a file.
disable-model-invocation: false
---

This skill looks up the standards source's installed rules and reports available
updates. Requirements come from those rules; this skill adds none of its own.
An update starts only on the maintainer's instruction.

## At the start of any work

At the start of any work in the project, including work that changes no file,
such as applying labels on a hosting platform or asking the owner a
question, run the pinned CLI's `rules` with no path once, from the
Git root, alongside the update notice under **Read the pins**:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards rules
```

It prints only the rules of repository-wide declarations, which govern any
work in the project, and needs no network. Follow the printed rules throughout
the work. If it fails:

- A missing runtime or `CLI_PIN_MISMATCH`: restore the runtime as described
  under **Read the pins**, then retry.
- `ACTIVE_RUN`: read `.repo-standards/rules/README.md` and the installed rules
  it lists as covering the whole repository, as for contextual work below.
- `NO_SELECTION`: no rules are installed; continue.
- Any other failure: report the diagnostic and resolve it before continuing.

A failure of this lookup never suppresses the update notice, and a failure of
the update notice never suppresses this lookup.

## Before changing a file

From the adopting project's Git root, run its pinned CLI for each path you
will change, including a file you will create or delete:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards rules <path>
```

Follow the rules it prints. The lookup includes repository-wide rules and
needs no network. If the runtime is missing or reports `CLI_PIN_MISMATCH`,
restore it as described under **Read the pins**, then retry the lookup.

During an adoption or update, `rules` reports `ACTIVE_RUN`: it reads only a
complete adoption. For the run's contextual work, read
`.repo-standards/rules/README.md` and the installed rules it lists for the path
and for the whole repository. The run's contextual work request also names
each declaration's installed rules. These are the candidate selection's
rules, installed before contextual work; follow them together with the run's
adoption guidance. A selection without rules has no rules directory.

For any other lookup failure, report the diagnostic and resolve it before
changing the file; an update-notice failure below does not prevent rule lookup.

## Read the pins

Work from the adopting project's Git root and run its pinned CLI:

```sh
.repo-standards/runtime/node_modules/.bin/repo-standards outdated --json
```

`outdated` is read-only apart from its ignored cache and needs no clean working
tree. Reinstall the pinned runtime once, then run `outdated --json` again, when:

- the executable is missing: run
  `npm ci --ignore-scripts --prefix .repo-standards/runtime`;
- `outdated` fails with `CLI_PIN_MISMATCH` and its message names a reinstall
  command: run that command from the project root it names.

If the second run fails too, or the message names no reinstall command, report
both pins as `unknown` with the diagnostic, and continue.

## Report

For each pin, `cli` and `standards`:

- `update: available`: report the pinned version and `newest`. Report the
  update class, exact or contextual, only when an inspection of that update has
  already reported its `updateClass`; otherwise say that an inspection
  establishes it.
- `update: unknown`: report `unknown` with the reason's code and message. A
  failed lookup is not an error and never stops the current work.
- `update: none`: report that the pin is current, or omit it.

## After reporting

Without the maintainer's instruction, mention the available updates and
continue the current work as planned. Do not inspect or start an update.

When the maintainer asks for an update, carry it through `adopt` as a change
separate from the current work, never mixed with the current work's changes.
On that instruction, run the pinned CLI's `adopt` without a source, which
updates the current selection, and follow the next steps it prints. The run
starts from a clean working tree and asks for confirmation only when its
inspection requires it.
