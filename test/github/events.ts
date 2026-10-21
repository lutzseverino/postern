// Relevant fields from GitHub's documented issues and issue_comment payloads:
// https://docs.github.com/en/webhooks/webhook-events-and-payloads#issues
// https://docs.github.com/en/webhooks/webhook-events-and-payloads#issue_comment

import type { IssueEventSeed, IssueEventVariation } from "../contract/harness.ts";

export function githubIssueEvent(seed: IssueEventSeed & { repository: string }, variation?: IssueEventVariation): { name: string; payload: Record<string, unknown> } {
  const commentActions = { commentCreated: "created", commentEdited: "edited", commentDeleted: "deleted" };
  const isComment = seed.kind in commentActions;
  const event = {
    name: isComment ? "issue_comment" : "issues",
    payload: {
      action: isComment ? commentActions[seed.kind as keyof typeof commentActions] : seed.kind,
      repository: { full_name: seed.repository },
      sender: { login: seed.actor.login, type: seed.actor.bot ? "Bot" : "User" },
      issue: { number: seed.issue, labels: (seed.openingLabels ?? []).map((name) => ({ name })) },
      ...(seed.label === undefined ? {} : { label: { name: seed.label } }),
      ...(seed.kind !== "edited" ? {} : {
        changes: seed.bodyChanged ? { body: { from: "Previous body" } } : { title: { from: "Previous title" } },
      }),
      ...(seed.comment === undefined ? {} : { comment: { ...seed.comment } }),
    },
  };
  switch (variation) {
    case "pullRequest": Object.assign(event.payload.issue, { pull_request: { url: "https://api.github.com/repos/octo/hello/pulls/42" } }); break;
    case "unsupportedAction": event.payload.action = "assigned"; break;
    case "unsupportedEvent": event.name = "push"; break;
    case "malformed": Object.assign(event.payload, { sender: { login: 42, type: "User" } }); break;
  }
  return event;
}
