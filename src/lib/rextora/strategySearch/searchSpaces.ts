/**
 * Verified SafeV44 search-space stages for multi-space progression.
 * Only uses keys present in getDefaultSafeV44SearchSpace() / SafeV44Params.
 */

import { getDefaultSafeV44SearchSpace } from "./paramSpace";
import type { StrategySearchParameterRange } from "./types";

export interface SearchSpaceDefinition {
  id: string;
  labelKo: string;
  /** Subset of SafeV44 keys to search; other params stay at base defaults. */
  keys: string[];
}

/**
 * Ordered catalog of supported spaces.
 * Progression expands across indicator groups already in SafeV44 — no invented templates.
 */
export const SAFE_V44_SEARCH_SPACES: SearchSpaceDefinition[] = [
  {
    id: "ema_core",
    labelKo: "EMA 추세",
    keys: ["ema_fast", "ema_mid", "ema_slow", "slope_min", "slope_lookback"],
  },
  {
    id: "rsi_pullback",
    labelKo: "RSI 되돌림",
    keys: [
      "ema_fast",
      "rsi_period",
      "rsi_max_long",
      "rsi_min_short",
      "pullback_max_dist",
      "vol_ratio_min",
      "confirm_bear",
    ],
  },
  {
    id: "breakout",
    labelKo: "변동성 돌파",
    keys: [
      "break_lookback",
      "break_margin",
      "vol_ratio_min_break",
      "max_atr_pct_break",
      "max_atr_pct",
      "confirm_bull",
    ],
  },
  {
    id: "risk_exits",
    labelKo: "ATR 손익",
    keys: [
      "sl_atr_mult",
      "tp_atr_mult",
      "use_trailing",
      "trail_atr_mult",
      "max_hold_bars",
      "cooldown_bars",
    ],
  },
  {
    id: "full_safe",
    labelKo: "SAFE 종합",
    keys: [],
  },
];

export function rangesForSpace(
  space: SearchSpaceDefinition,
): StrategySearchParameterRange[] {
  const full = getDefaultSafeV44SearchSpace();
  if (space.id === "full_safe" || space.keys.length === 0) {
    return full;
  }
  const keySet = new Set(space.keys);
  const selected = full.filter((r) => keySet.has(r.key));
  if (selected.length === 0) {
    // Fallback: never return empty — use ema_fast from catalog
    return full.filter((r) => r.key === "ema_fast");
  }
  return selected;
}

export function buildSearchSpacesForDepth(
  spaceIds: string[],
): SearchSpaceDefinition[] {
  const byId = new Map(SAFE_V44_SEARCH_SPACES.map((s) => [s.id, s]));
  const out: SearchSpaceDefinition[] = [];
  for (const id of spaceIds) {
    const space = byId.get(id);
    if (space) out.push(space);
  }
  if (out.length === 0) {
    out.push(SAFE_V44_SEARCH_SPACES[0]!);
  }
  return out;
}

export function getSearchSpaceById(id: string): SearchSpaceDefinition | null {
  return SAFE_V44_SEARCH_SPACES.find((s) => s.id === id) ?? null;
}
