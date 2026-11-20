# Comment rules

These rules cover everything an agent posts on issues and pull requests:
comments, reviews, review-thread replies and the bodies of issues it files, on
any account, the factory App's included. They apply to all work in the
repository, including tracker work that changes no file. Pull request titles
and bodies and commit messages follow the contribution guide's titles, commits
and attribution rules instead, except the body's Delivery subsection, which
[Delivery records](#delivery-records) shapes.

## Occasions

Any agent, whichever account it uses, and the factory post only on these
occasions, and only to record a decision, an outcome, or a question that needs
an answer, never to narrate progress. Everything to say on one occasion goes
into one comment, or for a worker handoff into the body's Delivery subsection.
The contribution guide, the `github-repository-configuration` rules and, where
installed, the `factory-workflow` rules say when each occasion arises; these
rules say what the post holds:

| Occasion                                         | Where                                       | Shape                                                               |
| ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------- |
| Agent Brief, triage notes and reporter questions | The issue or external PR being triaged      | [Disclaimers](#disclaimers)                                         |
| A question only the owner can answer             | Its issue, or its PR for work without one   | [Owner questions](#owner-questions)                                 |
| An answer, or a recorded owner decision          | The issue the question or decision concerns | [Owner questions](#owner-questions) and [Disclaimers](#disclaimers) |
| A contract-review verdict                        | The contract's issue                        | [Disclaimers](#disclaimers)                                         |
| A stop without a pull request or question        | Its issue                                   | [Stop notes](#stop-notes)                                           |
| A superseded issue's fate                        | The superseded issue                        | [Fates](#fates)                                                     |
| New evidence on an existing finding              | The finding's issue                         | [Fates](#fates)                                                     |
| An internal review round                         | The pull request                            | [Reviews](#reviews)                                                 |
| A fix or a reasoned decline of a finding         | The finding's review thread                 | [Review-thread replies](#review-thread-replies)                     |
| A review request                                 | The pull request                            | [Review request comments](#review-request-comments)                 |
| A worker handoff                                 | The pull request body's Evidence section    | [Delivery records](#delivery-records)                               |
| An owner-review designation or approval          | The pull request                            | [Delivery records](#delivery-records)                               |
| A reconstruction conflict resolution             | The pull request                            | [Delivery records](#delivery-records)                               |
| A configured reviewer that did not review a head | The pull request                            | [Delivery records](#delivery-records)                               |
| Adoption check outcomes                          | The adoption pull request                   | [Findings](#findings)                                               |
| A filed issue                                    | Its body                                    | [Disclaimers](#disclaimers) and [Findings](#findings)               |
| The factory's run, action and close comments     | The issue it runs, or the parent it closes  | [Factory comments](#factory-comments)                               |

## Lead line

Every comment, review, review-thread reply and Agent Brief starts with its lead
line, except a [review request comment](#review-request-comments), whose
section fixes its first line. Other issue bodies follow their issue form or
contract shape. The lead line is a status marker, then the
state or verdict in bold, optionally followed by facts after a middle dot
(`·`), and, only when a person must act, who must do what:

```markdown
✅ **Ready for implementation** · code-bound · priority low
👤 **Owner decides the retry limit** · @owner, answer on this issue
```

A message that names nobody needs nobody; never write that nothing is needed.
Address a person who must act by mention or by name. A question a person must
answer goes in the lead line itself.

## Status markers

The status markers are this fixed set, and the issue-contract workflow reads
an Agent Brief's lead line by them:

| Marker | Meaning             |
| ------ | ------------------- |
| ✅     | done, pass or fixed |
| 🔄     | running             |
| ⏸️     | paused              |
| ❌     | failed              |
| 🔁     | handed back or open |
| 👤     | a person must act   |
| ⬜     | not started         |
| ⏭️     | skipped             |
| ↗️     | filed elsewhere     |

A marker appears only in a lead line or a status cell, always beside a word,
and never beside a checkbox. Checkboxes stay for real checklists, such as
acceptance criteria.

## Layout

- **Collapse** notes and evidence behind `<details>`, whose `<summary>` states
  the facts a decision needs, never "More" or "Details". Owner questions,
  inferred intent and anything a person must act on or may veto stay visible.
- **Link** to text that exists elsewhere instead of copying it.
- **Alerts** appear only when a person must act (`> [!IMPORTANT]`) or a run
  failed (`> [!CAUTION]`).
- **No Mermaid** in comments; pull request bodies may keep it.
- **Limits**: the lead line holds at most 100 characters, not counting link
  URLs. Outside `<details>`, keep to about 10 lines of prose; tables,
  checklists and an Agent Brief's fields do not count. Put anything longer
  behind a link, such as the pull request body, a log or a file.

## Disclaimers

Every agent-written comment, review-thread reply and agent-filed issue body
ends with the disclosure footer as its last visible line:

```markdown
<sub>Generated by AI</sub>
```

During triage, use the triage variant instead:

```markdown
<sub>Generated by AI during triage</sub>
```

In a body-mode Agent Brief, the footer goes directly before
`## Original request`, so the preserved Original request stays verbatim
exactly once at the body's end. A [review](#reviews) carries its disclosure as
its record says.

For one release, the issue-contract workflow also accepts the former leading
triage disclaimer before an Agent Brief, alone or before its lead line, as the
`github-repository-configuration` rules' Agent Brief section says:

<!-- prettier-ignore -->
```markdown
> *This was generated by AI during triage.*
```

A factory run's run result body carries no footer or disclaimer: the factory
posts it in a frame that carries its own disclosure, and these rules neither
read nor restate that frame. A review request comment carries no disclosure,
as [Review request comments](#review-request-comments) says. Pull request
titles and bodies carry none.

## Secrets

Comments, reviews, issue and pull request titles, and their bodies never
contain secret, token, or credential values. Write `<REDACTED>` in their place.

## Owner questions

Post a question only the owner can answer as one comment on the issue the work
belongs to, linking the open pull request when there is one. Work without an
issue asks on its pull request instead. Its lead line asks the question and
addresses the owner. The contribution guide's owner-question
handoff says what the agent does once the question is posted.

An answer or recorded decision answers only the question asked, in at most 150
words, and links a decision already recorded in a repository instead of
quoting it.

## Stop notes

An agent that stops without a pull request and without an owner question
comments its lead line and one short paragraph on the issue explaining why it
stopped, in its own words. Never paste log output, environment values or tokens into that note: the
repository and repositories adopting these rules may be public.

## Fates

A superseded issue's fate is one comment on that issue, linking the
superseding specification, with one plain text `Fate:` line:

<!-- prettier-ignore -->
```markdown
✅ **Fate recorded**

Fate: <closed as superseded | rescoped | kept, with a one-line reason>
Source: <link to the superseding specification>

<sub>Generated by AI</sub>
```

A `closed as superseded` fate also closes the issue.

New evidence on an existing finding is one comment on its issue, linking the
evidence's source.

## Reviews

Post one review per round of the internal Standards and Spec reviews that the
`github-repository-configuration` rules define, as a pull request review of the
head it reviewed: a lead line, a verdict line, a findings table when there are
findings, optional evidence and the footer.

<!-- prettier-ignore -->
```markdown
🔁 **Round 2 hands back: 1 open finding, 1 fixed.** Implement fixes the open ones on this PR.

**Standards** ✅ Pass · **Spec** ❌ Fail, <note>

| Axis | Where | Finding | State |
| ---- | ----- | ------- | ----- |
| Spec | `<path>:<line>` | <the finding> | 🔁 Open |
| Standards | `<path>:<line>` | <the finding> | ✅ Fixed in <commit> |
| Standards | `<path>:<line>` | <the finding> | ↗️ Filed <issue> |

<sub>Generated by AI · round 2 · head <full head SHA></sub>
```

- **Lead line:** a round with no open finding holds and leads with
  `✅ **Round N holds: no findings.** Merging.`, or with
  `no open findings, <n> fixed` when it fixed some; that line records the
  merge, so no merge comment follows. A hand-back leads with 🔁, a failed round with
  ❌ and a grill's round with 👤.
- **Verdict line:** each axis is `✅ Pass` or `❌ Fail`, optionally with a
  comma and a short note; an axis fails only with an open finding.
- **Findings table:** one row per finding: its axis, code-formatted
  `path:line`, the finding and `🔁 Open`, `✅ Fixed in <commit>` for this
  round's fix, or `↗️ Filed <issue>` for one filed under the contribution
  guide's Findings section. Omit it without findings.
- **Evidence:** optional, behind `<details>` as Layout says.
- **Footer:** the round and the reviewed head's full SHA, with no provider or
  model. It is the disclosure and closes the review; only a reassessment's
  quoted history follows it.

A round holds exactly when no row is Open. The head comes from the footer, and
no part counts inside a fence, a quote or an HTML comment, or with an unfilled
placeholder. If a holding round's merge fails, stop as the `factory-workflow`
rules say, where installed, naming the issue's next state.

For one release, readers also accept the former record's `Head:`,
`Standards:`, `Spec:`, `Fixed:` and `Findings:` lines, each once, with
`path:line` finding items. Post only the shape above.

For an unchanged-head reassessment after a settled contract finding, update
the existing review with the actual reassessed outcomes. In the Spec note,
name the resolved finding, link the recorded decision and drop its row. Retain
the previous assessment as quoted history below the footer so the finding
stays traceable without remaining open.

A finding may also open a review thread on its line. Findings and their fix
discussion stay on the pull request, in reviews and review threads.

## Review-thread replies

Answer each review thread in that thread, with its fix or a reasoned decline
as the contribution guide's Merging section requires.

## Review request comments

Write the configured reviewer's request phrase only in a comment that requests
a review. That comment holds exactly the `request.comment` of the reviewer file
that the `github-repository-configuration` rules describe, with no disclosure.
The phrase never appears in prose, quotations, or code spans in any other
comment, issue or pull request title, or body. To mention the request, describe
it as "the review request comment".

## Delivery records

A worker handoff is the pull request body's delivery record: a `### Delivery`
subsection at the end of its Evidence section. The implementing worker writes
it when opening the pull request, updates it on every push so it describes the
current head, and posts no delivery-record comment:

```markdown
### Delivery

- **Head:** <full head SHA>
- **Required checks:** <names and outcomes> · <location> · `<required command>` · declaration <trusted revision>
- **Validation:** <commands run and their outcomes>
- **Findings:** <None, or each out-of-scope note and issue opened for one>
```

Add a line for internal review outcomes, an owner-review requirement with its
source, or a refused read the run continued past, with the record the
contribution guide's Credentials section requires, whenever one applies. Link
opened issues without closing keywords, so the merge closes none of them. An
adoption pull request's body stays its adoption record, so its worker handoff
is one pull request comment holding the same record.

Each other delivery record that the `github-repository-configuration` or
`factory-workflow` rules require is one pull request comment:

- A conflict-resolution record names, for every resolved file, what each side
  contributed and confirms both were kept, any recomputed derived value and
  the command or check that produced it, and why no choice between the sides
  was needed.
- An owner-review designation record names the designation and its source. An
  approval record names the approval's source and the full head SHA it
  approves.
- When the configured reviewer did not review the head being merged, the
  merging agent records that and why. For a head with no request after its
  push, it says whether the request rule required none or the bound was reached.

## Findings

Out-of-scope notes go where the contribution guide's Findings section says,
never in a comment of their own. An adoption pull request's check-outcomes
comment holds what its adoption rules list. A review lists an issue it opens as
a [Filed row](#reviews), and a factory-filed issue's body cites its filing run.

## Factory comments

In a repository a factory serves, issues stay clean. Beyond its contract and
triage notes, an issue carries the factory's run comment and action comments,
and a parent its close notice. An agent posts on an issue only when a person
must act or has acted: a question for the owner, a reporter or a grill, its
answer or recorded decision, a contract-review verdict, a stop note, or a
[fate or new evidence](#fates).
Reviews, delivery records and fix discussion go on the pull request.

The factory keeps one run comment on each issue it runs and edits it in place;
agents never post or edit a run comment. The factory posts a fresh one-line
action comment, linking the run comment and without mentions, only when a
person must act: a grill, owner or reporter stop, a failure or a reached gate.
The factory posts no comment of its own on a pull request.
