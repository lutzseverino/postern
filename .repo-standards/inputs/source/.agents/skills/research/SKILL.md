---
name: research
description: Investigate a question against high-trust primary sources and publish the assigned artifact, defaulting to a Markdown findings file in the repo. Use for topic research, docs or API facts, and delegated investigation, including triage research runs.
---

A prompt or brief naming this skill is its invocation.

Perform the investigation in the current run, including when another run delegated it to you.

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. When the task assigns an artifact and destination, publish the findings there, citing each claim's source. For an assigned issue artifact, publication is complete on the issue; no repository findings file or index edit is needed. Post an issue or pull request artifact as `.repo-standards/rules/comments.md#disclaimers` says.
3. Otherwise, write the findings to a single Markdown file, citing each claim's source. Save it where the repo's documentation rules or existing convention put such notes, such as beside the usage or development topic it serves, and add it to that directory's index, creating the index when those rules require one. If there is no such place, put it somewhere sensible and say where.

## Reads

Paths are relative to the repository root.

- The installed documentation rules, which the `repository-standards` skill
  looks up. When they are missing, follow the repository's existing convention
  for such notes, or put them somewhere sensible and say where, as step 3
  says.
- The index of the directory the notes go in, such as
  `docs/development/README.md`. When it is missing, create it only when the
  documentation rules require one.
- `.repo-standards/rules/comments.md`: the installed comment rules, whose
  section the posting steps name. When it is missing, post issue bodies and
  comments as the steps describe.
