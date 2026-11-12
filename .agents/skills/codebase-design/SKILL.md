---
name: codebase-design
description: Shared vocabulary for designing deep modules and checking value ownership. Use when designing a module's interface, choosing or deferring a seam, checking where values belong, making code testable or AI-navigable, or when another skill needs this vocabulary or the ownership check.
---

A prompt or brief naming this skill is its invocation.

# Codebase Design

Design **deep modules**: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface. Use this language and these principles wherever code is being designed or restructured. The aim is leverage for callers, locality for maintainers, and testability for everyone.

## Glossary

Use these terms exactly: don't substitute "component," "service," "API," or "boundary." Consistent language is the whole point.

**Module**: anything with an interface and an implementation. Deliberately scale-agnostic: a function, class, package, or tier-spanning slice. _Avoid_: unit, component, service.

**Interface**: everything a caller must know to use the module correctly: the type signature, but also invariants, ordering constraints, error modes, required configuration, and performance characteristics. _Avoid_: API, signature (too narrow, they refer only to the type-level surface).

**Implementation**: what's inside a module, its body of code. Distinct from **Adapter**: a thing can be a small adapter with a large implementation (a Postgres repo) or a large adapter with a small implementation (an in-memory fake). Reach for "adapter" when the seam is the topic; "implementation" otherwise.

**Depth**: leverage at the interface. The amount of behaviour a caller (or test) can exercise per unit of interface they have to learn. A module is **deep** when a large amount of behaviour sits behind a small interface, **shallow** when the interface is nearly as complex as the implementation.

**Seam** _(Michael Feathers)_: a place where you can alter behaviour without editing in that place; the *location* at which a module's interface lives. Where to put the seam is its own design decision, distinct from what goes behind it. _Avoid_: boundary (overloaded with DDD's bounded context).

**Adapter**: a concrete thing that satisfies an interface at a seam. Describes *role* (what slot it fills), not substance (what's inside).

**Leverage**: what callers get from depth. More capability per unit of interface they learn. One implementation pays back across N call sites and M tests.

**Locality**: what maintainers get from depth. Change, bugs, knowledge, and verification concentrate in one place rather than spreading across callers. Fix once, fixed everywhere.

## Deep vs shallow

**Deep module** = small interface + lots of implementation:

```
┌─────────────────────┐
│   Small Interface   │  ← Few methods, simple params
├─────────────────────┤
│                     │
│  Deep Implementation│  ← Complex logic hidden
│                     │
└─────────────────────┘
```

**Shallow module** = large interface + little implementation (avoid):

```
┌─────────────────────────────────┐
│       Large Interface           │  ← Many methods, complex params
├─────────────────────────────────┤
│  Thin Implementation            │  ← Just passes through
└─────────────────────────────────┘
```

When designing an interface, ask:

- Can I reduce the number of methods?
- Can I simplify the parameters?
- Can I hide more complexity inside?

## Principles

- **Depth is a property of the interface, not the implementation.** A deep module can be internally composed of small, mockable, swappable parts; they just aren't part of the interface. A module can have **internal seams** (private to its implementation, used by its own tests) as well as the **external seam** at its interface.
- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.** Callers and tests cross the same seam. If you want to test *past* the interface, the module is probably the wrong shape.
- **One adapter means a hypothetical seam. Two adapters means a real one.** Don't introduce a seam unless something actually varies across it.

## Ownership check

Use the project's **Value owner**, **Ownership check** and **Deferred seam**
vocabulary from `GLOSSARY.md`, when present. Check for these triggers:

- **Trigger 1:** modifying or forking vendored or third-party code.
- **Trigger 2:** adding a configuration kind or a new place a value lives.
- **Trigger 3:** adding a second or third variant.
- **Trigger 4:** crossing a repository, product or host boundary, or making them
  release in lockstep.
- **Trigger 5:** placing a file where the standard layout would not lead an agent.

Without a trigger, the whole check is one line: `No trigger`.
When triggered, record the triggers and, for each value:

- its **Value owner**: standard, repository, host or issue, holding the value
  in its own file (a per-issue choice is an issue label);
- current and likely consumers;
- reversibility;
- cost now and carrying cost, each **S/M/L**.

Apply these defaults to the read:

- **Reversible, one consumer:** choose the cheapest path; record the seam as
  deferred.
- **Hard to reverse or a second consumer:** wrap.
- **Third consumer or a seam crossing repositories:** propose extraction in
  its own ticket for the owner to decide. Extraction covers code and
  configuration; copied decision text is exempt.

The author may choose the nicer design immediately when they argue cost now
**S** and lower carrying cost, and the brief or code reviewer accepts that
argument. This is a design judgment, not another review gate.

### Deferred seams and touched code

Record a **Deferred seam** in one line at its code location, for example:

```text
Seam (deferred): <what varies>; consumers: <n>; extract at 3.
```

Update the note when a consumer is added. Use an ADR only when the deferral
itself is a one-way door. **Considered options:** an ordinary note belongs at
its code so the next change finds and updates it; an ADR would turn a
reversible implementation choice into a durable decision, and a separate
seam register would drift away from the code. A friction log holds evidence,
never the seam register.

For existing ownership problems in touched code, take the first applicable
route:

1. Fix in place only when cost is **S**, in files already edited,
   behavior preserving, and listed on its own line in the PR body.
2. Otherwise, note a seam the change does not need yet, or update its consumer
   count when adding a consumer; the third prompts the extraction proposal.
3. Otherwise, use the contribution guide's **Findings** route.

This permission covers that cleanup, not separate unticketed work or an
expansion of factory-run authority. Reviewers check whether touched problems
were fixed, noted or filed, and judge the implementation against its contract.

### Disagreeing with a recorded contract

For a **one-way door** the agent judges wrong, stop through the contribution
guide's existing owner-question route (`state:grill`), with the trigger and
cost read. For a **two-way door**, implement the contract and record the
deferred seam or finding. Never silently deviate, or silently comply with a
one-way door judged wrong. Follow the guide's question and Findings routes;
when the guide is absent, report the question and stop for a one-way door,
or report the finding with the handoff for a two-way door.

### Worked examples

**Capability and policy.** In the
[Scriptorium model-choice split](https://github.com/lutzseverino/scriptorium/issues/115#issuecomment-6693419305),
a repository preference had migrated between host configuration and an exact
standard file. Trigger 2 and Trigger 4 prompt a read: the host owns reachable models,
credentials and per-kind defaults in host configuration; the repository owns
its optional model preferences and unavailable-model fallback in its policy
file; the standard owns the schema and check, never those policy values; the
issue owns its model-label choice. Current consumers are the factory's
triage, implement/retry and review runs; other repositories are likely
consumers. Relocating repository values after adoption is hard to reverse:
this example rates cost now **M**, carrying cost **L** if values stay misplaced,
and **S** after the split. Wrap the resolution behind an interface that reads
issue choice, then repository policy, then host default, within host
capabilities. Without the optional policy file, use host defaults. A seam
shared across repositories prompts a separate extraction proposal for the
owner; it does not authorize implementing that extraction here.

**Vendored UI.** A product needs one variation of a third-party button. Trigger 1
prompts the read: upstream owns the copied implementation, the repository owns
its presentation choice in its wrapper file, and the standard owns no product
styling value. There is one current screen consumer and a second likely one;
a local wrapper is reversible. This example rates a source edit cost now
**S**, carrying cost **M** across upstream updates; a small wrapper costs **S**
now and **S** to carry. Choose the wrapper immediately when the brief or
reviewer accepts that lower carrying cost, rather than editing vendored
source. Defer a shared wrapper package at the wrapper's code location with
one consumer; update the count for a second, and propose extraction in its
own ticket for a third or a cross-repository consumer.

## Designing for testability

Good interfaces make testing natural:

1. **Accept dependencies, don't create them.**

   ```typescript
   // Testable
   function processOrder(order, paymentGateway) {}

   // Hard to test
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **Return results, don't produce side effects.**

   ```typescript
   // Testable
   function calculateDiscount(cart): Discount {}

   // Hard to test
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. **Small surface area.** Fewer methods = fewer tests needed. Fewer params = simpler test setup.

## Relationships

- A **Module** has exactly one **Interface** (the surface it presents to callers and tests).
- **Depth** is a property of a **Module**, measured against its **Interface**.
- A **Seam** is where a **Module**'s **Interface** lives.
- An **Adapter** sits at a **Seam** and satisfies the **Interface**.
- **Depth** produces **Leverage** for callers and **Locality** for maintainers.

## Rejected framings

- **Depth as ratio of implementation-lines to interface-lines** (Ousterhout): rewards padding the implementation. We use depth-as-leverage instead.
- **"Interface" as the TypeScript `interface` keyword or a class's public methods**: too narrow: interface here includes every fact a caller must know.
- **"Boundary"**: overloaded with DDD's bounded context. Say **seam** or **interface**.

## Going deeper

- **Deepening a cluster given its dependencies**, see [DEEPENING.md](DEEPENING.md): dependency categories, seam discipline, and replace-don't-layer testing.
- **Exploring alternative interfaces**, see [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md): spin up parallel sub-agents to design the interface several radically different ways, then compare on depth, locality, and seam placement.

## Reads

Paths are relative to the repository root.

- `GLOSSARY.md`: the project's domain language for ownership and Design It
  Twice. When it is missing, use this skill's vocabulary.
- `CONTRIBUTING.md`: Findings and owner-question routes. When it is missing,
  use the ownership section's question and finding handoff above.
