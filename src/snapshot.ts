// Reading what callers pass in. Every object the public API accepts, such as
// a repository identity, options, an argument or a request, is read here once
// into a plain copy, and only that copy is checked and used. A getter or a
// Proxy therefore cannot pass a check with one value and then give another,
// and one that throws when read, or a revoked Proxy, fails with `rejected`.

import { PlatformError } from "./errors.ts";

/** Each named field of an object, read once. Anything but an object fails with `message`. */
export function fields<Name extends string>(
  value: unknown,
  names: readonly Name[],
  message: string,
): Record<Name, unknown> {
  if (value === null || typeof value !== "object") reject(message);
  const copy = Object.create(null) as Record<Name, unknown>;
  for (const name of names)
    copy[name] = read(() => (value as Record<Name, unknown>)[name]);
  return copy;
}

/**
 * The items of an array, its length and each item read once. Anything but an
 * array, or one with holes or any own field besides its items and `length`,
 * such as a named or symbol-keyed one, fails with `message`.
 */
export function items(
  value: unknown,
  message: string,
  reason: "rejected" | "invalidResponse" = "rejected",
): unknown[] {
  if (!read(() => Array.isArray(value))) reject(message, reason);
  const array = value as unknown[];
  const length = read(() => array.length);
  if (!Number.isSafeInteger(length)) reject(message, reason);
  const keys = read(() => Reflect.ownKeys(array));
  if (keys.length !== length + 1) reject(message, reason);
  for (const key of keys) {
    if (key !== "length" && !(typeof key === "string" && isIndex(key, length)))
      reject(message, reason);
  }
  return Array.from({ length }, (_, index) => read(() => array[index]));
}

// Whether a key names an item of an array of this length, written as JavaScript writes an index.
function isIndex(key: string, length: number): boolean {
  return /^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) < length;
}

/**
 * The own enumerable fields of a plain object, each read once. Anything but a
 * plain object, or one with an enumerable symbol key, fails with `message`.
 */
export function entries(
  value: unknown,
  message: string,
  reason: "rejected" | "invalidResponse" = "rejected",
): [string, unknown][] {
  if (!read(() => isPlainObject(value))) reject(message, reason);
  const object = value as Record<PropertyKey, unknown>;
  const result: [string, unknown][] = [];
  for (const key of read(() => Reflect.ownKeys(object))) {
    if (!read(() => Reflect.getOwnPropertyDescriptor(object, key))?.enumerable)
      continue;
    if (typeof key === "symbol") reject(message, reason);
    result.push([key, read(() => object[key])]);
  }
  return result;
}

/** Whether a value is an array or object as JSON writes it: a plain array, a plain object, or neither. */
export function shape(value: unknown): "array" | "object" | null {
  return read(() => {
    if (Array.isArray(value))
      return Object.getPrototypeOf(value) === Array.prototype ? "array" : null;
    return isPlainObject(value) ? "object" : null;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// The caller's own error may describe a credential, so none of it is kept.
function read<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    throw new PlatformError("rejected", "A value passed in could not be read.");
  }
}

function reject(
  message: string,
  reason: "rejected" | "invalidResponse" = "rejected",
): never {
  throw new PlatformError(reason, message);
}

/** A parsed event payload, copied before the adapter reads its platform fields. */
export function payloadCopy(
  value: unknown,
  copies = new Map<object, unknown>(),
  ancestors = new Set<object>(),
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value))
    throw new PlatformError("invalidResponse", "An event payload has a cycle.");
  if (copies.has(value)) return copies.get(value);
  const kind = shape(value);
  if (kind === null)
    throw new PlatformError(
      "invalidResponse",
      "An event payload holds an unreadable object.",
    );
  ancestors.add(value);
  try {
    const copy =
      kind === "array"
        ? items(
            value,
            "An event payload holds an unreadable array.",
            "invalidResponse",
          ).map((item) => payloadCopy(item, copies, ancestors))
        : Object.fromEntries(
            entries(
              value,
              "An event payload holds an unreadable object.",
              "invalidResponse",
            ).map(([key, item]) => [key, payloadCopy(item, copies, ancestors)]),
          );
    copies.set(value, copy);
    return copy;
  } finally {
    ancestors.delete(value);
  }
}
