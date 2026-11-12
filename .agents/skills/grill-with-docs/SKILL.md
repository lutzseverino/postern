---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

A prompt or brief naming this skill is its invocation.

Read the contribution guide's Triage rules for publication, inference and
amendments. Invoke `grilling` and `domain-modeling` through the session's
supported skill mechanism, with the request, recorded decisions and dated
sources as context. Apply the guide's Triage inference and question-routing
rules during the interview, and gather missing facts yourself.
Invoke `codebase-design` and apply its [Ownership check](../codebase-design/SKILL.md#ownership-check) to proposed designs during the interview.

Once the interview and the guide's applicable owner gates are complete, invoke
`to-spec`, then `to-tickets`. Pass the dated decisions and quoted words to both
publication steps. Return the issue links, actual native parent/blocker
relationships, inferences and open factual verification to the orchestrating
agent for the guide's split decision and independent acceptance. At each native
write, inspect the response; on failure, stop and report the exact missing edge
and platform failure under the guide's publication rule.

For an amendment under the guide's Triage rules, interview, record the
specification revision and invoke `to-tickets` on the delta. Return the changed
contracts and native links for acceptance under the guide's Readiness section.

## Reads

Paths are relative to each responsible repository root.

- `CONTRIBUTING.md`: Triage, implementation contracts and readiness. If missing,
  use this method with independent review and `grilling`'s missing-guide fallback.
- The `grilling`, `domain-modeling`, `to-spec` and `to-tickets` skills:
  interview, domain documents and publication methods.
  If one is missing, report it and stop that step rather than inventing a substitute.
- The `codebase-design` skill: the design check applied during the interview.
  If missing, report the missing definition and stop that step.
