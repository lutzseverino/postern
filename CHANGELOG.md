# Changelog

## 1.2.0

- Comment events report the comment's global API identifier as
  `IssueEvent.comment.nodeId`, including after deletion. The GitHub adapter
  reads `comment.node_id` from the payload without requests. An absent value
  reports `null`; a present malformed value fails with `invalidResponse`
  without an HTTP status. Results receive the usual token redaction.
- The declaration field is optional for compatibility with 1.1.0 producers
  and test doubles that return `{ id, body }`. Every adapter result sets it.
