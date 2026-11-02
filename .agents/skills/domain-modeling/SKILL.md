---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a GLOSSARY.md, or recording or editing an ADR.
---

A prompt or brief naming this skill is its invocation.

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `GLOSSARY.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

Most repos have a single context:

```
/
├── GLOSSARY.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `GLOSSARY-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── GLOSSARY-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── GLOSSARY.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── GLOSSARY.md
│       └── docs/adr/
```

Create files lazily: only when you have something to write. If no `GLOSSARY.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed, with the index [ADR-FORMAT.md](./ADR-FORMAT.md) describes when the repo indexes its documentation directories.

Before your first edit to a glossary or ADR, work on a branch of your own in a checkout you own, such as a worktree or fresh clone, never in a shared checkout on the default branch. Each repository whose domain documents change gets its edits delivered as its contribution guide directs, such as one pull request.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `GLOSSARY.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update GLOSSARY.md inline

When a term is resolved, update `GLOSSARY.md` right there. Don't batch these up: capture them as they happen. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

`GLOSSARY.md` should be totally devoid of implementation details. Do not treat `GLOSSARY.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

## Reads

Paths are relative to the repository root.

- `GLOSSARY.md`, or the root `GLOSSARY-MAP.md` that points to each context's
  own `GLOSSARY.md`: the domain language. When `GLOSSARY-MAP.md` is missing,
  the repository has a single context; when its `GLOSSARY.md` is missing,
  create it once the first term is resolved.
- `docs/adr/`, holding `docs/adr/<NNNN>-<slug>.md` records, and each context's
  own `docs/adr/`: the decisions. When it is missing, create it when the first
  ADR is needed.
- `<directory>/README.md`, such as `docs/adr/README.md`: a documentation
  directory's index. When the repository's documentation directories are
  missing one, keep no ADR index; when only `docs/adr/README.md` is missing,
  create it with `docs/adr/`.
- `CONTRIBUTING.md`: how the repository delivers glossary and ADR edits, such
  as one pull request. When it is missing, leave the edits on your own
  branch.
