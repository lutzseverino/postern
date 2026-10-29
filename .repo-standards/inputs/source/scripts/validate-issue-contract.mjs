#!/usr/bin/env node

import { setTimeout as wait } from "node:timers/promises";
import { createHash } from "node:crypto";
import { PlatformError } from "../vendor/postern/postern.mjs";
import { lexer } from "../vendor/marked/marked.esm.js";
import {
  interpretMarkdown,
  markdownInlineText,
  markdownTokenSpans,
} from "../operations/lib/rendered-markdown.mjs";

// How the validator identifies an issue's contract kind and the parent its
// `Parent` section names, with the issue Markdown parsing they rest on.
const categoryLabels = new Set(["bug", "enhancement"]);
const wayfinderChildLabels = new Set([
  "wayfinder:research",
  "wayfinder:prototype",
  "wayfinder:grilling",
  "wayfinder:task",
]);
const issueNonRenderedElements = ["head", "title"];
const contractSectionNames = new Set([
  "acceptance criteria",
  "actual behavior",
  "additional context",
  "blocked by",
  "decisions so far",
  "destination",
  "desired outcome",
  "environment",
  "expected behavior",
  "further notes",
  "implementation decisions",
  "not yet specified",
  "notes",
  "out of scope",
  "parent",
  "problem",
  "problem statement",
  "proposed approach",
  "question",
  "solution",
  "steps to reproduce",
  "testing decisions",
  "user stories",
  "what to build",
]);

// Whether an issue's contract is a directly authored specification: it carries
// no Wayfinder or triage category label, and its body's recognized contract
// headings identify a specification. Labels are names or GitHub label objects.
function isSpecification({ labels, body }) {
  const names = (labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
  return (
    !names.some(
      (name) => name === "wayfinder:map" || wayfinderChildLabels.has(name),
    ) &&
    !names.some((name) => categoryLabels.has(name)) &&
    identifyContract(parseSections(body ?? "")) === "specification"
  );
}

function identifyContract(sections) {
  const headings = new Map([
    ["problem statement", "specification"],
    ["solution", "specification"],
    ["user stories", "specification"],
    ["what to build", "implementation ticket"],
    ["blocked by", "implementation ticket"],
    ["steps to reproduce", "bug report"],
    ["expected behavior", "bug report"],
    ["actual behavior", "bug report"],
    ["problem", "feature request"],
    ["desired outcome", "feature request"],
  ]);
  for (const heading of sections.keys()) {
    if (headings.has(heading)) return headings.get(heading);
  }
  return null;
}

function parseSections(markdown, acceptedNames = contractSectionNames) {
  markdown = normalizeMarkdown(markdown);
  const occurrences = issueMarkdown(markdown).sections(acceptedNames, {
    hierarchy: "outermost",
    nameSource: "markdown",
  });
  const sections = new Map();
  for (const [name, matches] of occurrences) {
    sections.set(name, matches.at(-1).source);
  }
  return sections;
}

function issueMarkdown(markdown) {
  return interpretMarkdown(markdown, {
    additionalNonRenderedElements: issueNonRenderedElements,
  });
}

function normalizeMarkdown(value) {
  return value.replace(/\r\n?/g, "\n");
}

const feedbackMarker = "<!-- repo-canon:issue-contract-feedback -->";
const feedbackStatePrefix = "<!-- repo-canon:issue-contract-state ";
const needsAttentionHeading = "## Issue contract needs attention";
const readyLabels = new Set(["ready-for-agent", "ready-for-human"]);
const workflowLabels = new Set([
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
]);
const missingLabelEventError =
  "The authoritative issue timeline does not contain the current readiness label event.";
const agentBriefHeadingNames = new Set(["agent brief"]);
const contractFields = new Map([
  [
    "bug report",
    new Set([
      "steps to reproduce",
      "expected behavior",
      "actual behavior",
      "environment",
      "additional context",
    ]),
  ],
  [
    "feature request",
    new Set([
      "problem",
      "desired outcome",
      "proposed approach",
      "additional context",
    ]),
  ],
  [
    "specification",
    new Set([
      "problem statement",
      "solution",
      "user stories",
      "implementation decisions",
      "testing decisions",
      "out of scope",
      "further notes",
    ]),
  ],
  [
    "implementation ticket",
    new Set(["parent", "what to build", "acceptance criteria", "blocked by"]),
  ],
]);
const wayfinderMapFields = new Set([
  "destination",
  "notes",
  "decisions so far",
  "not yet specified",
  "out of scope",
]);
const wayfinderChildFields = new Set(["parent", "question"]);

// The decision reads one snapshot, which the adapter below fetches in full
// before deciding:
// - `repository`: the `owner/name` that `#123` references resolve against;
// - `event`: Postern neutral IssueEvent facts;
// - `issue`, `comments`: the re-fetched issue and its complete discussion,
//   which also holds the previous feedback comment;
// - `blockedBy`, `parent`: the port relationships and the resolved parent;
// - `bodyRevision`: the direct body's `{ id, lastEditedAt }` edit revision;
// - `issueEvents`: the complete authoritative issue-event timeline;
// - `permissions`: each looked-up login's repository `{ role }`, `null` when
//   GitHub reports none, with an `error` when the lookup failed.
// The timeline is read whenever the issue uses workflow state, permissions only
// for a structurally complete contract, and `bodyRevision` only for a
// direct-body contract. Permissions cover every actor on a readiness-label
// event, the recorded reviewer, and an opening sender.

// Decides one issue from its snapshot without network or file access. The
// decision reads the issue's current state; the triggering event supplies only
// what that state cannot show: a deleted Agent Brief, the creation review's
// facts (the labels the issue was opened with, and whether a `labeled` run's
// sender is the opener), and a readiness label the timeline has not recorded.
// Returns the labels to remove and add, the feedback comment write (`null` for
// none, a `null` `commentId` to create it), and the exit code with its message.
export function decideIssueContract(snapshot) {
  if (snapshot.issue.state === "closed") {
    const needsTriage = (snapshot.issue.labels ?? []).some(
      (label) => labelName(label) === "needs-triage",
    );
    return issueDecision({
      exitCode: 0,
      message: needsTriage
        ? "Skipped closed issue validation; removed needs-triage."
        : "Skipped closed issue; issue contract validation handles open issues only.",
      removeLabels: needsTriage ? ["needs-triage"] : [],
    });
  }

  const { comments } = snapshot;
  const result = assessStructure(snapshot);
  const previousFeedback = findFeedback(comments);
  const timeline = result.usesWorkflowState ? issueTimeline(snapshot) : null;
  const stateWrites = (kept = null) =>
    timeline
      ? settledStates(result.labels, timeline, kept)
      : { removeLabels: readinessLabels(result.labels), addLabels: [] };

  if (!result.valid) {
    return issueDecision({
      exitCode: 1,
      message: result.errors.join("\n"),
      ...stateWrites(),
      feedback: feedbackChange(
        comments,
        invalidFeedback(result.errors, previousFeedback),
      ),
    });
  }

  if (!result.contract) {
    return issueDecision({
      exitCode: 0,
      message: `Valid ${result.kind}.`,
      ...stateWrites(),
      feedback: previousFeedback?.body.includes(needsAttentionHeading)
        ? feedbackChange(
            comments,
            resolvedFeedback(result.kind, previousFeedback),
          )
        : null,
    });
  }

  const contract = contractRevision(snapshot, result);
  const revision = contract.revision;
  const readiness = assessReadiness({
    snapshot,
    result,
    timeline,
    previousFeedback,
    revision,
    openingEligible: contract.openingEligible,
  });
  if (!readiness.valid) {
    return issueDecision({
      exitCode: 1,
      message: readiness.error,
      ...stateWrites(),
      feedback: feedbackChange(
        comments,
        awaitingReviewFeedback(
          result.kind,
          revision,
          readiness.observedEventId,
          readiness.sourceInvalidation,
          {
            reason: readiness.error,
            rejectedCreationLabel: readiness.rejectedCreationLabel,
          },
        ),
      ),
    });
  }

  const supersedingStates = readiness.approved
    ? stateAppliedAfterReview(result.labels, readiness.reviewEventId, timeline)
    : [];
  if (supersedingStates.length > 0) {
    const superseding = supersedingStates
      .map((label) => `\`${label}\``)
      .join(" and ");
    return issueDecision({
      exitCode: 0,
      message: `Valid ${result.kind}; ${superseding} superseded ${readiness.label}.`,
      ...stateWrites(supersedingStates),
      feedback: feedbackChange(
        comments,
        awaitingReviewFeedback(
          result.kind,
          revision,
          readiness.observedEventId,
          readiness.sourceInvalidation,
          {
            reason:
              supersedingStates.length === 1
                ? `${superseding} was applied after the review and supersedes its readiness.`
                : `${superseding} were applied after the review and supersede its readiness.`,
          },
        ),
      ),
    });
  }

  return issueDecision({
    exitCode: 0,
    message: `Valid ${result.kind}${readiness.approved ? ` with ${readiness.label} bound to ${revision}` : "; awaiting authorized review"}.`,
    ...stateWrites(readiness.approved ? [readiness.label] : null),
    feedback: feedbackChange(
      comments,
      readiness.approved
        ? approvedFeedback(
            result.kind,
            revision,
            readiness.label,
            readiness.reviewer,
            readiness.reviewEventId,
            readiness.sourceInvalidation,
          )
        : awaitingReviewFeedback(
            result.kind,
            revision,
            readiness.observedEventId,
            readiness.sourceInvalidation,
            {
              reason: readiness.rejectionReason,
              rejectedCreationLabel: readiness.rejectedCreationLabel,
            },
          ),
    ),
  });
}

// Whether the snapshot's run is a human readiness trigger the timeline has not
// recorded yet: a `labeled` event for a readiness label by a sender other than
// `github-actions[bot]`, checked against the readiness label its re-fetched
// issue carries, its own when present and otherwise the other, while that
// label's latest recorded application, by anyone, is not the sender's or a
// removal is the label's latest recorded change. While the latest feedback
// awaits review, that application must also follow its observed event: the run
// that wrote it already observed every one at or before it. A trigger whose
// issue carries no readiness label awaits no timeline application. The adapter
// re-reads the timeline while this holds, within its bound, and the decision
// fails closed while it does.
export function readinessTriggerUnrecorded(snapshot) {
  const { event, issue, comments } = snapshot;
  const trigger = readinessTransitionLabel(event);
  const sender = event.actor?.login;
  if (
    event.kind !== "labeled" ||
    !trigger ||
    !sender ||
    sender === "github-actions[bot]"
  ) {
    return false;
  }
  const carried = readinessLabels((issue.labels ?? []).map(labelName));
  const label = carried.includes(trigger) ? trigger : carried[0];
  if (!label) return false;
  const recorded = feedbackState(findFeedback(comments)?.body);
  const barrier =
    recorded?.status === "awaiting-review" ? recorded.observedEventId : null;
  return !issueTimeline(snapshot).recordsApplication(label, sender, barrier);
}

function issueDecision({
  exitCode,
  message,
  removeLabels = [],
  addLabels = [],
  feedback = null,
}) {
  return { exitCode, message, removeLabels, addLabels, feedback };
}

// Validates the structure against the authoritative labels. The number of
// workflow states is not structure: the decision settles it. A `wontfix` that
// a later state replaces does not make the issue a `wontfix` outcome; without a
// timeline yet, as when the adapter first reads the issue, it does.
function assessStructure(snapshot) {
  const { issue, comments } = snapshot;
  const relationships = resolveRelationships(snapshot);
  const timeline = Array.isArray(snapshot.issueEvents)
    ? issueTimeline(snapshot)
    : null;
  const states = (issue.labels ?? [])
    .map(labelName)
    .filter((label) => workflowLabels.has(label) && !readyLabels.has(label));
  return validate({
    issue,
    wontfixSettled:
      !timeline || timeline.latestApplied(states).includes("wontfix"),
    comments,
    blockedBy: relationships.blockedBy,
    parent: relationships.parent,
    relationshipErrors: relationships.errors,
  });
}

function readinessTransitionLabel(event) {
  return readyLabels.has(event.label) ? event.label : null;
}

// What the decision reads beyond the issue and its discussion: the timeline
// whenever the issue uses workflow state, and, for a structurally complete
// contract, that contract's revision and reviewer permissions.
function snapshotNeeds(snapshot) {
  const result = assessStructure(snapshot);
  return {
    contract: result.valid && result.contract ? result.contract : null,
    timeline: result.usesWorkflowState,
  };
}

// Relationships are supplied by the port. GitHub's native capabilities make
// named body sections content requirements rather than relationship fallbacks.
function resolveRelationships(snapshot) {
  return { parent: snapshot.parent, blockedBy: snapshot.blockedBy, errors: [] };
}

function markdownVisibleText(markdown) {
  return issueMarkdown(markdown).content.text().text;
}

function validate({
  issue,
  wontfixSettled,
  comments,
  blockedBy,
  parent,
  relationshipErrors,
}) {
  const labels = new Set((issue.labels ?? []).map(labelName));
  const body = issue.body ?? "";
  let sections = parseSections(body);
  const errors = [];

  if (labels.has("wayfinder:map")) {
    sections = parseSections(body, wayfinderMapFields);
    validateWayfinderMap(sections, labels, errors);
    return outcome("Wayfinder map", errors, labels, false);
  }

  const wayfinderChildren = [...labels].filter((label) =>
    wayfinderChildLabels.has(label),
  );
  if (wayfinderChildren.length > 0) {
    sections = parseSections(body, wayfinderChildFields);
    errors.push(...relationshipErrors);
    validateWayfinderChild(sections, labels, wayfinderChildren, parent, errors);
    return outcome("Wayfinder child", errors, labels, false);
  }

  const brief = latestAgentBrief(comments);
  const hasTriageCategory = [...labels].some((label) =>
    categoryLabels.has(label),
  );
  // A readiness label beside `wontfix` is decided against the Agent Brief, so
  // the timeline settles which of the two states stays.
  if (
    hasTriageCategory &&
    labels.has("wontfix") &&
    wontfixSettled &&
    !(brief && readinessLabels(labels).length > 0)
  ) {
    validateTriagedLabels(labels, null, errors);
    requireAgentBriefForReadiness(labels, errors);
    return outcome("triaged wontfix request", errors, labels, true);
  }
  if (brief && hasTriageCategory) {
    validateTriagedLabels(labels, null, errors);
    validateAgentBrief(brief.body, labels, errors);
    return outcome("triaged Agent Brief", errors, labels, true, {
      type: "comment",
      comment: brief,
      body: brief.body ?? "",
    });
  }

  const contractKind = identifyContract(sections);
  sections = parseSections(body, contractFields.get(contractKind));
  if (isSpecification(issue)) {
    requireSections(
      sections,
      ["Problem Statement", "Solution", "User Stories", "Out of Scope"],
      errors,
    );
    for (const name of [
      "Implementation Decisions",
      "Testing Decisions",
      "Further Notes",
    ]) {
      requireSection(sections, name, errors, { allowEmpty: true });
    }
    return outcome("specification", errors, labels, true, {
      type: "issue-body",
      body,
    });
  }

  if (!hasTriageCategory && contractKind === "implementation ticket") {
    errors.push(...relationshipErrors);
    requireSections(sections, ["What to build", "Acceptance criteria"], errors);
    requireSection(sections, "Blocked by", errors, {
      allowExternalValue: blockedBy.length > 0,
    });
    return outcome("implementation ticket", errors, labels, true, {
      type: "issue-body",
      body,
    });
  }

  if (brief) {
    validateTriagedLabels(labels, null, errors);
    validateAgentBrief(brief.body, labels, errors);
    return outcome("triaged Agent Brief", errors, labels, true, {
      type: "comment",
      comment: brief,
      body: brief.body ?? "",
    });
  }

  if (contractKind === "bug report") {
    requireSections(
      sections,
      ["Steps to reproduce", "Expected behavior", "Actual behavior"],
      errors,
    );
    validateTriagedLabels(labels, "bug", errors);
    requireAgentBriefForReadiness(labels, errors);
    return outcome("bug report", errors, labels, true);
  }

  if (contractKind === "feature request") {
    requireSections(sections, ["Problem", "Desired outcome"], errors);
    validateTriagedLabels(labels, "enhancement", errors);
    requireAgentBriefForReadiness(labels, errors);
    return outcome("feature request", errors, labels, true);
  }

  if (hasTriageCategory) {
    validateTriagedLabels(labels, null, errors);
    errors.push(
      "Add an Agent Brief for this category-labeled triaged request, or use the matching public bug or feature form.",
    );
    return outcome("triaged request", errors, labels, true);
  }

  errors.push(
    "Use one supported issue contract: a public form, native specification or ticket, triaged Agent Brief, Wayfinder map, or labeled Wayfinder child.",
  );
  return outcome("issue contract", errors, labels, true);
}

// Triaged requests, direct specifications and tickets, and unrecognized issues
// that lose readiness carry one workflow state; Wayfinder issues never gain one.
function outcome(kind, errors, labels, usesWorkflowState, contract = null) {
  return {
    valid: errors.length === 0,
    kind,
    errors: [...new Set(errors)],
    labels,
    usesWorkflowState,
    contract,
  };
}

function findMarkdownHeadings(markdown, acceptedNames = null) {
  markdown = normalizeMarkdown(markdown);
  return issueMarkdown(markdown).markdownHeadings.filter(
    ({ name }) => !acceptedNames || acceptedNames.has(normalize(name)),
  );
}

function briefFieldMatches(markdown) {
  markdown = normalizeMarkdown(markdown);
  const matches = [];
  for (const { token, index } of markdownTokenSpans(markdown)) {
    if (token.type !== "paragraph") continue;
    let cursor = index;
    let lineStart = true;
    for (const inlineToken of token.tokens ?? []) {
      const inlineIndex = markdown.indexOf(inlineToken.raw, cursor);
      if (inlineIndex === -1)
        throw new Error(
          `Could not locate parsed inline Markdown token after offset ${cursor}.`,
        );
      cursor = inlineIndex + inlineToken.raw.length;
      const fieldName =
        inlineToken.type === "strong" && lineStart
          ? markdownInlineText(inlineToken.tokens).match(/^([^:\n]+):$/)?.[1]
          : null;
      if (fieldName)
        matches.push({
          index: inlineIndex,
          length: inlineToken.raw.length,
          name: fieldName,
        });
      lineStart = inlineToken.raw.endsWith("\n");
    }
  }
  return matches;
}

function normalize(value) {
  return value
    .replace(/[*_`]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .toLowerCase();
}

function requireSections(sections, names, errors) {
  for (const name of names) requireSection(sections, name, errors);
}

function requireSection(
  sections,
  name,
  errors,
  { allowEmpty = false, allowExternalValue = false } = {},
) {
  const key = normalize(name);
  if (!sections.has(key)) {
    errors.push(`Add the \`${name}\` section.`);
    return;
  }
  if (!allowEmpty && !allowExternalValue && isPlaceholder(sections.get(key))) {
    errors.push(
      `Replace the placeholder under \`${name}\` with the required information.`,
    );
  }
}

function isPlaceholder(value) {
  const withoutEmptyTasks = value.replace(/^\s*[-+*]\s*\[[ xX]\]\s*$/gm, "");
  const visibleText = markdownVisibleText(withoutEmptyTasks).trim();
  if (!visibleText) return true;
  return /^(?:no response|tbd|todo|\[(?:your |add |describe |enter )?[^\]]+\])\.?$/i.test(
    visibleText,
  );
}

function validateWayfinderMap(sections, labels, errors) {
  rejectPlanningReadiness(labels, errors);
  if ([...labels].some((label) => wayfinderChildLabels.has(label))) {
    errors.push("Keep `wayfinder:map` separate from Wayfinder child labels.");
  }
  requireSections(
    sections,
    ["Destination", "Notes", "Not yet specified", "Out of scope"],
    errors,
  );
  requireSection(sections, "Decisions so far", errors, { allowEmpty: true });
}

function validateWayfinderChild(
  sections,
  labels,
  childLabelList,
  parent,
  errors,
) {
  rejectPlanningReadiness(labels, errors);
  if (childLabelList.length !== 1 || labels.has("wayfinder:map")) {
    errors.push(
      "Apply exactly one Wayfinder child label and do not combine it with `wayfinder:map`.",
    );
  }
  requireSection(sections, "Question", errors);
  if (!parent) {
    errors.push(
      "Link the Wayfinder child to its parent map using the native parent relationship.",
    );
  } else if (
    !(parent.labels ?? []).some((label) => labelName(label) === "wayfinder:map")
  ) {
    errors.push(
      "Link the Wayfinder child to an issue labeled `wayfinder:map`.",
    );
  }
}

function rejectPlanningReadiness(labels, errors) {
  if ([...labels].some((label) => readyLabels.has(label))) {
    errors.push(
      "Remove readiness labels from Wayfinder planning issues; their eligibility uses open state, assignment, and blockers.",
    );
  }
}

function labelName(label) {
  return typeof label === "string" ? label : label.name;
}

function validateTriagedLabels(labels, expectedCategory, errors) {
  const categories = [...labels].filter((label) => categoryLabels.has(label));
  if (categories.length !== 1)
    errors.push("Apply exactly one category label: `bug` or `enhancement`.");
  if (
    expectedCategory &&
    (categories.length !== 1 || categories[0] !== expectedCategory)
  ) {
    errors.push(
      `Use the \`${expectedCategory}\` category for this issue form.`,
    );
  }
}

function requireAgentBriefForReadiness(labels, errors) {
  if ([...labels].some((label) => readyLabels.has(label))) {
    errors.push(
      "Add a reviewed Agent Brief before applying a readiness label to a triaged request.",
    );
  }
}

// The one definition of the newest Agent Brief: the Brief comment with the
// highest comment ID. Comments have no timeline position, and their IDs
// increase in creation order. Both the contract lookup and the deleted-Brief
// check use it.
function latestAgentBrief(comments) {
  let latest = null;
  for (const comment of comments) {
    if (
      agentBriefHeading(comment.body ?? "") &&
      (!latest || BigInt(comment.id) > BigInt(latest.id))
    )
      latest = comment;
  }
  return latest;
}

function validateAgentBrief(body, labels, errors) {
  body = normalizeMarkdown(body);
  const heading = agentBriefHeading(body);
  const preamble = agentBriefPreamble(body.slice(0, heading.index));
  if (preamble === "notes-before-brief") {
    errors.push(
      "Put the `## Agent Brief` heading directly after the triage disclaimer and move other notes below the brief.",
    );
  } else if (preamble !== "disclaimer-only") {
    errors.push(
      "Start the Agent Brief comment with `> *This was generated by AI during triage.*`.",
    );
  }
  const fields = parseBriefFields(markdownSection(body, heading));
  for (const name of [
    "Category",
    "Summary",
    "Current behavior",
    "Desired behavior",
    "Key interfaces",
    "Acceptance criteria",
    "Out of scope",
  ]) {
    if (
      !fields.has(normalize(name)) ||
      isPlaceholder(fields.get(normalize(name)))
    ) {
      errors.push(`Complete the Agent Brief \`${name}\` field.`);
    }
  }
  const category = normalize(fields.get("category") ?? "");
  if (category && !categoryLabels.has(category))
    errors.push("Set the Agent Brief `Category` to `bug` or `enhancement`.");
  if (category && !labels.has(category))
    errors.push(`Apply the Agent Brief's \`${category}\` category label.`);
}

function markdownSection(markdown, heading) {
  markdown = normalizeMarkdown(markdown);
  const end =
    findMarkdownHeadings(markdown).find(
      (candidate) =>
        candidate.index > heading.index && candidate.level <= heading.level,
    )?.index ?? markdown.length;
  return markdown.slice(heading.index + heading.length, end);
}

function parseBriefFields(body) {
  body = normalizeMarkdown(body);
  const matches = briefFieldMatches(body);
  const fields = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index + match.length;
    const end = matches[index + 1]?.index ?? body.length;
    fields.set(normalize(match.name), body.slice(start, end).trim());
  }
  return fields;
}

// The text before the Agent Brief heading: `disclaimer-only` when it is the
// triage disclaimer blockquote alone, `notes-before-brief` when it starts with
// that disclaimer and more content follows, and `missing` otherwise.
function agentBriefPreamble(markdown) {
  const blocks = lexer(markdown).filter((token) => token.type !== "space");
  const quoteBlocks =
    blocks[0]?.type === "blockquote"
      ? (blocks[0].tokens?.filter((token) => token.type !== "space") ?? [])
      : [];
  if (!isTriageDisclaimer(quoteBlocks[0])) return "missing";
  return blocks.length === 1 && quoteBlocks.length === 1
    ? "disclaimer-only"
    : "notes-before-brief";
}

function isTriageDisclaimer(block) {
  const inline = block?.type === "paragraph" ? (block.tokens ?? []) : [];
  return (
    inline.length === 1 &&
    inline[0].type === "em" &&
    markdownInlineText(inline[0].tokens) ===
      "This was generated by AI during triage."
  );
}

function agentBriefHeading(body) {
  return findMarkdownHeadings(body, agentBriefHeadingNames)[0] ?? null;
}

function contractRevision({ bodyRevision }, result) {
  let source;
  let openingEligible = false;
  if (result.contract.type === "issue-body") {
    if (!bodyRevision)
      throw new Error(
        "The snapshot does not include the issue-body revision metadata.",
      );
    source = {
      type: "issue-body",
      id: bodyRevision.id,
      editedAt: bodyRevision.lastEditedAt ?? null,
    };
    openingEligible = bodyRevision.lastEditedAt == null;
  } else {
    const comment = result.contract.comment;
    source = {
      type: "comment",
      id: String(comment.node_id ?? comment.id),
      editedAt: comment.updated_at ?? null,
    };
  }
  const value = JSON.stringify({
    format: "repo-canon/issue-contract-revision/v1",
    kind: result.kind,
    source,
    body: result.contract.body,
  });
  return {
    revision: `sha256:${createHash("sha256").update(value).digest("hex")}`,
    openingEligible,
  };
}

function assessReadiness({
  snapshot,
  result,
  timeline,
  previousFeedback,
  revision,
  openingEligible,
}) {
  const { event: currentEvent, issue, permissions } = snapshot;
  const currentReadyLabels = [...result.labels].filter((label) =>
    readyLabels.has(label),
  );
  const latestEvent = timeline.latestReadinessTransition();
  const observedEvent = timeline.latestObservedTransition();
  const observedEventId =
    observedEvent?.id == null ? null : String(observedEvent.id);
  if (currentReadyLabels.length > 1) {
    return {
      valid: false,
      observedEventId,
      error: "Apply only one readiness label to an implementation contract.",
    };
  }

  const recorded = feedbackState(previousFeedback?.body);
  const deletedBrief = supersedingDeletedBrief(currentEvent, result);
  const sourceInvalidation =
    deletedBrief ?? recorded?.sourceInvalidation ?? null;
  if (deletedBrief && recorded?.sourceInvalidation !== deletedBrief) {
    return {
      valid: false,
      observedEventId,
      sourceInvalidation,
      error:
        "Deleting a newer Agent Brief invalidated the restored contract source. Review the published revision again.",
    };
  }
  // A human readiness trigger the timeline has not recorded yet is never
  // reviewed from the timeline, not even as a recorded approval.
  if (readinessTriggerUnrecorded(snapshot)) {
    return {
      valid: false,
      observedEventId,
      sourceInvalidation,
      error: missingLabelEventError,
    };
  }
  const creationEvent = creationLabelEvent(
    currentEvent,
    issue,
    result,
    currentReadyLabels[0],
    timeline,
    openingEligible,
  );
  const labelEvent =
    creationEvent ??
    (currentReadyLabels.length === 1 &&
    latestEvent?.event === "labeled" &&
    latestEvent.label?.name === currentReadyLabels[0]
      ? latestEvent
      : null);
  if (
    currentReadyLabels.length === 1 &&
    activeApproval(
      permissions,
      recorded,
      revision,
      currentReadyLabels[0],
      timeline,
    )
  ) {
    return {
      valid: true,
      approved: true,
      label: recorded.label,
      reviewer: recorded.reviewer,
      reviewEventId: recorded.reviewEventId,
      observedEventId,
      sourceInvalidation,
    };
  }

  const grant = readinessGrant(
    recorded,
    previousFeedback,
    revision,
    currentReadyLabels,
    labelEvent,
    timeline,
  );
  if (grant.candidate) {
    if (!grant.valid)
      return {
        valid: false,
        error: grant.error,
        observedEventId,
        sourceInvalidation,
      };
    const authority = reviewerAuthority(permissions, grant.reviewer);
    if (!authority.authorized) {
      const error = authority.error
        ? `Could not verify @${grant.reviewer}'s review authority: ${authority.error}`
        : `@${grant.reviewer} is not authorized to grant readiness. Use a repository admin, maintainer, or collaborator with the triage role.`;
      return {
        valid: false,
        observedEventId,
        sourceInvalidation,
        error,
        rejectedCreationLabel:
          !authority.error && creationEvent ? grant.label : null,
      };
    }
    return {
      valid: true,
      approved: true,
      label: grant.label,
      reviewer: grant.reviewer,
      reviewEventId: grant.reviewEventId,
      observedEventId,
      sourceInvalidation,
    };
  }

  if (currentReadyLabels.length === 0) {
    const rejectionReason =
      recorded?.status === "awaiting-review" &&
      recorded.revision === revision &&
      recorded.rejectionReason &&
      timeline.rejectionUnchanged(
        recorded.observedEventId,
        recorded.rejectedCreationLabel,
      )
        ? recorded.rejectionReason
        : null;
    return {
      valid: true,
      approved: false,
      observedEventId,
      sourceInvalidation,
      rejectionReason,
      rejectedCreationLabel: rejectionReason
        ? recorded.rejectedCreationLabel
        : null,
    };
  }

  return {
    valid: false,
    observedEventId,
    sourceInvalidation,
    error:
      "Readiness is not bound to an authorized review of the current contract revision. Remove the stale attempt and review the published revision again.",
  };
}

function readinessGrant(
  recorded,
  previousFeedback,
  revision,
  currentReadyLabels,
  labelEvent,
  timeline,
) {
  if (currentReadyLabels.length !== 1) return { candidate: false };
  const label = currentReadyLabels[0];
  if (!labelEvent || labelEvent.id == null || labelEvent.event !== "labeled") {
    return {
      candidate: true,
      valid: false,
      error: missingLabelEventError,
    };
  }
  const reviewer = labelEvent.actor?.login;
  if (!reviewer)
    return {
      candidate: true,
      valid: false,
      error: "The readiness event does not identify its actor.",
    };
  const reviewEventId = String(labelEvent.id);
  const openingReview = labelEvent.opening === true;
  const followsApprovedRevision =
    recorded?.status === "approved" &&
    recorded.revision === revision &&
    timeline.follows(reviewEventId, recorded.reviewEventId);
  const followsAwaitingRevision =
    recorded?.status === "awaiting-review" &&
    recorded.revision === revision &&
    timeline.noticePrecedes(previousFeedback, labelEvent) &&
    timeline.follows(reviewEventId, recorded.observedEventId);
  const followsRevisionNotice =
    followsApprovedRevision || followsAwaitingRevision;
  if (!openingReview && !followsRevisionNotice) {
    return {
      candidate: true,
      valid: false,
      error:
        "Wait for the validator to publish the exact contract revision before applying readiness, then review that revision and apply the label again.",
    };
  }
  return { candidate: true, valid: true, label, reviewer, reviewEventId };
}

function activeApproval(permissions, recorded, revision, label, timeline) {
  if (
    recorded?.status !== "approved" ||
    recorded.revision !== revision ||
    recorded.label !== label ||
    !recorded.reviewer ||
    !recorded.reviewEventId ||
    !timeline.isCurrentReview(recorded.reviewEventId, label)
  ) {
    return false;
  }
  return reviewerAuthority(permissions, recorded.reviewer).authorized;
}

// The creation snapshot's review of an unedited direct contract, for either the
// `opened` run or a `labeled` run, whichever arrives first. The opening payload
// shows the one readiness label the issue was created with. A `labeled` run has
// no such payload: a readiness trigger reviews from the creation snapshot only
// when its sender is the opener, the issue's author, and the timeline must show
// the opener applying the label in the issue's creation second. Otherwise the run is
// decided as any later review. Either run then checks the opener's role as it
// checks any reviewer's, so an opener without an authorizing role gets the same
// rejection in either order.
function creationLabelEvent(
  currentEvent,
  issue,
  result,
  label,
  timeline,
  openingEligible,
) {
  if (result.contract.type !== "issue-body" || !openingEligible || !label)
    return null;
  if (currentEvent.kind === "labeled") {
    if (
      !issue.user?.login ||
      (readinessTransitionLabel(currentEvent) && !timeline.sentByOpener())
    )
      return null;
    return timeline.creationReview(label, issue.user, {
      openingPayload: false,
    });
  }
  const openingReadyLabels =
    currentEvent.openingLabels
      ?.map(labelName)
      .filter((name) => readyLabels.has(name)) ?? [];
  if (
    currentEvent.kind !== "opened" ||
    openingReadyLabels.length !== 1 ||
    openingReadyLabels[0] !== label
  ) {
    return null;
  }
  return timeline.creationReview(label, currentEvent.actor, {
    openingPayload: true,
  });
}

function openingReviewId(issue) {
  return `opened:${issue.node_id ?? issue.id ?? issue.number}:${issue.created_at ?? "unknown"}`;
}

function supersedingDeletedBrief(currentEvent, result) {
  if (
    currentEvent.kind !== "commentDeleted" ||
    result.contract.type !== "comment" ||
    !agentBriefHeading(currentEvent.comment?.body ?? "")
  ) {
    return null;
  }
  const deleted = currentEvent.comment;
  return latestAgentBrief([result.contract.comment, deleted]) === deleted
    ? `deleted-comment:${deleted.nodeId ?? deleted.id}`
    : null;
}

function reviewerAuthority(permissions, login) {
  const permission =
    permissions && Object.hasOwn(permissions, login)
      ? permissions[login]
      : null;
  if (permission?.error) return { authorized: false, error: permission.error };
  return {
    authorized: ["admin", "maintain", "triage"].includes(permission?.role),
  };
}

// Every login whose repository role a decision can consult: each actor on a
// readiness-label event, the reviewer recorded in the feedback, and the sender
// of an opening event. A `labeled` run reviews from the creation snapshot only
// when the opener is that label event's actor, so the opener's role is read
// whenever it can decide the outcome.
function reviewerLogins({ event, comments, issueEvents }) {
  const logins = new Set();
  for (const candidate of issueEvents) {
    if (isReadinessTransition(candidate) && candidate.actor?.login)
      logins.add(candidate.actor.login);
  }
  const recordedReviewer = feedbackState(
    findFeedback(comments)?.body,
  )?.reviewer;
  if (recordedReviewer) logins.add(recordedReviewer);
  if (event.kind === "opened" && event.actor?.login)
    logins.add(event.actor.login);
  return [...logins];
}

function feedbackState(body) {
  const line = feedbackStateLine(body);
  if (!line) return null;
  try {
    return JSON.parse(line.slice(feedbackStatePrefix.length, -4));
  } catch {
    return null;
  }
}

function feedbackStateLine(body = "") {
  return (
    normalizeMarkdown(body)
      .split("\n")
      .find(
        (candidate) =>
          candidate.startsWith(feedbackStatePrefix) &&
          candidate.endsWith(" -->"),
      ) ?? null
  );
}

function readinessLabels(labels) {
  return [...labels].filter((label) => readyLabels.has(label));
}

// The label writes that leave the issue one workflow state: the `kept` states
// when the decision names them, otherwise the non-readiness state applied
// latest. States the timeline cannot order yet all stay. An issue left with
// none gets `needs-triage`, whether or not it has carried a state before.
function settledStates(labels, timeline, kept = null) {
  const states = [...labels].filter((label) => workflowLabels.has(label));
  const staying =
    kept ??
    timeline.latestApplied(states.filter((label) => !readyLabels.has(label)));
  return {
    removeLabels: states.filter((label) => !staying.includes(label)),
    addLabels: staying.length > 0 ? [] : ["needs-triage"],
  };
}

// The non-readiness states applied after the review, which supersede it: the
// latest such state when there are several.
function stateAppliedAfterReview(labels, reviewEventId, timeline) {
  return timeline.latestApplied(
    [...labels].filter(
      (label) =>
        workflowLabels.has(label) &&
        !readyLabels.has(label) &&
        !timeline.isValidatorFallback(label) &&
        timeline.appliedAfter(label, reviewEventId),
    ),
  );
}

// The validator's own removal of a label, which cleans up a recorded decision.
function isValidatorRemoval(candidate) {
  return (
    candidate.event === "unlabeled" &&
    candidate.actor?.login === "github-actions[bot]"
  );
}

function isReadinessTransition(candidate) {
  return (
    ["labeled", "unlabeled"].includes(candidate.event) &&
    readyLabels.has(candidate.label?.name)
  );
}

// The one owner of every "did A happen after B" question about issue events,
// including which transition is latest and what the creation snapshot holds.
// It follows the one ordering rule: the timeline's order decides when GitHub
// has recorded both events. A carried label whose application it has not
// recorded follows every recorded event only when its latest recorded change
// is a removal or nothing. A label the issue was opened with is the exception.
// Timestamps are used only for what has no timeline position (the feedback
// comment and Agent Brief comments) and to recognize labels applied at creation.
// The creation snapshot (this issue's own `opened:` review ID and the labels it
// was opened with) is at position zero and the Nth event at position N. Agent
// Brief comments are ordered among themselves by comment ID, in
// `latestAgentBrief`.
function issueTimeline({ event, issue, issueEvents }) {
  if (!Array.isArray(issueEvents))
    throw new Error("The snapshot does not include the issue-event timeline.");
  const openingId = openingReviewId(issue);

  function position(eventId) {
    if (eventId == null) return null;
    if (String(eventId) === openingId) return 0;
    const index = issueEvents.findIndex(
      ({ id }) => String(id) === String(eventId),
    );
    return index < 0 ? null : index + 1;
  }

  function lastApplication(label) {
    const index = issueEvents.findLastIndex(
      (candidate) =>
        candidate.event === "labeled" && candidate.label?.name === label,
    );
    return index < 0
      ? null
      : {
          event: issueEvents[index],
          position: index + 1,
          at: issueEvents[index].created_at,
        };
  }

  // Whether a label change carries the issue's creation timestamp, so the
  // label was applied with the issue at its creation.
  function atCreation(time) {
    return Boolean(time) && time === issue.created_at;
  }

  // Whether the run's sender is the issue's opener.
  function sentByOpener() {
    return (
      Boolean(issue.user?.login) && event.actor?.login === issue.user.login
    );
  }

  // Whether a label event is the opener's application of a readiness label
  // in the issue's creation second.
  function isCreationLabel(candidate) {
    return (
      candidate?.event === "labeled" &&
      readyLabels.has(candidate.label?.name) &&
      Boolean(issue.user?.login) &&
      candidate.actor?.login === issue.user.login &&
      atCreation(candidate.created_at)
    );
  }

  // The events after a barrier. No barrier precedes every event, and a
  // barrier the timeline cannot place has none after it: `null`.
  function eventsAfter(barrierEventId) {
    const barrier = barrierEventId == null ? 0 : position(barrierEventId);
    return barrier === null ? null : issueEvents.slice(barrier);
  }

  // Where a carried label was applied, for ordering it against a review: its
  // timeline position, with one applied at the issue's creation at zero.
  function applicationPosition(label) {
    const position = timelinePosition(label);
    return position !== Infinity && atCreation(lastApplication(label)?.at)
      ? 0
      : position;
  }

  // Where a carried label's application stands in the timeline: its position,
  // zero for an unrecorded label the issue was opened with, and after every
  // recorded event for any other label whose latest recorded change is a
  // removal or nothing.
  function timelinePosition(label) {
    if (!latestChangeIsApplication(label))
      return openedWith(label) ? 0 : Infinity;
    return lastApplication(label).position;
  }

  function openedWith(label) {
    return (
      event.kind === "opened" &&
      (event.openingLabels ?? []).some(
        (candidate) => labelName(candidate) === label,
      )
    );
  }

  function latestReadinessTransition() {
    return issueEvents.findLast(isReadinessTransition) ?? null;
  }

  // The latest readiness transition other than the validator's own removal.
  function latestObservedTransition() {
    return (
      issueEvents.findLast(
        (candidate) =>
          isReadinessTransition(candidate) && !isValidatorRemoval(candidate),
      ) ?? null
    );
  }

  // Whether the label's latest recorded change is its application.
  function latestChangeIsApplication(label) {
    const latestChange = issueEvents.findLast(
      (candidate) =>
        ["labeled", "unlabeled"].includes(candidate.event) &&
        candidate.label?.name === label,
    );
    return latestChange?.event === "labeled";
  }

  return {
    latestReadinessTransition,
    latestObservedTransition,

    // Removing readiness is part of the validator's rejection cleanup, not
    // another review attempt. Every other readiness transition replaces it.
    // The creation review recorded which opener's label it rejected, so that
    // label's creation event, first after no barrier, does not replace it.
    rejectionUnchanged(observedEventId, rejectedCreationLabel) {
      const observed = eventsAfter(observedEventId);
      if (observed === null) return false;
      const transitions = observed.filter(isReadinessTransition);
      const first = transitions[0];
      if (
        observedEventId == null &&
        isCreationLabel(first) &&
        first.label?.name === rejectedCreationLabel
      ) {
        transitions.shift();
      }
      return transitions.every(isValidatorRemoval);
    },

    // Whether a review event follows an earlier barrier in the timeline. No
    // barrier precedes every review. This issue's own opening is the only
    // `opened:` barrier, and an event the timeline has not recorded follows
    // no barrier.
    follows(laterEventId, earlierEventId) {
      if (earlierEventId == null) return true;
      const earlier = position(earlierEventId);
      const later = position(laterEventId);
      return earlier !== null && later !== null && later > earlier;
    },

    // Whether the revision notice was updated in a strictly earlier second
    // than the readiness label event.
    noticePrecedes(notice, labelEvent) {
      return Boolean(
        notice?.updated_at &&
        labelEvent.created_at &&
        notice.updated_at < labelEvent.created_at,
      );
    },

    // Whether a recorded review is still the latest readiness transition, or
    // the creation snapshot when the timeline has none.
    isCurrentReview(reviewEventId, label) {
      const latest = latestReadinessTransition();
      if (latest)
        return (
          latest.event === "labeled" &&
          latest.label?.name === label &&
          String(latest.id) === reviewEventId
        );
      return reviewEventId === openingId;
    },

    // The review supplied by the creation snapshot: a readiness transition
    // that is both the first and the latest and applied the same label by the
    // opener. With an opening payload that carries the label, the timeline may
    // not have recorded that transition yet. Without one, the transition must
    // be recorded in the issue's creation second.
    creationReview(label, opener, { openingPayload }) {
      const latest = latestReadinessTransition();
      const first = issueEvents.find(isReadinessTransition) ?? null;
      if (!latest && !openingPayload) return null;
      if (latest && String(first?.id) !== String(latest.id)) return null;
      if (
        latest &&
        (latest.event !== "labeled" ||
          latest.label?.name !== label ||
          latest.actor?.login !== opener?.login)
      ) {
        return null;
      }
      if (!openingPayload && latest.created_at !== issue.created_at)
        return null;
      return {
        id: latest?.id ?? openingId,
        event: "labeled",
        label: { name: label },
        actor: opener,
        opening: true,
      };
    },

    // The validator's fallback only fills a missing state; it never
    // supersedes readiness. A removal followed by an unrecorded application
    // cannot establish the actor, so it still follows the ordering rule.
    isValidatorFallback(label) {
      return (
        label === "needs-triage" &&
        latestChangeIsApplication(label) &&
        lastApplication(label)?.event.actor?.login === "github-actions[bot]"
      );
    },

    // Whether the label's application follows the review, whatever its
    // timestamp.
    appliedAfter(label, reviewEventId) {
      const reviewPosition = position(reviewEventId);
      return (
        reviewPosition !== null && applicationPosition(label) > reviewPosition
      );
    },

    // Whether the label's latest application, by anyone, is the sender's,
    // follows the barrier, and is the label's latest recorded change.
    recordsApplication(label, login, barrierEventId) {
      const application = lastApplication(label)?.event;
      return (
        application?.actor?.login === login &&
        Boolean(eventsAfter(barrierEventId)?.includes(application)) &&
        latestChangeIsApplication(label)
      );
    },

    sentByOpener,

    // The label applied latest, or every label tied for latest when the
    // timeline has recorded none of their applications.
    latestApplied(labels) {
      let latest = [];
      let latestPosition = -1;
      for (const label of labels) {
        const position = timelinePosition(label);
        if (position > latestPosition) {
          latest = [label];
          latestPosition = position;
        } else if (position === latestPosition) latest.push(label);
      }
      return latest;
    },
  };
}

function feedbackChange(comments, body) {
  const existing = findFeedback(comments);
  if (!existing) return { commentId: null, body };
  return existing.body === body ? null : { commentId: existing.id, body };
}

function findFeedback(comments) {
  return [...comments]
    .reverse()
    .find(
      (comment) =>
        comment.body?.includes(feedbackMarker) &&
        comment.user?.login === "github-actions[bot]",
    );
}

// The previous feedback's state line, which structural notices carry forward
// so the recorded review survives them.
function carriedState(previousFeedback) {
  const line = feedbackStateLine(previousFeedback?.body);
  return line ? `${line}\n` : "";
}

function invalidFeedback(errors, previousFeedback) {
  return `${feedbackMarker}\n${carriedState(previousFeedback)}${needsAttentionHeading}\n\n${errors.map((error) => `- ${error}`).join("\n")}\n\nFix the items above. Structural validation will re-run, but only an authorized reviewer can grant readiness.`;
}

function awaitingReviewFeedback(
  kind,
  revision,
  observedEventId = null,
  sourceInvalidation = null,
  { reason = null, rejectedCreationLabel = null } = {},
) {
  const state = JSON.stringify({
    status: "awaiting-review",
    revision,
    label: null,
    reviewer: null,
    observedEventId,
    sourceInvalidation,
    ...(reason
      ? {
          rejectionReason: reason,
          ...(rejectedCreationLabel ? { rejectedCreationLabel } : {}),
        }
      : {}),
  });
  const explanation = reason
    ? `\n\nThe last readiness attempt was rejected: ${reason}`
    : "";
  return `${feedbackMarker}\n${feedbackStatePrefix}${state} -->\n## Issue contract awaiting review\n\nThe ${kind} has the required structure at revision \`${revision}\`.${explanation}\n\nA fresh authorized review is required. A repository admin, maintainer, or explicitly authorized triage-role collaborator must review this exact revision, then apply one readiness label. For an Agent Brief, wait for this revision notice before applying the label. Structural validation never grants readiness.`;
}

function approvedFeedback(
  kind,
  revision,
  label,
  reviewer,
  reviewEventId,
  sourceInvalidation = null,
) {
  const state = JSON.stringify({
    status: "approved",
    revision,
    label,
    reviewer,
    reviewEventId,
    sourceInvalidation,
  });
  return `${feedbackMarker}\n${feedbackStatePrefix}${state} -->\n## Issue contract readiness recorded\n\nThe ${kind} at revision \`${revision}\` was reviewed by @${reviewer}, whose repository role authorizes triage, and is bound to \`${label}\`. Editing or replacing the contract or removing readiness invalidates this association.`;
}

function resolvedFeedback(kind, previousFeedback) {
  return `${feedbackMarker}\n${carriedState(previousFeedback)}## Issue contract structure corrected\n\nThe ${kind} now has the required structure. A fresh authorized review is still required before restoring readiness.`;
}

// While a human readiness trigger is unrecorded, the adapter re-reads the
// issue events every two seconds, waiting thirty seconds at most in total, then
// decides from the last read. The wait is `node:timers/promises`'s
// `setTimeout`, which the adapter tests replace so they use no real time.
const triggerWaitInterval = 2000;
const triggerWaitBound = 30000;

export async function runIssueContractValidation(
  event,
  connection,
  resolveIssue,
  pause = wait,
) {
  const tracker = connection.issueTracker;
  if (!event) {
    console.log(
      "Skipped pull request discussion; issue contract validation handles issues only.",
    );
    return;
  }
  const issueNumber = event.issue;
  const current = await tracker.issue(issueNumber);
  const legacyIssue = (issue) => ({
    ...issue,
    node_id: issue.nodeId,
    created_at: issue.createdAt,
    user: issue.author,
    html_url: issue.url,
  });
  const issue = legacyIssue(current);
  if (issue.state === "closed") {
    const decision = decideIssueContract({ issue });
    for (const label of decision.removeLabels)
      await tracker.removeLabel(issueNumber, label);
    console.log(decision.message);
    return;
  }
  if (!tracker.capabilities.bodyEditTime)
    throw new Error(
      "Issue body edit time is unavailable; cannot validate readiness.",
    );
  const snapshot = {
    repository: event.repository,
    event,
    issue,
    comments: (await tracker.comments(issueNumber)).map((comment) => ({
      ...comment,
      node_id: comment.nodeId,
      user: comment.author,
      created_at: comment.createdAt,
      updated_at: comment.updatedAt,
    })),
    parent: current.parent
      ? legacyIssue(await resolveIssue(current.parent))
      : null,
    blockedBy: current.blockedBy,
    bodyRevision: {
      id: current.nodeId ?? current.id,
      lastEditedAt: current.bodyEditTime,
    },
    issueEvents: null,
    permissions: {},
  };
  const readTimeline = async () =>
    (await tracker.labelChanges(issueNumber)).map((change) => ({
      id: change.id,
      event: change.action === "added" ? "labeled" : "unlabeled",
      label: { name: change.label },
      actor: change.actor,
      created_at: change.time,
    }));
  let needs = snapshotNeeds(snapshot);
  if (needs.timeline) {
    snapshot.issueEvents = await readTimeline();
    needs = snapshotNeeds(snapshot);
  }
  if (needs.contract) {
    for (
      let waited = 0;
      waited < triggerWaitBound && readinessTriggerUnrecorded(snapshot);
      waited += triggerWaitInterval
    ) {
      await pause(triggerWaitInterval);
      snapshot.issueEvents = await readTimeline();
    }
    for (const login of reviewerLogins(snapshot)) {
      try {
        snapshot.permissions[login] = {
          role: await connection.access.role(login),
        };
      } catch (error) {
        // Authority can be unavailable after the contract and timeline were
        // read. Let the decision reject readiness and apply its cleanup.
        snapshot.permissions[login] =
          error instanceof PlatformError && error.reason === "notFound"
            ? { role: null }
            : { error: error instanceof Error ? error.message : String(error) };
      }
    }
  }
  const decision = decideIssueContract(snapshot);
  for (const label of decision.removeLabels)
    await tracker.removeLabel(issueNumber, label);
  if (decision.addLabels.length)
    await tracker.addLabels(issueNumber, decision.addLabels);
  if (decision.feedback?.commentId == null && decision.feedback)
    await tracker.createComment(issueNumber, decision.feedback.body);
  else if (decision.feedback)
    await tracker.updateComment(
      decision.feedback.commentId,
      decision.feedback.body,
    );
  (decision.exitCode === 0 ? console.log : console.error)(decision.message);
  return decision.exitCode;
}
