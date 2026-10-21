// The one error type every Postern failure surfaces as, with its closed set
// of reasons.

/** Why a platform operation failed. The set is closed. */
export type PlatformErrorReason =
  | "unauthenticated"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "rejected"
  | "rateLimited"
  | "unavailable"
  | "invalidResponse"
  | "unsupported";

/** Every reason a {@link PlatformError} can carry. */
export const platformErrorReasons: readonly PlatformErrorReason[] = Object.freeze([
  "unauthenticated",
  "forbidden",
  "notFound",
  "conflict",
  "rejected",
  "rateLimited",
  "unavailable",
  "invalidResponse",
  "unsupported",
]);

export interface PlatformErrorOptions {
  /** When a `rateLimited` request may be retried, as an ISO 8601 time, when the platform states it. */
  retryAt?: string;
  /** The HTTP status of the response whose reading raised the failure, when one did. */
  status?: number;
  /** The platform's own failure message, with credentials removed, when stated. */
  platformMessage?: string;
  cause?: unknown;
}

/** A failed platform operation. Its message, cause and fields never hold a credential. */
export class PlatformError extends Error {
  override readonly name = "PlatformError";
  readonly reason: PlatformErrorReason;
  readonly retryAt?: string;
  readonly status?: number;
  readonly platformMessage?: string;

  constructor(reason: PlatformErrorReason, message: string, options: PlatformErrorOptions = {}) {
    const { retryAt, status, platformMessage, cause } = options;
    super(message, cause === undefined ? undefined : { cause });
    if (!platformErrorReasons.includes(reason)) {
      throw new TypeError(`Unknown platform error reason: ${String(reason)}`);
    }
    this.reason = reason;
    if (retryAt !== undefined) this.retryAt = retryAt;
    if (status !== undefined) this.status = status;
    if (platformMessage !== undefined) this.platformMessage = platformMessage;
  }
}
