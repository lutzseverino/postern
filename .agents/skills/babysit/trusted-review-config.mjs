// One destination default-branch snapshot governs both files for an invocation.
import { requestData } from "./platform.mjs";
import { parseReviewPolicy, policyTarget } from "./review-policy.mjs";
import { parseReviewer, reviewerTarget } from "./pull-request-reviewer.mjs";

export class InvalidTrustedReviewConfiguration extends Error {
  constructor(evidence, target, cause) {
    super(
      `Owner handoff required: invalid trusted ${target}; ${evidence}: ${cause.message}. ` +
        `Correct ${target} on the destination default branch through the applicable owner-handoff/merge procedure; ` +
        "keep the PR open and stop babysitting. After the correction lands and continuation is authorized, invoke again to select the current default-branch revision.",
      { cause },
    );
  }
}

export async function trustedReviewConfiguration(connection) {
  const repository = connection.repository.path;
  const [owner, name] = repository.split("/");
  const query = async (source, variables) => {
    const response = await requestData(connection, {
      method: "POST",
      path: "/graphql",
      body: { query: source, variables: { owner, name, ...variables } },
    }).catch((error) => {
      throw new Error(
        `Could not read trusted review configuration for ${repository}: ${error.message}`,
        { cause: error },
      );
    });
    if (response?.errors?.length || !response?.data?.repository)
      throw new Error(
        `Could not read trusted review configuration for ${repository}.`,
      );
    return response.data.repository;
  };
  const destination = await query(
    `query BabysitReviewRevision($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        nameWithOwner
        defaultBranchRef { name target { __typename oid } }
      }
    }`,
    {},
  );
  const branch = destination.defaultBranchRef;
  const revision = branch?.target?.oid;
  if (
    destination.nameWithOwner?.toLowerCase() !== repository.toLowerCase() ||
    typeof branch?.name !== "string" ||
    !branch.name ||
    branch.target?.__typename !== "Commit" ||
    !/^[0-9a-f]{40}$/i.test(revision ?? "")
  )
    throw new Error(
      `Could not resolve the default-branch commit for ${repository}.`,
    );
  const evidence = `review configuration: ${repository} default branch ${branch.name}@${revision}`;
  try {
    const files = await query(
      `query BabysitReviewConfiguration($owner: String!, $name: String!, $revision: GitObjectID!, $policy: String!, $reviewer: String!) {
        repository(owner: $owner, name: $name) {
          commit: object(oid: $revision) { __typename oid }
          policy: object(expression: $policy) { __typename ... on Blob { text isTruncated } }
          reviewer: object(expression: $reviewer) { __typename ... on Blob { text isTruncated } }
        }
      }`,
      {
        revision,
        policy: `${revision}:${policyTarget}`,
        reviewer: `${revision}:${reviewerTarget}`,
      },
    );
    if (files.commit?.__typename !== "Commit" || files.commit.oid !== revision)
      throw new Error("Could not read the pinned commit.");
    const parseFile = (blob, target, parse) => {
      // Only an explicit null in a successful query verifies optional absence.
      if (blob === null) return null;
      if (
        blob?.__typename !== "Blob" ||
        blob.isTruncated !== false ||
        typeof blob.text !== "string"
      )
        throw new Error(`Could not read complete ${target}.`);
      try {
        return parse(blob.text);
      } catch (error) {
        throw new InvalidTrustedReviewConfiguration(evidence, target, error);
      }
    };
    return {
      policy: parseFile(files.policy, policyTarget, parseReviewPolicy),
      reviewer: parseFile(files.reviewer, reviewerTarget, parseReviewer),
      evidence,
    };
  } catch (error) {
    if (error instanceof InvalidTrustedReviewConfiguration) throw error;
    throw new Error(`${evidence}: ${error.message}`, { cause: error });
  }
}
