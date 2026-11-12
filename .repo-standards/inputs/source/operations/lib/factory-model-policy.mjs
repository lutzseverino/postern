import { readFileSync } from "node:fs";
import { join } from "node:path";

export const modelPolicyPath = ".github/factory-model-policy.json";

function object(value, path, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} must be an object`);
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      throw new Error(`${path}.${key} is an unknown field`);
}

function selection(value, path) {
  object(value, path, ["provider", "model", "effort", "source"]);
  if (Object.hasOwn(value, "source")) {
    if (value.source !== "issue-label" || Object.keys(value).length !== 1)
      throw new Error(`${path} must contain only source: "issue-label"`);
    return;
  }
  for (const key of ["provider", "model", "effort"]) {
    if (key === "effort" && !Object.hasOwn(value, key)) continue;
    if (
      typeof value[key] !== "string" ||
      !value[key] ||
      value[key] !== value[key].trim()
    )
      throw new Error(`${path}.${key} must be a nonempty trimmed string`);
  }
}

// Structure only: capabilities, availability and resolution belong to the host.
export function readModelPolicy(root) {
  let text;
  try {
    text = readFileSync(join(root, modelPolicyPath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`${modelPolicyPath}: cannot read file: ${error.message}`, {
      cause: error,
    });
  }
  try {
    const policy = JSON.parse(text);
    object(policy, "policy", ["version", "fallback", "runKinds"]);
    if (policy.version !== 1) throw new Error("version must be 1");
    if (!["wait", "host-default"].includes(policy.fallback))
      throw new Error('fallback must be "wait" or "host-default"');
    object(policy.runKinds, "runKinds", ["triage", "implement", "review"]);
    for (const [kind, value] of Object.entries(policy.runKinds)) {
      const path = `runKinds.${kind}`;
      if (kind === "implement") {
        object(value, path, ["initial", "retry"]);
        for (const [attempt, choice] of Object.entries(value))
          selection(choice, `${path}.${attempt}`);
      } else selection(value, path);
    }
    return policy;
  } catch (error) {
    throw new Error(`${modelPolicyPath}: ${error.message}`, { cause: error });
  }
}
