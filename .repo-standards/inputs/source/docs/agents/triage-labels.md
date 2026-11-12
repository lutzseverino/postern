# Triage Labels

The skills speak in terms of canonical triage roles. This file maps those roles to the label strings Repo Canon's installed `github-repository-configuration` rules define for this repo's issue tracker; those rules hold every canonical label, its color and description, and adoption keeps this file in step with them.

| Label in mattpocock/skills | Label in our tracker | Waits on                                               |
| -------------------------- | -------------------- | ------------------------------------------------------ |
| `needs-triage`             | `state:triage`       | Triage, to review it or review it again                |
| `needs-info`               | `state:reporter`     | Its outside reporter, for a fact only they hold        |
|                            | `state:grill`        | A grilling session, for the owner's intent             |
| `ready-for-agent`          | `state:ready`        | An agent, to implement the reviewed contract           |
| `ready-for-human`          | `state:owner`        | The owner, for an answer or work only the owner can do |
| `wontfix`                  | `wontfix`            | Nothing: closed, will not be actioned                  |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table. An open issue carries exactly one `state:` label.

Applying `state:ready` is a review of the issue's current contract revision, made through the triage skill's readiness command after the revision notice. An issue left with no state gets `state:triage`.
