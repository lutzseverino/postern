// Runs the contract suite against the GitHub adapter with its `botMarking` flag
// withdrawn. The adapter still reports `bot` as true or false, standing in for
// an adapter of a platform without bot marking that fills the field anyway, so
// every account the connection returns, from any port, must report `bot: null`.

import { createConnection } from "../../src/connection.ts";
import type { PlatformAdapter } from "../../src/connection.ts";
import { detectPlatform } from "../../src/index.ts";
import { githubAdapter } from "../../src/github/adapter.ts";
import { runAdapterContract } from "../contract/suite.ts";
import { harnessOver } from "./harness.ts";

const withoutBotMarking: PlatformAdapter = (context) => {
  const ports = githubAdapter(context);
  const { botMarking: _botMarking, ...capabilities } =
    ports.issueTracker.capabilities;
  return { ...ports, issueTracker: { ...ports.issueTracker, capabilities } };
};

runAdapterContract(
  harnessOver("GitHub without bot marking", (remote, options) =>
    createConnection(detectPlatform(remote), withoutBotMarking, options),
  ),
);
