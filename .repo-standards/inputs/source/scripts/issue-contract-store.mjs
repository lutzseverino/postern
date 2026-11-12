import { readFileSync } from "node:fs";
import { PlatformError } from "../vendor/postern/postern.mjs";
import {
  cutoffFormat,
  digest,
  same,
  validReceipt,
  markedRun,
  attestationFormat,
  intakeOriginal,
} from "./issue-contract-sources.mjs";

export const ledgerBranch = "repo-canon/issue-contracts";
const configurationPath = ".github/issue-contracts.json";
const request = async (connection, input) =>
  (await connection.access.request(input)).data;
const base = (connection) => `/repos/${connection.repository.path}`;

// Only trusted default-branch code/configuration calls this reader. No issue
// text, feedback marker, release install or first observation activates mode.
/** @param {string | URL} [path] */
export function contractSourceConfiguration(
  path = new URL("../.github/issue-contracts.json", import.meta.url),
) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { mode: "prepared" };
    throw error;
  }
  if (value?.mode === "prepared") return { mode: "prepared" };
  if (value?.mode !== "body" || !/^[a-f0-9]{40}$/.test(value.cutoff ?? ""))
    throw new Error(
      "Invalid trusted issue-contract mode: body mode requires an immutable cutoff commit.",
    );
  return { mode: "body", cutoff: value.cutoff };
}

async function file(connection, path, ref) {
  try {
    const data = await request(connection, {
      path: `${base(connection)}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    });
    if (
      data?.type !== "file" ||
      data.encoding !== "base64" ||
      !data.sha ||
      typeof data.content !== "string"
    )
      throw new Error(`Incomplete trusted contract storage: ${path}.`);
    const bytes = Buffer.from(data.content, "base64");
    if (bytes.length !== data.size)
      throw new Error(`Truncated trusted contract storage: ${path}.`);
    return { value: JSON.parse(bytes.toString("utf8")), sha: data.sha };
  } catch (error) {
    if (error instanceof PlatformError && error.reason === "notFound")
      return null;
    throw error;
  }
}

async function put(connection, path, value, sha, branch = ledgerBranch) {
  return request(connection, {
    method: "PUT",
    path: `${base(connection)}/contents/${path}`,
    body: {
      message: `chore: record issue contract facts for ${path}`,
      branch,
      content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`).toString(
        "base64",
      ),
      ...(sha ? { sha } : {}),
    },
  });
}

// GitHub's edit record identity distinguishes same-second edits and exact byte
// restoration. Dates alone cannot authenticate an unchanged source.
export async function sourceEditIdentities(connection, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const result = {};
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    const data = await request(connection, {
      method: "POST",
      path: "/graphql",
      body: {
        query: `query ContractSourceEdits($ids:[ID!]!) { nodes(ids:$ids) { ... on Issue { id lastEditedAt userContentEdits(first:1) { nodes { id editedAt deletedAt } } } ... on IssueComment { id lastEditedAt userContentEdits(first:1) { nodes { id editedAt deletedAt } } } } }`,
        variables: { ids: batch },
      },
    });
    if (
      data?.errors?.length ||
      !Array.isArray(data?.data?.nodes) ||
      data.data.nodes.length !== batch.length
    )
      throw new Error(
        "Source edit history is unavailable; cannot prove exact contract identity.",
      );
    for (const node of data.data.nodes) {
      const edit = node?.userContentEdits?.nodes?.[0];
      if (
        !node?.id ||
        !Object.hasOwn(node, "lastEditedAt") ||
        (node.lastEditedAt &&
          (!edit?.id || edit.deletedAt || edit.editedAt !== node.lastEditedAt))
      )
        throw new Error(
          "Source edit history is incomplete; recover exact edit identity before reviewing.",
        );
      result[node.id] = {
        id: node.lastEditedAt ? edit.id : `created:${node.id}`,
        editedAt: node.lastEditedAt,
      };
    }
  }
  return result;
}

// Host/operator callers pin repository configuration independently of their
// checkout; malformed/unavailable reads never fall back to prepared mode.
export async function readContractSourceConfiguration(connection) {
  const repository = await request(connection, { path: base(connection) });
  const ref = await request(connection, {
    path: `${base(connection)}/git/ref/heads/${repository.default_branch}`,
  });
  const selected = await file(connection, configurationPath, ref.object.sha);
  if (!selected || selected.value?.mode === "prepared")
    return { mode: "prepared" };
  if (
    selected.value?.mode !== "body" ||
    !/^[a-f0-9]{40}$/.test(selected.value.cutoff ?? "")
  )
    throw new Error(
      "Unknown repository contract mode; restore trusted configuration before publication.",
    );
  return { mode: "body", cutoff: selected.value.cutoff };
}

export async function loadContractSources(
  connection,
  number,
  configuration = contractSourceConfiguration(),
) {
  if (configuration.mode === "prepared") return { mode: "prepared" };
  const receiptFile = await file(
    connection,
    "cutoff.json",
    configuration.cutoff,
  );
  const recordFile = await file(
    connection,
    `issues/${number}.json`,
    ledgerBranch,
  );
  return {
    mode: "body",
    trusted: true,
    cutoff: configuration.cutoff,
    receipt: receiptFile?.value ?? null,
    record: recordFile?.value ?? null,
    recordSha: recordFile?.sha ?? null,
  };
}

export async function saveContractSourceRecord(
  connection,
  number,
  facts,
  record,
) {
  if (!record || same(record, facts.record)) return;
  if (
    (facts.record?.migrated && !record.migrated) ||
    (facts.record?.retired && !record.retired) ||
    (facts.record?.intake &&
      !same(facts.record.intake, record.intake) &&
      !(
        facts.record.intake.writerRun === null &&
        record.intake?.writerRun &&
        record.intake.writerProof &&
        same(
          {
            ...facts.record.intake,
            writerRun: record.intake.writerRun,
            writerProof: record.intake.writerProof,
          },
          record.intake,
        )
      ))
  )
    throw new Error(
      "Cannot reset durable contract migration, retirement or original intake.",
    );
  const write = await put(
    connection,
    `issues/${number}.json`,
    record,
    facts.recordSha,
  );
  facts.record = record;
  facts.recordSha = write.content.sha;
}

// Host-side prepublication operation, before replacing intake. The model
// cannot supply author/writer facts or invent the original reporter request.
export async function captureContractIntake(
  connection,
  number,
  triageResult,
  facts,
  issue,
  edits,
  writerProof = null,
) {
  if (
    !facts.trusted ||
    !validReceipt(facts.receipt, connection.repository.path)
  )
    throw new Error("Trusted cutoff required.");
  if (facts.record?.intake) {
    if (!writerProof) return facts.record;
    const intake = intakeWithWriter(
      facts.record.intake,
      writerProof,
      connection.repository.path,
      facts.record.issue,
      triageResult,
    );
    const record = { ...facts.record, intake };
    await saveContractSourceRecord(connection, number, facts, record);
    return record;
  }
  if (facts.receipt.issues.some((entry) => entry.number === number))
    throw new Error(
      "Inventoried source history or original intake is unavailable; recover authenticated history before publication.",
    );
  issue ??= await connection.issueTracker.issue(number);
  const original = intakeOriginal(issue.body ?? "");
  if (original === null)
    throw new Error(
      "Original request is unavailable or ambiguous; recover authenticated intake rather than using a prior brief.",
    );
  edits ??= await sourceEditIdentities(connection, [issue.nodeId]);
  const record = {
    ...facts.record,
    issue: issue.nodeId,
    cutoff: facts.cutoff,
    migrated: facts.record?.migrated ?? false,
    retired: facts.record?.retired ?? false,
    intake: {
      original,
      author: issue.author.login,
      writerRun: null,
      writerProof: null,
      sourceEdit: edits[issue.nodeId],
    },
  };
  if (writerProof)
    record.intake = intakeWithWriter(
      record.intake,
      writerProof,
      connection.repository.path,
      issue.nodeId,
      triageResult,
    );
  await saveContractSourceRecord(connection, number, facts, record);
  return record;
}

// The host supplies this fact from its independently retained issue-publication
// record. No body marker or model-supplied Original request can mint it.
function intakeWithWriter(intake, proof, repository, issue, triageResult) {
  if (
    intake.author !== triageResult?.author ||
    proof.repository !== repository ||
    proof.issue !== issue ||
    !same(proof.sourceEdit, intake.sourceEdit) ||
    typeof proof.run !== "string" ||
    !proof.run.trim() ||
    proof.run.trim() !== proof.run ||
    (intake.writerRun && intake.writerRun !== proof.run)
  )
    throw new Error(
      "Authenticated intake writer proof does not match the preserved issue/source.",
    );
  return { ...intake, writerRun: proof.run, writerProof: proof };
}

// Host records the observed platform publication, not an agent-provided claim.
// The validator separately verifies it and owns the readiness decision.
export async function recordContractPublication(
  connection,
  number,
  facts,
  triageResult,
  publication,
) {
  if (!facts.trusted || !facts.record?.intake)
    throw new Error("Capture authenticated intake before publishing a body.");
  const issue = await connection.issueTracker.issue(number);
  const comments = await connection.issueTracker.comments(number);
  const comment = comments.find(
    (candidate) => String(candidate.id) === String(publication.attestationId),
  );
  if (!comment || comment.author.login !== triageResult.author)
    throw new Error("Configured-author attestation is missing.");
  const edits = await sourceEditIdentities(connection, [
    issue.nodeId,
    comment.nodeId,
  ]);
  const source = {
    type: "issue-body",
    editedAt: issue.bodyEditTime,
    editId: edits[issue.nodeId].id,
  };
  const prefix = "<!-- repo-canon:triage-attestation ";
  const lines = comment.body
    .split("\n")
    .filter((line) => line.includes("<!-- repo-canon:triage-attestation"));
  const payload =
    lines.length === 1 &&
    lines[0].startsWith(prefix) &&
    lines[0].endsWith(" -->")
      ? JSON.parse(lines[0].slice(prefix.length, -4))
      : null;
  const revision = digest(
    JSON.stringify({
      format: "repo-canon/issue-contract-revision/v1",
      kind: "triaged Agent Brief",
      source: {
        type: "issue-body",
        id: issue.nodeId,
        editedAt: source.editedAt,
        editId: source.editId,
      },
      body: issue.body,
    }),
  );
  if (
    payload?.format !== attestationFormat ||
    typeof payload.run !== "string" ||
    !payload.run.trim() ||
    payload.repository !== connection.repository.path ||
    payload.issue !== issue.nodeId ||
    payload.outcome !== "success" ||
    payload.revision !== revision ||
    !same(payload.source, source) ||
    markedRun(comment.body, triageResult.marker) !== payload.run ||
    !same(payload.intake, {
      author: facts.record.intake.author,
      writerRun: facts.record.intake.writerRun,
    })
  )
    throw new Error(
      "Attestation does not match the observed exact body publication and preserved intake.",
    );
  const proof = {
    payload,
    attestation: {
      id: String(comment.id),
      edit: edits[comment.nodeId],
      revision: digest(comment.body),
    },
  };
  if (
    facts.record.publication &&
    same(
      {
        payload: facts.record.publication.payload,
        attestation: facts.record.publication.attestation,
      },
      proof,
    )
  ) {
    await requestContractEvaluation(connection, number);
    return;
  }
  if (facts.record.publication?.attestation.id === String(comment.id))
    throw new Error(
      "Publication evidence is immutable; an edited or replaced attestation needs fresh person acceptance or a new body revision.",
    );
  await saveContractSourceRecord(connection, number, facts, {
    ...facts.record,
    migrated: true,
    retired: true,
    publication: proof,
  });
  await requestContractEvaluation(connection, number);
}

// Operator capture enumerates every open issue through the complete port list,
// not only factory-ready work. A second complete read rejects races. The freeze
// is an explicit operator precondition maintained until activation completes.
export async function captureContractCutoff(connection, identity, inventory) {
  if (
    identity.publicationFrozen !== true ||
    !identity.release?.trim() ||
    !/^[a-f0-9]{40}$/.test(identity.sha ?? "") ||
    !Number.isFinite(Date.parse(identity.epoch))
  )
    throw new Error(
      "A publication freeze, installed release/full SHA and activation epoch are required.",
    );
  const first = await inventory();
  const second = await inventory();
  if (!first.complete || !second.complete || !same(first, second))
    throw new Error(
      "Cutoff inventory is incomplete or changed during capture; keep publication frozen and retry.",
    );
  return {
    format: cutoffFormat,
    repository: connection.repository.path,
    ...identity,
    complete: true,
    issues: first.issues,
  };
}

export async function installContractCutoff(connection, receipt, inventory) {
  if (!validReceipt(receipt, connection.repository.path))
    throw new Error("Invalid complete cutoff receipt.");
  const current = await inventory();
  if (!current.complete || !same(current.issues, receipt.issues))
    throw new Error(
      "Inventory changed before cutoff commit; keep the freeze and recapture.",
    );
  // Ref creation refuses any existing ledger; no second cutoff or overwrite.
  const repository = await request(connection, { path: base(connection) });
  const tip = await request(connection, {
    path: `${base(connection)}/git/ref/heads/${repository.default_branch}`,
  });
  await request(connection, {
    method: "POST",
    path: `${base(connection)}/git/refs`,
    body: { ref: `refs/heads/${ledgerBranch}`, sha: tip.object.sha },
  });
  const written = await put(connection, "cutoff.json", receipt, null);
  const cutoff = written.commit.sha;
  for (const entry of receipt.issues)
    await put(
      connection,
      `issues/${entry.number}.json`,
      {
        issue: entry.issue,
        cutoff,
        migrated: false,
        retired: false,
        intake: entry.intake,
        notice: entry.legacy?.notice ?? null,
        cutoffBodyEdit: entry.bodyEdit,
      },
      null,
    );
  const verified = await inventory();
  if (!verified.complete || !same(verified.issues, receipt.issues))
    throw new Error(
      "Inventory changed before activation; no mode switch was written. Recover the prepared ledger under the freeze.",
    );
  const config = await file(
    connection,
    configurationPath,
    repository.default_branch,
  );
  if (config?.value?.mode === "body")
    throw new Error("Body mode is already active; never replace its cutoff.");
  await put(
    connection,
    configurationPath,
    { mode: "body", cutoff },
    config?.sha,
    repository.default_branch,
  );
  for (const entry of receipt.issues)
    await requestContractEvaluation(connection, entry.number);
  return cutoff;
}

// Repository dispatch needs the same Contents-write host authority as ledger
// persistence. Its only effect is a fresh trusted evaluation, never acceptance.
// Retry even when proof was already recorded, so a failed wake is recoverable.
export async function requestContractEvaluation(connection, number) {
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error("A positive issue number is required for evaluation.");
  await request(connection, {
    method: "POST",
    path: `${base(connection)}/dispatches`,
    body: {
      event_type: "repo-canon-issue-contract",
      client_payload: { issue: number },
    },
  });
}
