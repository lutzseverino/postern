#!/usr/bin/env node
import { executedAsScript } from "../vendor/repo-canon/validate.mjs";
import { connectionFor } from "../.agents/skills/babysit/platform.mjs";
import {
  contractCutoffInventory,
  issueContractResult,
  readIssueContractObservation,
} from "../vendor/repo-canon/validate-issue-contract.mjs";
import {
  captureContractCutoff,
  installContractCutoff,
  loadContractSources,
  readContractSourceConfiguration,
  requestContractEvaluation,
} from "./issue-contract-store.mjs";

export async function main(
  args = process.argv.slice(2),
  connect = connectionFor,
) {
  const [action, ...options] = args;
  const flags = new Map();
  while (options.length) {
    const flag = options.shift();
    if (
      ![
        "--repo",
        "--release",
        "--sha",
        "--epoch",
        "--publication-frozen",
        "--issue",
      ].includes(flag) ||
      flags.has(flag)
    )
      throw new Error("Unknown or repeated cutoff option.");
    flags.set(flag, flag === "--publication-frozen" ? true : options.shift());
  }
  if (
    !["activate", "inspect", "evaluate"].includes(action) ||
    typeof flags.get("--repo") !== "string"
  )
    throw new Error(
      "Usage: issue-contract-cutoff.mjs inspect --repo OWNER/REPO [--issue NUMBER] | evaluate --repo OWNER/REPO --issue NUMBER | activate --repo OWNER/REPO --release TAG --sha FULL_SHA --epoch UTC --publication-frozen",
    );
  const connection = connect(flags.get("--repo"));
  if (action === "evaluate") {
    await requestContractEvaluation(connection, Number(flags.get("--issue")));
    console.log("Requested current issue-contract evaluation.");
    return;
  }
  if (action === "inspect") {
    const configuration = await readContractSourceConfiguration(connection);
    const number = flags.get("--issue") ? Number(flags.get("--issue")) : null;
    if (number !== null && (!Number.isSafeInteger(number) || number < 1))
      throw new Error("Issue must be a positive integer.");
    const facts = await loadContractSources(
      connection,
      number ?? 0,
      configuration,
    );
    let result = null;
    if (number) {
      const issue = await connection.issueTracker.issue(number);
      const comments = await connection.issueTracker.comments(number);
      const events = await connection.issueTracker.labelChanges(number);
      const { state } = issueContractResult(comments);
      result = {
        state,
        current:
          state?.format === "repo-canon/issue-contract-state/v2" ||
          state?.baseFormat === "repo-canon/issue-contract-state/v2"
            ? state.observation ===
              (await readIssueContractObservation(
                connection,
                issue,
                comments,
                events,
              ))
            : null,
      };
    }
    console.log(
      JSON.stringify(
        {
          mode: facts.mode,
          cutoff: facts.cutoff ?? null,
          receipt: facts.receipt ?? null,
          result,
        },
        null,
        2,
      ),
    );
    return;
  }
  const inventory = () => contractCutoffInventory(connection);
  const receipt = await captureContractCutoff(
    connection,
    {
      release: flags.get("--release"),
      sha: flags.get("--sha"),
      epoch: flags.get("--epoch"),
      publicationFrozen: flags.get("--publication-frozen") === true,
    },
    inventory,
  );
  const cutoff = await installContractCutoff(connection, receipt, inventory);
  console.log(JSON.stringify({ mode: "body", cutoff, receipt }, null, 2));
}
if (executedAsScript(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
