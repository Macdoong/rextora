/**
 * Saved-configuration apply contract for Strategy Search operator forms.
 * Does not change form defaults, validation, or search payload semantics.
 */

import {
  createDefaultOperatorFormState,
  type StrategySearchOperatorFormState,
} from "./formDefaults";

/** UI disclosure only — not a search setting. */
export const SESSION_ONLY_OPERATOR_FORM_KEYS = ["showAdvanced"] as const;

/** Legacy aliases kept on the type for tests/callers; not part of the default form. */
export const INTENTIONALLY_EXCLUDED_OPERATOR_FORM_KEYS = [
  "symbols",
  "intensity",
  "goal",
  "targetReturn",
  "maxSearchCount",
  "runUntilQualified",
] as const;

type SessionOnlyKey = (typeof SESSION_ONLY_OPERATOR_FORM_KEYS)[number];

export function persistedOperatorFormKeys(
  defaults: StrategySearchOperatorFormState = createDefaultOperatorFormState(),
): Array<keyof StrategySearchOperatorFormState> {
  const session = new Set<string>(SESSION_ONLY_OPERATOR_FORM_KEYS);
  return (Object.keys(defaults) as Array<keyof StrategySearchOperatorFormState>).filter(
    (key) => !session.has(String(key)),
  );
}

function hasOwn<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Canonical load: defaults → persisted saved form → session-only UI flags.
 * Stale current-form fields that are not in the saved payload do not survive.
 */
export function applySavedOperatorForm(
  saved: Partial<StrategySearchOperatorFormState> | null | undefined,
  session?: Pick<StrategySearchOperatorFormState, SessionOnlyKey>,
): StrategySearchOperatorFormState {
  const defaults = createDefaultOperatorFormState();
  const next: StrategySearchOperatorFormState = { ...defaults };
  if (saved && typeof saved === "object") {
    for (const key of persistedOperatorFormKeys(defaults)) {
      if (!hasOwn(saved, key)) continue;
      const value = saved[key];
      if (value === undefined) continue;
      (next as unknown as Record<string, unknown>)[String(key)] = value;
    }
  }
  if (session) {
    next.showAdvanced = session.showAdvanced;
  }
  return next;
}

export function persistedFieldsEqual(
  a: StrategySearchOperatorFormState,
  b: StrategySearchOperatorFormState,
): { ok: boolean; drifted: Array<keyof StrategySearchOperatorFormState> } {
  const drifted: Array<keyof StrategySearchOperatorFormState> = [];
  for (const key of persistedOperatorFormKeys()) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      drifted.push(key);
    }
  }
  return { ok: drifted.length === 0, drifted };
}
