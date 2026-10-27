import {
  labelManagementRole,
  probeGithubSetup,
} from "./lib/github-operation.mjs";

await probeGithubSetup("GitHub label setup", labelManagementRole);
