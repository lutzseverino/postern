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
    if (error instanceof PlatformError) {
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

  #sanitizeCause(cause: unknown): Error {
    if (cause instanceof PlatformError) return this.sanitize(cause);
    const sanitized = new Error(this.redactText(cause instanceof Error ? cause.message : String(cause)));
    if (cause instanceof Error) sanitized.name = this.redactText(String(cause.name));
    return sanitized;
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
      secrets.add(token);
      return token;
    },
  };
}
