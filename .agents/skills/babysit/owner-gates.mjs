import { requestData } from "./platform.mjs";

// Two consumers: review reporting and merge preflight. The issue/PR owns its
// label choices; Canon owns the gate: interpretation.
const query = `query OwnerGates($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      labels(first: 100) { nodes { name } pageInfo { hasNextPage } }
      closingIssuesReferences(first: 50) {
        nodes { number labels(first: 100) { nodes { name } pageInfo { hasNextPage } } }
        pageInfo { hasNextPage }
      }
    }
  }
}`;

function completeNodes(connection, source) {
  if (
    !Array.isArray(connection?.nodes) ||
    connection.pageInfo?.hasNextPage !== false
  )
    throw new Error(
      `Could not read complete owner-gate evidence for ${source}.`,
    );
  return connection.nodes;
}

function labelNames(labels, source) {
  if (
    !Array.isArray(labels) ||
    labels.some(
      (label) => typeof label?.name !== "string" || !label.name.trim(),
    )
  )
    throw new Error(`Could not read owner-gate labels for ${source}.`);
  return labels.map((label) => label.name);
}

// Refuse pagination rather than treating partial relationships or labels as
// proof of no gate. Extra issues preserve review's explicitly named scope;
// merge always uses only the platform's closing-issue relationships.
export async function ownerGates(connection, number, extra = []) {
  const [owner, name] = connection.repository.path.split("/");
  const response = await requestData(connection, {
    method: "POST",
    path: "/graphql",
    body: { query, variables: { owner, name, number } },
  });
  if (
    response?.errors !== undefined &&
    (!Array.isArray(response.errors) || response.errors.length)
  )
    throw new Error(`Could not read owner gates for pull request #${number}.`);
  const pull = response?.data?.repository?.pullRequest;
  const labels = labelNames(
    completeNodes(pull?.labels, `PR #${number}`),
    `PR #${number}`,
  );
  const issues = completeNodes(
    pull?.closingIssuesReferences,
    `PR #${number}'s closing issues`,
  ).map((issue) => {
    if (!Number.isSafeInteger(issue?.number) || issue.number <= 0)
      throw new Error(`Could not read a closing issue for PR #${number}.`);
    return {
      number: issue.number,
      labels: labelNames(
        completeNodes(issue.labels, `#${issue.number}`),
        `#${issue.number}`,
      ),
    };
  });
  for (const issue of new Set(extra)) {
    if (issues.some(({ number }) => number === issue)) continue;
    const read = await requestData(connection, {
      method: "GET",
      path: `/repos/${connection.repository.path}/issues/${issue}`,
    });
    issues.push({
      number: issue,
      labels: labelNames(read?.labels, `#${issue}`),
    });
  }
  const gates = [
    ...labels.map((label) => [label, "the PR"]),
    ...issues.flatMap(({ number, labels }) =>
      labels.map((label) => [label, `#${number}`]),
    ),
  ]
    .filter(([label]) => label.startsWith("gate:"))
    .map(([label, where]) => `${label} on ${where}`);
  return { issues, gates };
}
