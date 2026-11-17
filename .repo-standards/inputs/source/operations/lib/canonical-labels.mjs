// Each label may name the labels it replaces: `formerly` holds a former name
// with the values Repo Canon or GitHub gave it. A repository lacking the label
// but carrying a former name gets that label renamed in place, so its issues
// keep it. A label still at a former name's values was never chosen by the
// repository, so the fix updates it without confirmation.
// https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels#about-default-labels
export const canonicalLabels = [
  {
    name: "state:triage",
    color: "fbca04",
    description: "Waits on triage to review it, or review it again",
    formerly: [
      {
        name: "needs-triage",
        color: "fbca04",
        description: "Requires review or renewed review",
      },
    ],
  },
  {
    name: "state:reporter",
    color: "d4c5f9",
    description: "Waits on its outside reporter for a fact only they hold",
  },
  {
    name: "state:grill",
    color: "d876e3",
    description: "Waits on a grilling session for the owner's intent",
  },
  {
    name: "state:owner",
    color: "1d76db",
    description: "Waits on the owner's answer or work only the owner can do",
    formerly: [
      {
        name: "ready-for-human",
        color: "1d76db",
        description:
          "Reviewed; needs the owner's accounts, credentials or a reserved taste call",
      },
    ],
  },
  {
    name: "state:ready",
    color: "0e8a16",
    description: "Reviewed; waits on an agent to implement it",
    formerly: [
      {
        name: "ready-for-agent",
        color: "0e8a16",
        description:
          "Reviewed and sufficiently specified for agent implementation",
      },
    ],
  },
  {
    name: "type:bug",
    color: "d73a4a",
    description: "Something isn't working",
    formerly: [
      { name: "bug", color: "d73a4a", description: "Something isn't working" },
    ],
  },
  {
    name: "type:enhancement",
    color: "a2eeef",
    description: "New feature or request",
    formerly: [
      {
        name: "enhancement",
        color: "a2eeef",
        description: "New feature or request",
      },
    ],
  },
  {
    name: "priority:high",
    color: "d93f0b",
    description: "Picked up before normal and low priority work",
  },
  {
    name: "priority:normal",
    color: "bfdadc",
    description: "Picked up in the usual order; no priority label means this",
  },
  {
    name: "priority:low",
    color: "c2e0c6",
    description: "Picked up after high and normal priority work",
  },
  {
    name: "wontfix",
    color: "ffffff",
    description: "Will not be actioned",
    formerly: [
      {
        name: "wontfix",
        color: "ffffff",
        description: "This will not be worked on",
      },
    ],
  },
  {
    name: "wayfinder:map",
    color: "5319e7",
    description: "Planning map for related work",
  },
  {
    name: "wayfinder:research",
    color: "bfd4f2",
    description: "Research question in a planning map",
  },
  {
    name: "wayfinder:prototype",
    color: "bfd4f2",
    description: "Prototype question in a planning map",
  },
  {
    name: "wayfinder:grilling",
    color: "bfd4f2",
    description: "Design decision requiring discussion",
  },
  {
    name: "wayfinder:task",
    color: "bfd4f2",
    description: "Task in a planning map",
  },
];

// Standard-owned names shared by setup and stored issue-contract results.
// Unknown names pass through; callers decide which canonical labels qualify.
export function canonicalLabelName(name) {
  return (
    canonicalLabels.find(
      (label) =>
        label.name === name ||
        label.formerly?.some((former) => former.name === name),
    )?.name ?? name
  );
}
