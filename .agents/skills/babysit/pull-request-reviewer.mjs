// Reads and validates the optional pull request reviewer file against the
// schema the `github-repository-configuration` rules state. The reviewer check
// runs this module from operations/lib, and babysit's directory carries a
// byte-identical copy so its scripts run where only the skill is installed; a
// repository conformance test keeps the two copies identical.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const reviewerTarget = ".github/pull-request-reviewer.json";

export const readReviewer = (root = process.cwd()) => {
  let text;
  try {
    text = readFileSync(join(root, reviewerTarget), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return parseReviewer(text);
};

export const parseReviewer = (text) => {
  let reviewer;
  try {
    reviewer = JSON.parse(text);
  } catch (error) {
    throw new Error(`${reviewerTarget}: ${error.message}`, { cause: error });
  }
  validateReviewer(reviewer);
  return reviewer;
};

const objectFields = (value, required, optional = [], path = "reviewer") => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} must be an object.`);
  for (const key of required)
    if (!Object.hasOwn(value, key))
      throw new Error(`${path}.${key} is required.`);
  for (const key of Object.keys(value))
    if (![...required, ...optional].includes(key))
      throw new Error(`${path}.${key} is unknown.`);
};
const textField = (value, path) => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${path} must be a nonempty string.`);
};

const validateReviewer = (reviewer) => {
  objectFields(
    reviewer,
    ["version", "account", "request", "unavailable", "bounds"],
    ["finished"],
  );
  if (reviewer.version !== 1) throw new Error("reviewer.version must be 1.");
  textField(reviewer.account, "reviewer.account");
  objectFields(reviewer.request, ["comment", "onOpen"], [], "reviewer.request");
  textField(reviewer.request.comment, "reviewer.request.comment");
  if (reviewer.request.comment !== reviewer.request.comment.trim())
    throw new Error("reviewer.request.comment must be trimmed.");
  if (typeof reviewer.request.onOpen !== "boolean")
    throw new Error("reviewer.request.onOpen must be boolean.");
  if (!Array.isArray(reviewer.unavailable))
    throw new Error("reviewer.unavailable must be an array of reply texts.");
  for (const reply of reviewer.unavailable)
    textField(reply, "reviewer.unavailable reply");
  objectFields(
    reviewer.bounds,
    ["responseMinutes", "reviewMinutes"],
    ["reviewRequests"],
    "reviewer.bounds",
  );
  for (const key of ["responseMinutes", "reviewMinutes"]) {
    if (!Number.isFinite(reviewer.bounds[key]) || reviewer.bounds[key] <= 0)
      throw new Error(
        `reviewer.bounds.${key} must be a positive finite number.`,
      );
  }
  if (
    Object.hasOwn(reviewer.bounds, "reviewRequests") &&
    (!Number.isInteger(reviewer.bounds.reviewRequests) ||
      reviewer.bounds.reviewRequests <= 0)
  )
    throw new Error(
      "reviewer.bounds.reviewRequests must be a positive integer.",
    );
  if (Object.hasOwn(reviewer, "finished")) {
    objectFields(
      reviewer.finished,
      ["commentMarker", "line"],
      [],
      "reviewer.finished",
    );
    textField(
      reviewer.finished.commentMarker,
      "reviewer.finished.commentMarker",
    );
    textField(reviewer.finished.line, "reviewer.finished.line");
    let groups;
    try {
      // The empty alternative exposes every named group even without a match.
      groups = new RegExp(`(?:${reviewer.finished.line})|`, "u").exec(
        "",
      ).groups;
    } catch {
      throw new Error(
        "reviewer.finished.line must be a valid regular expression.",
      );
    }
    if (
      !groups ||
      !Object.hasOwn(groups, "sha") ||
      !Object.hasOwn(groups, "at")
    )
      throw new Error("reviewer.finished.line needs named sha and at groups.");
  }
};
