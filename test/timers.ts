// Mocked timers for requests that wait between attempts, so their waits pass
// without real time.

import { mock } from "node:test";
import { setImmediate } from "node:timers/promises";

/**
 * Runs `operation` with `setTimeout` and `Date` mocked from time 0, moving
 * the clock on 100 ms at a time between turns of the event loop until the
 * operation settles.
 */
export async function withoutWaits<T>(operation: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    let outcome: PromiseSettledResult<T> | undefined;
    operation().then(
      (value) => (outcome = { status: "fulfilled", value }),
      (reason: unknown) => (outcome = { status: "rejected", reason }),
    );
    while (!outcome) {
      await setImmediate();
      mock.timers.tick(100);
    }
    if (outcome.status === "rejected") throw outcome.reason;
    return outcome.value;
  } finally {
    mock.timers.reset();
  }
}
