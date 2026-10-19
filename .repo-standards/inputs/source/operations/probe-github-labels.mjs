import {
  labelManagementRole,
  probeGithubSetup,
} from "./lib/github-operation.mjs";

probeGithubSetup("GitHub label setup", labelManagementRole);
