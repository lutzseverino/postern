# Changelog

## Unreleased

- The GitHub adapter retries a read that fails `unavailable`: a rejected
  `fetch`, a timeout, or a 5xx, 408, 421 or 425 status. It retries at most
  twice, waiting 1 s and then 2 s, only while the wait ends within
  `timeoutMs`, which now bounds a request's attempts and waits together. A
  read is a REST GET or HEAD, or a GraphQL document of queries alone, which
  includes every typed GraphQL read and an `access.request` POST to
  `/graphql`. A REST write, a GraphQL mutation or subscription, and a
  GraphQL document Postern cannot read as queries alone are sent once. A
  rate limit keeps `rateLimited` and is not retried. A read that stays
  unavailable still fails with `unavailable`. No option changes.

## 1.2.0

- Comment events report the comment's global API identifier as
  `IssueEvent.comment.nodeId`, including after deletion. The GitHub adapter
  reads `comment.node_id` from the payload without requests. An absent value
  reports `null`; a present malformed value fails with `invalidResponse`
  without an HTTP status. Results receive the usual token redaction.
- The declaration field is optional for compatibility with 1.1.0 producers
  and test doubles that return `{ id, body }`. Every adapter result sets it.
