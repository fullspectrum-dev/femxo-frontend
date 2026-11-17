/*
 * Work saved on this device while offline (delivery actions, field orders) belongs to the person who
 * made it. It is wiped when they sign out, when their session ends, or when another user signs in.
 */
const OFFLINE_KEYS = ["fx-delivery-queue", "fx-field-order-queue"] as const;

export function clearOfflineQueues(): void {
  try {
    for (const key of OFFLINE_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was saved.
  }
}
