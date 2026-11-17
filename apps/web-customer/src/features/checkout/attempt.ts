import { idempotencyKey } from "@femxo/shared";
import type { CheckoutInput } from "@femxo/shared/api";

/** What the server compares an Idempotency-Key against (address, method, cart revision), plus the total the customer was shown. */
export const signatureOf = (input: CheckoutInput) => `${input.addressId}|${input.paymentMethod}|${input.cartRev}|${input.expectedTotalPaise ?? ""}`;

/**
 * One checkout attempt, one Idempotency-Key. Pressing "Place order" twice, or again after a dropped connection, sends the SAME key and
 * so gets the same order back; changing the address, the method or the cart is a different request and takes a new key (the server
 * refuses one key for two different requests). `reset` after the server has answered for good.
 */
export function createAttemptKeys(make: () => string = idempotencyKey) {
  let current: { signature: string; key: string } | null = null;
  return {
    keyFor(input: CheckoutInput): string {
      const signature = signatureOf(input);
      if (!current || current.signature !== signature) current = { signature, key: make() };
      return current.key;
    },
    reset() {
      current = null;
    },
  };
}
