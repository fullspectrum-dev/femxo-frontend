import type { PaymentOutcome } from "../contracts/commerce";
import type { Clock } from "../lib/clock";
import type { ForcedOutcome } from "../adapters/mock/mock-adapter";

/** The parts of the running mock the controls act on; bound late, since the adapter is built with `controls.chaos`. */
export interface DemoTarget {
  forceNext(outcome: ForcedOutcome): void;
  clock: Clock;
  reload(): void;
  resetStores(): Promise<void>;
  /** Leaves one fewer of each carted item in stock than the cart holds. */
  shortStockInCarts(): Promise<void>;
}

export interface DemoSnapshot {
  chaos: boolean;
  nextPayment: PaymentOutcome | null;
  clockOffsetMs: number;
}

/** About one read in five fails while chaos is on: enough to see error states without making the demo unusable. */
const CHAOS_FAILURE_RATE = 0.2;

/**
 * The demo panel's levers: random failures, one-shot forced outcomes, the
 * mock clock and a reset. Dev and demo builds only; nothing here exists in
 * `http` mode.
 */
export function createDemoControls(target: () => DemoTarget) {
  let chaosOn = false;
  let nextPayment: PaymentOutcome | null = null;
  let snapshot: DemoSnapshot = { chaos: false, nextPayment: null, clockOffsetMs: 0 };
  const listeners = new Set<() => void>();

  // A new object per change, so useSyncExternalStore can tell something moved.
  const publish = () => {
    snapshot = { chaos: chaosOn, nextPayment, clockOffsetMs: target().clock.offset() };
    listeners.forEach((listener) => listener());
  };

  return {
    /** Pass to the mock adapter as its `chaos` option. */
    chaos: () => ({ enabled: chaosOn, failureRate: CHAOS_FAILURE_RATE }),
    setChaos(enabled: boolean) {
      chaosOn = enabled;
      publish();
    },
    forceNext: (outcome: ForcedOutcome) => target().forceNext(outcome),
    /** So the next order for what is in the carts is refused for stock (409), as if someone else bought it first. */
    shortStockInCarts: () => target().shortStockInCarts(),
    setNextPayment(outcome: PaymentOutcome | null) {
      nextPayment = outcome;
      publish();
    },
    /** The payment handler calls this: the chosen outcome applies once, then payments behave normally again. */
    takeNextPayment() {
      const outcome = nextPayment;
      if (outcome !== null) {
        nextPayment = null;
        publish();
      }
      return outcome;
    },
    advanceClock(ms: number) {
      target().clock.advance(ms);
      publish();
    },
    resetClock() {
      target().clock.reset();
      publish();
    },
    async reset() {
      // The clock goes first: the fresh seed is dated from it.
      target().clock.reset();
      await target().resetStores();
      target().reload();
      nextPayment = null;
      publish();
    },
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type DemoControls = ReturnType<typeof createDemoControls>;
