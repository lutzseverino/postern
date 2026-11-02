# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                                                    |
| -------------------------- | -------------------- | -------------------------------------------------------------------------- |
| `needs-triage`             | `needs-triage`       | Requires review or renewed review                                          |
| `needs-info`               | `needs-info`         | Missing information; the orchestrating agent answers or routes it          |
| `ready-for-agent`          | `ready-for-agent`    | Reviewed and sufficiently specified for agent implementation               |
| `ready-for-human`          | `ready-for-human`    | Reviewed; needs the owner's accounts, credentials or a reserved taste call |
| `wontfix`                  | `wontfix`            | Will not be actioned                                                       |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Applying `ready-for-agent` or `ready-for-human` is a review of the issue's current contract revision, made through the triage skill's readiness command after the revision notice. An issue left with no role gets `needs-triage`.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.
