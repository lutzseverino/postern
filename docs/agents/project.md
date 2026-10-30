# Postern project guidance

## Consumer neutrality

Postern is consumer-agnostic: describe it by its own capabilities, using generic
consumer language in explanations and examples. Content Postern authors must
never name a consumer of Postern. This applies to the repository description,
README and docs, ADRs, package metadata, code comments, examples and tests.

Files installed by adopted standards follow their own source and are outside
this rule's scope.

The [facts-only ports decision](../adr/0001-facts-only-ports-with-platform-adapters.md)
provides the architectural basis: Postern reports platform facts; consumers own
policy decisions and relationship conventions.
