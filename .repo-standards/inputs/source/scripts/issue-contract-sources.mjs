import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { interpretMarkdown } from "../operations/lib/rendered-markdown.mjs";

export const bodyResultFormat = "repo-canon/issue-contract-state/v2";
export const cutoffFormat = "repo-canon/issue-contract-cutoff/v1";
export const attestationFormat = "repo-canon/triage-attestation/v1";
export const digest = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const same = isDeepStrictEqual;

// Value owners: the standard owns the protocol; the repository owns its cutoff
// and durable per-issue facts; the issue owns its contract. Consumers: validator,
// operator, Scriptorium. Crossing repositories makes the wire format costly to
// reverse (cost now M, carrying S); keep selection and proof behind this seam.
export function sourceSelection(snapshot, briefs, revisionOf) {
  const facts = snapshot.contractSources;
  if (!facts || facts.mode === "prepared") return null;
  const { receipt, record } = facts;
  const cutoff =
    validReceipt(receipt, snapshot.repository) &&
    /^[a-f0-9]{40}$/.test(facts.cutoff ?? "")
      ? {
          id: facts.cutoff,
          release: receipt.release,
          sha: receipt.sha,
          epoch: receipt.epoch,
        }
      : null;
  const selection = { mode: "body", cutoff, state: "held", reason: null };
  const held = (reason, next = record) => ({
    selection: { ...selection, reason },
    record: next,
    error: reason,
  });
  if (
    facts.mode !== "body" ||
    !facts.trusted ||
    !validReceipt(receipt, snapshot.repository) ||
    !facts.cutoff
  )
    return held(
      "Trusted complete cutoff receipt unavailable; restore the repository's recorded cutoff before reviewing this issue.",
    );
  const identity = String(
    snapshot.issue.node_id ?? snapshot.issue.nodeId ?? snapshot.issue.id,
  );
  if (!record || record.issue !== identity || record.cutoff !== facts.cutoff)
    return held(
      "Durable issue source record unavailable; recover it or capture original intake before migrating. Reopened issues absent at cutoff must migrate.",
    );
  const bodyBrief = snapshot.bodyBrief;
  const hasCategory = (snapshot.issue.labels ?? []).some((label) =>
    ["type:bug", "type:enhancement"].includes(
      typeof label === "string" ? label : label.name,
    ),
  );
  let next = structuredClone(record);
  const eligible = receipt.issues.find(
    (entry) => entry.issue === identity,
  )?.legacy;
  const unchangedCutoffBody =
    eligible &&
    record.cutoffBodyEdit &&
    same(record.cutoffBodyEdit, {
      id: snapshot.bodyRevision?.editId,
      editedAt: snapshot.bodyRevision?.lastEditedAt ?? null,
    });
  if (
    bodyBrief &&
    (hasCategory || eligible || next.migrated || next.retired) &&
    !(unchangedCutoffBody && !next.migrated)
  )
    next = { ...next, migrated: true, retired: true };
  // Any observed edit/deletion/replacement retires the old source permanently.
  // Edit IDs also detect an edit-and-restore between evaluations.
  const selected =
    eligible && briefs.find((brief) => String(brief.id) === eligible.source.id);
  const edit =
    selected &&
    snapshot.sourceEdits?.[
      String(selected.node_id ?? selected.nodeId ?? selected.id)
    ];
  const unchanged = Boolean(
    selected &&
    edit &&
    same(edit, eligible.edit) &&
    revisionOf(selected).revision === eligible.revision,
  );
  const replacement =
    eligible &&
    briefs.some((brief) => BigInt(brief.id) > BigInt(eligible.source.id));
  const deletedReplacement =
    eligible &&
    snapshot.deletedBrief &&
    BigInt(snapshot.deletedBrief.id) > BigInt(eligible.source.id);
  if (eligible && (!unchanged || replacement || deletedReplacement))
    next.retired = true;
  if (next.migrated) {
    if (!bodyBrief || !hasCategory)
      return held(
        "This issue migrated to its body; restore its body Agent Brief and category. Legacy sources cannot be resurrected.",
        next,
      );
    if (!snapshot.bodyRevision?.editId)
      return held(
        "Exact body edit identity is unavailable; restore authenticated source history.",
        next,
      );
    if (typeof next.intake?.original !== "string")
      return held(
        "Original intake is unavailable or ambiguous; recover authenticated intake before migration.",
        next,
      );
    return {
      selection: { ...selection, state: "migrated" },
      record: next,
      type: "issue-body",
    };
  }
  if (eligible && unchanged && !next.retired && hasCategory)
    return {
      selection: { ...selection, state: "eligible" },
      record: next,
      type: "comment",
      comment: selected,
      legacy: eligible,
    };
  // Native contracts and ordinary intake remain native. Retired/migrated triage
  // contracts must never fall through to a direct contract after label removal.
  if (!eligible && !next.retired && (!hasCategory || briefs.length === 0))
    return {
      selection: { ...selection, state: "native" },
      record: next,
      type: "native",
    };
  return held(
    "Legacy source is not eligible unchanged at this cutoff; publish a body migration and obtain a fresh revision notice and acceptance.",
    next,
  );
}

export function validReceipt(receipt, repository) {
  return Boolean(
    receipt?.format === cutoffFormat &&
    receipt.repository === repository &&
    receipt.complete === true &&
    receipt.publicationFrozen === true &&
    typeof receipt.release === "string" &&
    receipt.release.trim() &&
    /^[a-f0-9]{40}$/.test(receipt.sha ?? "") &&
    Number.isFinite(Date.parse(receipt.epoch)) &&
    Array.isArray(receipt.issues) &&
    new Set(receipt.issues.map((entry) => entry.issue)).size ===
      receipt.issues.length &&
    receipt.issues.every(
      (entry) =>
        typeof entry.issue === "string" &&
        Number.isSafeInteger(entry.number) &&
        (!entry.legacy ||
          (/^sha256:[a-f0-9]{64}$/.test(entry.legacy.revision) &&
            entry.legacy.source?.type === "comment" &&
            /^\d+$/.test(entry.legacy.source.id) &&
            typeof entry.legacy.edit?.id === "string" &&
            entry.legacy.edit.id)),
    ),
  );
}

export function bodyWithOriginal(brief, original) {
  if (typeof original !== "string")
    throw new Error("Original request is unavailable; do not invent intake.");
  if (namedHeadings(brief, "original request").length)
    throw new Error(
      "The brief already includes Original request; supply the brief and preserved intake separately.",
    );
  return `${brief.trimEnd()}\n\n## Original request\n\n${original}`;
}

export function originalMatches(body, intake) {
  if (typeof intake?.original !== "string") return false;
  const suffix = `\n\n## Original request\n\n${intake.original}`;
  return (
    body.endsWith(suffix) &&
    !namedHeadings(body.slice(0, -suffix.length), "original request").length
  );
}

export function markedRun(markdown, marker) {
  const lines = (markdown ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.includes(`<!-- ${marker}`));
  if (lines.length !== 1) return null;
  const prefix = `<!-- ${marker} `;
  if (!lines[0].startsWith(prefix) || !lines[0].endsWith(" -->")) return null;
  try {
    const value = JSON.parse(lines[0].slice(prefix.length, -4));
    return typeof value?.run === "string" &&
      value.run.trim() === value.run &&
      value.run
      ? value.run
      : null;
  } catch {
    return null;
  }
}

// Publication proof comes from authenticated durable storage, never a copied
// marker. The host records it after capturing intake and publishing evidence.
export function bodyTriageAssociation(snapshot, contract) {
  const proof = snapshot.contractSources?.record?.publication;
  const config = snapshot.triageResult;
  if (!proof || !config || !snapshot.contractSources?.trusted) return null;
  const comment = snapshot.comments.find(
    (candidate) => String(candidate.id) === proof.attestation.id,
  );
  const edit =
    comment &&
    snapshot.sourceEdits?.[
      String(comment.node_id ?? comment.nodeId ?? comment.id)
    ];
  const intake = snapshot.contractSources.record.intake;
  const prefix = "<!-- repo-canon:triage-attestation ";
  const lines = (comment?.body ?? "")
    .split("\n")
    .filter((line) => line.includes("<!-- repo-canon:triage-attestation"));
  let payload;
  try {
    payload =
      lines.length === 1 &&
      lines[0].startsWith(prefix) &&
      lines[0].endsWith(" -->")
        ? JSON.parse(lines[0].slice(prefix.length, -4))
        : null;
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.run !== "string" ||
    !payload.run.trim() ||
    payload.format !== attestationFormat ||
    payload.repository !== snapshot.repository ||
    payload.issue !== String(snapshot.issue.node_id ?? snapshot.issue.nodeId) ||
    payload.outcome !== "success" ||
    !same(payload.source, contract.source) ||
    payload.revision !== contract.revision ||
    !same(payload, proof.payload) ||
    !same(edit, proof.attestation.edit) ||
    digest(comment.body) !== proof.attestation.revision ||
    (comment.user ?? comment.author)?.login !== config.author ||
    markedRun(comment.body, config.marker) !== payload.run ||
    !intake ||
    !same(payload.intake, {
      author: intake.author,
      writerRun: intake.writerRun,
    }) ||
    (intake.author === config.author &&
      (!intake.writerRun || intake.writerRun === payload.run))
  )
    return null;
  if (
    intake.author === config.author &&
    (!intake.writerProof ||
      intake.writerProof.run !== intake.writerRun ||
      intake.writerProof.repository !== snapshot.repository ||
      intake.writerProof.issue !==
        String(snapshot.issue.node_id ?? snapshot.issue.nodeId) ||
      !same(intake.writerProof.sourceEdit, intake.sourceEdit))
  )
    return null;
  return {
    run: payload.run,
    revision: contract.revision,
    source: contract.source,
    attestation: {
      id: String(comment.id),
      revision: proof.attestation.revision,
      edit,
    },
    intake: payload.intake,
  };
}

// A preserved heading alone is not authenticated intake. Reuse an existing
// original from the trusted record; without that record, recover historical
// intake rather than certifying agent-supplied Original request text.
export function intakeOriginal(body) {
  return namedHeadings(body, "agent brief").length ? null : body;
}

function namedHeadings(body, name) {
  return interpretMarkdown(body, {
    additionalNonRenderedElements: ["head", "title"],
  }).markdownHeadings.filter(
    (heading) =>
      heading.name.replace(/[*_`]/g, "").trim().toLowerCase() === name,
  );
}
