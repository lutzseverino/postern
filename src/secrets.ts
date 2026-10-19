// Credential sources, and keeping every credential they yield out of errors
// and results.

import { PlatformError } from "./errors.ts";

/** A token, or a function returning one each time Postern needs it. */
export type CredentialSource =
  | string
  | (() => string | null | undefined | Promise<string | null | undefined>);

const replacement = "<REDACTED>";

/** Every credential a connection has used, and the means to remove them from values. */
export class Secrets {
  readonly #values = new Set<string>();

  add(value: string): void {
    if (value) this.#values.add(value);
  }

  // Finds every occurrence of every credential in the original text and
  // replaces overlapping ones as one span, so no fragment of a credential that
  // extends, contains or overlaps another survives.
  redactText(text: string): string {
    const spans: [start: number, end: number][] = [];
    for (const value of this.#values) {
      for (let at = text.indexOf(value); at !== -1; at = text.indexOf(value, at + 1)) {
        spans.push([at, at + value.length]);
      }
    }
    spans.sort((a, b) => a[0] - b[0]);
    let result = "";
    let cursor = 0;
    for (const [start, end] of spans) {
      if (start < cursor) {
        cursor = Math.max(cursor, end);
        continue;
      }
      result += text.slice(cursor, start) + replacement;
      cursor = end;
    }
    return result + text.slice(cursor);
  }

  /** A copy of a JSON-like value with every credential replaced. */
  redact<T>(value: T): T {
    if (this.#values.size === 0) return value;
    return this.#redactValue(value) as T;
  }

  #redactValue(value: unknown): unknown {
    if (typeof value === "string") return this.redactText(value);
    if (Array.isArray(value)) return value.map((item) => this.#redactValue(item));
    if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [this.redactText(key), this.#redactValue(item)]),
      );
    }
    return value;
  }

  /** The error as a `PlatformError` whose message, cause and fields hold no credential. */
  sanitize(error: unknown): PlatformError {
    if (isPlatformError(error)) {
      return new PlatformError(error.reason, this.redactText(error.message), {
        ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }),
        ...(error.status === undefined ? {} : { status: error.status }),
        ...(error.cause === undefined ? {} : { cause: this.#sanitizeCause(error.cause) }),
      });
    }
    return new PlatformError("invalidResponse", "The platform adapter could not read a response.", {
      cause: this.#sanitizeCause(error),
    });
  }

  // A foreign cause, such as what a `fetch` threw, is read once, and one that
  // cannot be read is described without any of it.
  #sanitizeCause(cause: unknown): Error {
    if (isPlatformError(cause)) return this.sanitize(cause);
    let message: string;
    let name: string | undefined;
    try {
      const error = cause instanceof Error;
      message = String(error ? cause.message : cause);
      name = error ? String(cause.name) : undefined;
    } catch {
      return new Error("An error that could not be read.");
    }
    const sanitized = new Error(this.redactText(message));
    if (name !== undefined) sanitized.name = this.redactText(name);
    return sanitized;
  }
}

function isPlatformError(value: unknown): value is PlatformError {
  try {
    return value instanceof PlatformError;
  } catch {
    return false;
  }
}

/** Yields the token for each request, or `null` for an anonymous connection. */
export interface Credentials {
  readonly anonymous: boolean;
  token(): Promise<string | null>;
}

export function credentialsFrom(source: CredentialSource | undefined, secrets: Secrets): Credentials {
  if (source === undefined) return { anonymous: true, token: async () => null };
  if (typeof source === "string") {
    secrets.add(source);
    return { anonymous: false, token: async () => source };
  }
  return {
    anonymous: false,
    async token() {
      let token: unknown;
      try {
        token = await source();
      } catch {
        // The source's own error may describe the credential, so none of it is kept.
        throw new PlatformError("unauthenticated", "The credential source failed to supply a token.");
      }
      if (typeof token !== "string" || token === "") {
        throw new PlatformError("unauthenticated", "The credential source supplied no token.");
      }
      if (!isSendableToken(token)) {
        throw new PlatformError("rejected", "The credential source supplied a token that cannot be sent in a request header.");
      }
      secrets.add(token);
      return token;
    },
  };
}

/**
 * Whether a token can be sent in a request header as it is. One with an
 * unpaired surrogate or a line break would make `fetch` refuse the request.
 */
export function isSendableToken(token: string): boolean {
  if (!token.isWellFormed()) return false;
  try {
    new Headers({ authorization: `Bearer ${token}` });
    return true;
  } catch {
    return false;
  }
}
