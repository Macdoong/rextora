/**
 * Event-Sequence minimum completed-candle history.
 * Derived from the walker start index and family detector early-returns.
 * Does not change Research/Backtest arithmetic.
 */

import type { CanonicalStrategyDefinition } from "./definition/types";
import type {
  PatternFamily,
  StrategyEventSequence,
  StrategyEventStep,
} from "./definition/eventSequence";

/** Walker starts at i = 20. First evaluable candle count is 21. */
export const EVENT_SEQUENCE_WALKER_WARMUP_BARS = 20;
export const EVENT_SEQUENCE_FIRST_EVALUABLE_CANDLE_COUNT =
  EVENT_SEQUENCE_WALKER_WARMUP_BARS + 1;

const DEFAULT_SR_LOOKBACK = 40;
const DEFAULT_SD_BASE_CANDLES = 2;

function numParam(
  params: Record<string, number | string | boolean | null> | undefined,
  key: string,
  fallback: number,
): number {
  const v = params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Minimum candles.length so the family detector can pass its bar-index gate.
 * Source: orderBlock bar<5, fvg bar<2, trendLine bar<10,
 * supportResistance bar<lookback+2, supplyDemand bar<baseCount+1.
 */
export function getEventSequenceDetectorMinimumBars(
  family: PatternFamily | undefined,
  params?: Record<string, number | string | boolean | null>,
): number {
  switch (family) {
    case "fvg":
      return 3;
    case "trendline":
      return 11;
    case "support_resistance": {
      const lookback = Math.max(1, Math.trunc(numParam(params, "lookback", DEFAULT_SR_LOOKBACK)));
      return lookback + 3;
    }
    case "supply_demand": {
      const baseCount = Math.max(
        1,
        Math.trunc(numParam(params, "baseCandleCount", DEFAULT_SD_BASE_CANDLES)),
      );
      return baseCount + 2;
    }
    case "order_block":
    default:
      return 6;
  }
}

function collectFamilyParams(seq: StrategyEventSequence): Array<{
  family: PatternFamily | undefined;
  params: Record<string, number | string | boolean | null> | undefined;
}> {
  const out: Array<{
    family: PatternFamily | undefined;
    params: Record<string, number | string | boolean | null> | undefined;
  }> = [];
  const creation = seq.steps.find((s: StrategyEventStep) => s.kind === "pattern_creation");
  if (creation) {
    out.push({ family: creation.patternFamily, params: creation.params });
  }
  for (const block of seq.combination?.blocks ?? []) {
    if (block.family === "indicator" || block.family === "volume") continue;
    out.push({ family: block.family, params: block.params });
  }
  return out.length > 0 ? out : [{ family: "order_block", params: undefined }];
}

export function getEventSequenceMinimumHistoryBars(
  def: CanonicalStrategyDefinition | null | undefined,
): number {
  const seq = def?.eventSequence;
  if (!seq) return EVENT_SEQUENCE_FIRST_EVALUABLE_CANDLE_COUNT;
  let required = EVENT_SEQUENCE_FIRST_EVALUABLE_CANDLE_COUNT;
  for (const row of collectFamilyParams(seq)) {
    required = Math.max(
      required,
      getEventSequenceDetectorMinimumBars(row.family, row.params),
    );
  }
  return required;
}
