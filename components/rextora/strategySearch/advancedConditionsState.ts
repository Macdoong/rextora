/**
 * Presentation-only advanced-conditions badge.
 * Compares operator form fields already shown in the advanced disclosure.
 */

import {
  createDefaultOperatorFormState,
  type StrategySearchOperatorFormState,
} from "./formDefaults";

const VISUAL_KEYS = new Set([
  "symbol",
  "timeframe",
  "periodPreset",
  "tradingStyle",
  "selectedSpaceIds",
  "patternDirection",
  "searchName",
  "availableFromDate",
  "availableToDate",
]);

export function advancedChangedFieldCount(
  form: StrategySearchOperatorFormState,
  defaults: StrategySearchOperatorFormState = createDefaultOperatorFormState(),
): number {
  const formRecord = form as unknown as Record<string, unknown>;
  const defaultRecord = defaults as unknown as Record<string, unknown>;
  return Object.keys(defaultRecord).filter((key) => {
    if (VISUAL_KEYS.has(key)) return false;
    return JSON.stringify(formRecord[key]) !== JSON.stringify(defaultRecord[key]);
  }).length;
}

export function advancedConditionsStateLabel(
  form: StrategySearchOperatorFormState,
): { kind: "default" | "changed"; label: string; changedCount: number } {
  const changedCount = advancedChangedFieldCount(form);
  if (changedCount === 0) {
    return { kind: "default", label: "기본값 사용 중", changedCount };
  }
  return {
    kind: "changed",
    label: `${changedCount}개 항목 변경됨`,
    changedCount,
  };
}
