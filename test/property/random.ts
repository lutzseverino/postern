// A small seeded generator for the property tests. Runs use a fixed seed, so
// CI is deterministic. `POSTERN_PROPERTY_SEED` names another seed, or `random`
// for a new one each run, and `POSTERN_PROPERTY_RUNS` the number of cases per
// property. A failing case names the seed and case number that reproduce it.

const fixedSeed = 20261019;
const defaultRuns = 200;

export const seed = readSeed(process.env.POSTERN_PROPERTY_SEED);
export const runs = readRuns(process.env.POSTERN_PROPERTY_RUNS);

function readSeed(value: string | undefined): number {
  if (value === undefined || value === "") return fixedSeed;
  if (value === "random") return Math.floor(Math.random() * 2 ** 32);
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number >= 2 ** 32) {
    throw new Error(
      "POSTERN_PROPERTY_SEED is an integer from 0 to 4294967295, or random.",
    );
  }
  return number;
}

function readRuns(value: string | undefined): number {
  if (value === undefined || value === "") return defaultRuns;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1)
    throw new Error("POSTERN_PROPERTY_RUNS is a positive integer.");
  return number;
}

/** A deterministic random source (mulberry32). */
export class Random {
  #state: number;

  constructor(state: number) {
    this.#state = state >>> 0;
  }

  /** A number from 0 up to, not including, 1. */
  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  }

  /** An integer from 0 up to, not including, `limit`. */
  below(limit: number): number {
    return Math.floor(this.next() * limit);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Nothing to pick from.");
    return items[this.below(items.length)]!;
  }

  /** A string of up to `longest` pieces from `alphabet`. */
  text(alphabet: readonly string[], longest: number): string {
    return Array.from({ length: this.below(longest + 1) }, () =>
      this.pick(alphabet),
    ).join("");
  }
}

/** The random source of one case of one property, independent of every other case. */
export function caseRandom(property: string, index: number): Random {
  let hash = seed ^ 0x811c9dc5;
  for (const character of `${property}#${index}`)
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return new Random(hash);
}

/** How to reproduce one case. */
export const reproduce = (property: string, index: number) =>
  `property "${property}", case ${index}; rerun with POSTERN_PROPERTY_SEED=${seed}`;
