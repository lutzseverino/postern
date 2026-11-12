# Comment rules adoption guidance

Confirm an intentionally empty scope for `comments`: no content paths or
directories. Adoption installs its rules for the whole repository.

## Comment reconciliation

When updating from a release that kept comment rules in `CONTRIBUTING.md`, the
`factory-workflow` rules or the `github-repository-configuration` rules, review
the installed `comments` rules as their new home: occasions, disclaimers,
owner questions, stop notes, reviews, review request comments, delivery
records and factory comments. The exact contribution guide is replaced by
adoption; preserve useful repository-specific instructions through
`project-agent-guidance` rather than copying comment rules back into it.

The internal review a policy-skipped pull request needs before merge is now
the review that the installed rules' Reviews section describes, posted as a
pull request review. A pull request whose last internal review outcome is a
comment in the earlier record shape needs that review of its current head
before `babysit` merges it.

Assess `comments` as `satisfied` once the installed rules and the
repository's tracker practice agree, citing the reviewed issues and pull
requests and any reconciliation. A repository with no current tracker activity
can cite that absence and the installed rules. If an unresolved conflict
prevents conformance, assess it as `blocked` and explain the conflict. Confirm
scope validity after fixes and again after contextual work: it stays empty
because the declaration governs work, not project content.
