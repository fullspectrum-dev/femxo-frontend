import { en } from "./en";
import type { MessageKey } from "./en";

export type { MessageKey } from "./en";

type Vars = Record<string, string | number>;

/** Messages that have a count (`key_one`, `key_other`). */
type CountedKey<K extends string = MessageKey> = K extends `${infer Base}_one` ? Base : never;

/**
 * The only locale today is English. A second catalogue (same keys) plus a
 * locale chosen per visitor is all that is left to add; components already
 * ask for messages by key.
 */
const catalogue: Record<string, string> = en;

const fill = (text: string, vars: Vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));

/** The message for a key, with {placeholders} filled in. */
export function t(key: MessageKey, vars?: Vars) {
  return fill(catalogue[key] ?? key, vars);
}

/** A message that depends on a count: "Cart, 1 item" / "Cart, 3 items". `{count}` is filled in. */
export function tn(key: CountedKey, count: number, vars: Vars = {}) {
  const form = count === 1 ? "one" : "other";
  return fill(catalogue[`${key}_${form}`] ?? key, { ...vars, count });
}
