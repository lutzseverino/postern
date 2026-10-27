import {
  probeGithubSetup,
  repositoryAdministrationRole,
} from "./lib/github-operation.mjs";

await probeGithubSetup(
  "GitHub PR integration setup",
  repositoryAdministrationRole,
);
