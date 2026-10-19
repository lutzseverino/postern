// Repository data determines requests, completion and bounded review waits.
const requestComments = (comments, reviewer) =>
  comments.filter(
    (comment) => comment.body.trim() === reviewer.request.comment,
  );

export const reviewRequestedAt = (openedAt, comments, reviewer) => {
  if (!reviewer) return null;
  const requests = requestComments(comments, reviewer).map((comment) =>
    Date.parse(comment.createdAt),
  );
  if (reviewer.request.onOpen) requests.push(openedAt);
  return requests.length ? Math.max(...requests) : null;
};

export const reviewerState = (
  reviewer,
  { head, requestedAt, pushedAt, comments, reviews = [], now },
) => {
  if (
    reviews.some(
      (review) =>
        review.user?.login === reviewer.account &&
        review.commit_id === head &&
        review.state !== "PENDING" &&
        (review.state === "APPROVED" ||
          review.state === "CHANGES_REQUESTED" ||
          Boolean(review.body?.trim()) ||
          review.comments?.some((comment) => comment.in_reply_to_id == null)),
    )
  )
    return "reviewed";
  const replies = comments.filter(
    (comment) => comment.login === reviewer.account,
  );
  if (reviewer.finished && requestedAt !== null) {
    const linePattern = new RegExp(reviewer.finished.line, "u");
    const finished = replies
      .filter((comment) =>
        comment.body.includes(reviewer.finished.commentMarker),
      )
      .some((comment) =>
        comment.body.split("\n").some((line) => {
          const groups = linePattern.exec(line)?.groups;
          return (
            groups?.sha &&
            head.startsWith(groups.sha) &&
            Date.parse(groups.at) >= requestedAt
          );
        }),
      );
    if (finished) return "reviewed";
  }
  if (requestedAt === null) return "not requested";
  // GitHub times have second resolution, so a same-second reply responds.
  const responses = replies.filter(
    (comment) =>
      Date.parse(comment.createdAt) >= requestedAt &&
      comment.body.trim() !== reviewer.request.comment,
  );
  if (
    replies.some(
      (comment) =>
        Date.parse(comment.createdAt) >= requestedAt &&
        reviewer.unavailable.some((reply) => comment.body.includes(reply)),
    )
  )
    return "unavailable";
  if (pushedAt > requestedAt) {
    const requests =
      Number(reviewer.request.onOpen) +
      requestComments(comments, reviewer).length;
    return requests >= reviewer.bounds.reviewRequests
      ? "request bound reached"
      : "not requested";
  }
  const waited = now - requestedAt;
  if (
    responses.length === 0 &&
    waited >= reviewer.bounds.responseMinutes * 60_000
  )
    return "no response";
  if (waited >= reviewer.bounds.reviewMinutes * 60_000) return "not reviewing";
  return "pending";
};

export const reviewerPhrase = (reviewer, state) =>
  ({
    reviewed: "reviewer reviewed",
    unavailable: "reviewer unavailable",
    "not requested": "review not requested for this head",
    "request bound reached": `review not requested for this head; review request bound reached (${reviewer.bounds.reviewRequests})`,
    "no response": `reviewer did not respond within ${reviewer.bounds.responseMinutes} minutes`,
    "not reviewing": `reviewer did not review within ${reviewer.bounds.reviewMinutes} minutes`,
    pending: "review pending",
  })[state];
