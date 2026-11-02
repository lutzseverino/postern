# Credits

This skill is Repo Canon's own, taken from the `triage` skill in [Matt Pocock's skills](https://github.com/mattpocock/skills). Its upstream base is tag `v1.3.1`, commit `24fe0ef7737efae15c87225755e9f6f5965e4888`, at [`skills/engineering/triage`](https://github.com/mattpocock/skills/tree/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/triage). That material is used under its MIT License, whose notice follows at the end of this file; adoption also installs it beside the skills.

The skill differs from its upstream base as follows. `SKILL.md` states that a prompt or brief naming the skill is its invocation. `OUT-OF-SCOPE.md` and `agents/openai.yaml` are unchanged from it. `SKILL.md` keeps upstream's roles, invocation, discovery buckets, outcomes, and templates, except that `needs-info` means missing information that the orchestrating agent answers or routes, and `ready-for-human` means work that needs the owner's own accounts or credentials, or a taste call the owner reserved. It replaces the single triage procedure with routing by uncertainty: research and independent acceptance for code-bound requests, and for intent-bound ones fact-finding, inference the orchestrating agent can cite, and a grilling session with the owner that drafts the briefs. It routes every question through the orchestrating agent, with its decision inbox as the one channel to the owner. It also points the label mapping and meanings at the installed triage label configuration instead of the setup skill, phrases the disclaimer as a method step, adds who does what, notes that a quick state override is the maintainer's own review applied through the readiness command, and has acceptance choose between `ready-for-agent`, `ready-for-agent` with the factory's skip label, and `ready-for-human`. It adds a Reads section, which lists the repository files the skill and `ready.mjs` read and what each does when a file is missing, and names the contribution guide's account policy instead of linking it by a path outside the skill. `AGENT-BRIEF.md` keeps upstream's principles, template, and examples, and adds the decisions principle and the triage notes.

`ready.mjs` is Repo Canon's original readiness acceptance command. The acceptance step calls it to apply the reviewed revision and confirm the validator recorded it.

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
