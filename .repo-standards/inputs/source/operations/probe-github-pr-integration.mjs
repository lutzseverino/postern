import {
  probeGithubSetup,
  repositoryAdministrationRole,
} from "./lib/github-operation.mjs";

probeGithubSetup("GitHub PR integration setup", repositoryAdministrationRole);
