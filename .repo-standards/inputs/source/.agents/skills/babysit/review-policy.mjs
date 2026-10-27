// Repository-owned exemption, evaluated before reviewer requests and waits.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const policyTarget = ".github/factory-review-policy.json";
const isAppIdentity = (login) =>
  typeof login === "string" &&
  /^(?:[^\s/[\]]+\[bot\]|app\/[^\s/[\]]+)$/i.test(login);

export const readReviewPolicy = (root = process.cwd()) => {
  let text;
  try {
    text = readFileSync(join(root, policyTarget), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return parseReviewPolicy(text);
};

export const parseReviewPolicy = (text) => {
  try {
    const policy = JSON.parse(text);
    if (!policy || typeof policy !== "object" || Array.isArray(policy))
      throw new Error("must be an object");
    for (const key of Object.keys(policy))
      if (!["version", "author"].includes(key))
        throw new Error(`unknown field: ${key}`);
    if (policy.version !== 1) throw new Error("version must be 1");
    if (
      typeof policy.author !== "string" ||
      !policy.author.trim() ||
      policy.author !== policy.author.trim()
    )
      throw new Error("author must be a nonempty, trimmed login");
    if (!isAppIdentity(policy.author))
      throw new Error(
        "author must be an app identity: <slug>[bot] or app/<slug>",
      );
    return policy;
  } catch (error) {
    throw new Error(`${policyTarget}: ${error.message}`, { cause: error });
  }
};

const normalize = (login) =>
  login.toLowerCase().replace(/^app\/(.+)$/, "$1[bot]");

export const skipsExternalReview = (policy, author) =>
  Boolean(
    policy &&
    isAppIdentity(policy.author) &&
    typeof author === "string" &&
    author &&
    normalize(author) === normalize(policy.author),
  );
