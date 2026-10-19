// Reading what callers pass in. Every object the public API accepts, such as
// a repository identity, options, an argument or a request, is read here once
// into a plain copy, and only that copy is checked and used. A getter or a
// Proxy therefore cannot pass a check with one value and then give another,
// and one that throws when read, or a revoked Proxy, fails with `rejected`.

import { PlatformError } from "./errors.ts";

/** Each named field of an object, read once. Anything but an object fails with `message`. */
export function fields<Name extends string>(value: unknown, names: readonly Name[], message: string): Record<Name, unknown> {
  if (value === null || typeof value !== "object") reject(message);
  const copy = Object.create(null) as Record<Name, unknown>;
  for (const name of names) copy[name] = read(() => (value as Record<Name, unknown>)[name]);
  return copy;
}

/**
 * The items of an array, its length and each item read once. Anything but an
 * array, or one with holes or extra fields, fails with `message`.
 */
export function items(value: unknown, message: string): unknown[] {
  if (!read(() => Array.isArray(value))) reject(message);
  const array = value as unknown[];
  const length = read(() => array.length);
  const keys = read(() => Object.keys(array).length);
  if (!Number.isSafeInteger(length) || keys !== length) reject(message);
  return Array.from({ length }, (_, index) => read(() => array[index]));
}

/**
 * The own enumerable fields of a plain object, each read once. Anything but a
 * plain object, or one with an enumerable symbol key, fails with `message`.
 */
export function entries(value: unknown, message: string): [string, unknown][] {
  if (!read(() => isPlainObject(value))) reject(message);
  const object = value as Record<PropertyKey, unknown>;
  const result: [string, unknown][] = [];
  for (const key of read(() => Reflect.ownKeys(object))) {
    if (!read(() => Reflect.getOwnPropertyDescriptor(object, key))?.enumerable) continue;
    if (typeof key === "symbol") reject(message);
    result.push([key, read(() => object[key])]);
  }
  return result;
}

/** Whether a value is an array or object as JSON writes it: a plain array, a plain object, or neither. */
export function shape(value: unknown): "array" | "object" | null {
  return read(() => {
    if (Array.isArray(value)) return Object.getPrototypeOf(value) === Array.prototype ? "array" : null;
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

function reject(message: string): never {
  throw new PlatformError("rejected", message);
}
