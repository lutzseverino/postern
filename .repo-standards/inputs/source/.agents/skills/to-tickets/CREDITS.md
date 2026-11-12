# Credits

This skill is Repo Canon's own, taken from the `to-tickets` skill in [Matt Pocock's skills](https://github.com/mattpocock/skills). Its upstream base is tag `v1.3.1`, commit `24fe0ef7737efae15c87225755e9f6f5965e4888`, at [`skills/engineering/to-tickets`](https://github.com/mattpocock/skills/tree/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/to-tickets). That material is used under its MIT License, whose notice follows at the end of this file; adoption also installs it beside the skills. The skill differs from its upstream base: `SKILL.md` states that a prompt or brief naming the skill is its invocation. It adds a Reads section, which lists the repository files the skill reads and what it does when each is missing. It also drops both routes to `setup-matt-pocock-skills`. Expand–contract batches that cannot each stay green become one ticket instead of sharing an integration branch, since every ticket merges on its own with its checks passing. On a real tracker, parent and blocker links are native only, and a link that cannot be created is reported instead of written into the body. Tickets are published awaiting an independent readiness review instead of carrying `ready-for-agent`, and the local ticket template's status is `state:triage`. Work that must be shown on a live system splits into a source ticket and a live-acceptance ticket that no merge closes, and nobody edits a ready ticket to record progress. Each step that publishes an issue body or posts a comment on a hosted tracker names the installed comment rules' section to read first. It replaces the owner breakdown quiz with evidence for independent split review and the orchestrating agent’s final split authority. Grill publication uses one specification parent across responsible repositories, copies dated decisions and quoted words, reports exact native-link failures, applies the full inference boundary and handles authorized delta amendments with renewed exact-revision readiness.

## License notices

```text
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
