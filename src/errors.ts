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
  /** When a `rateLimited` quota resets, as an ISO 8601 time, when the platform states it. */
  retryAt?: string;
  /** The platform's HTTP status, when a response caused the failure. */
  status?: number;
  cause?: unknown;
}

/** A failed platform operation. Its message, cause and fields never hold a credential. */
export class PlatformError extends Error {
  override readonly name = "PlatformError";
  readonly reason: PlatformErrorReason;
  readonly retryAt?: string;
  readonly status?: number;

  constructor(reason: PlatformErrorReason, message: string, options: PlatformErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    if (!platformErrorReasons.includes(reason)) {
      throw new TypeError(`Unknown platform error reason: ${String(reason)}`);
    }
    this.reason = reason;
    if (options.retryAt !== undefined) this.retryAt = options.retryAt;
    if (options.status !== undefined) this.status = options.status;
  }
}
