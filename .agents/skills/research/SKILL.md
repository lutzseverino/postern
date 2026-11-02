---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

A prompt or brief naming this skill is its invocation.

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo's documentation rules or existing convention put such notes, such as beside the usage or development topic it serves, and add it to that directory's index, creating the index when those rules require one. If there is no such place, put it somewhere sensible and say where.

## Reads

Paths are relative to the repository root.

- The installed documentation rules, which the `repository-standards` skill
  looks up. When they are missing, follow the repository's existing convention
  for such notes, or put them somewhere sensible and say where, as step 3
  says.
- The index of the directory the notes go in, such as
  `docs/development/README.md`. When it is missing, create it only when the
  documentation rules require one.
