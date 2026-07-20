import type { OhlcvCandle } from "../../data/ohlcvTypes";
import { computeAtrSeries } from "../../indicator/indicatorEngine";
import type { ConditionGroup, ConditionNode, LeafCondition, CanonicalStrategyDefinition } from "../definition/types";
import { detectStructureAt, type StructureParams } from "./structure";
import { detectOrderBlocks, type OrderBlockParams } from "./orderBlock";
import { detectFvg, type FvgParams } from "./fvg";
import { detectTrendLine, type TrendLineParams } from "./trendLine";
import { detectSupportResistance, type SrParams } from "./supportResistance";
import { buildIndicatorSeries, compareValues } from "./indicators";
import { evaluateUnifiedCost } from "../../metrics/unifiedCost";

export interface EvalContext {
  candles: OhlcvCandle[];
  bar: number;
  quoteVolume?: number;
  quoteVolumeRank?: number;
  spreadPct?: number;
  expectedReward?: number;
}

function num(p: Record<string, number | boolean | string>, key: string, fallback: number): number {
  const v = p[key];
  return typeof v === "number" ? v : fallback;
}
function bool(p: Record<string, number | boolean | string>, key: string, fallback: boolean): boolean {
  const v = p[key];
  return typeof v === "boolean" ? v : fallback;
}

function evalLeaf(leaf: LeafCondition, ctx: EvalContext): boolean {
  if (!leaf.enabled) return true;
  const { candles, bar } = ctx;
  const atrSeries = computeAtrSeries(
    candles.map((c) => c.high),
    candles.map((c) => c.low),
    candles.map((c) => c.close),
    Math.max(1, Math.floor(num(leaf.parameters, "atr_period", 14)))
  );
  const atr = atrSeries[bar] ?? 0;
  const p = leaf.parameters;

  switch (leaf.type) {
    case "higher_high":
    case "higher_low":
    case "lower_high":
    case "lower_low":
    case "bullish_structure":
    case "bearish_structure":
    case "break_of_structure":
    case "change_of_character": {
      const sp: StructureParams = {
        pivotLookback: num(p, "pivot_lookback", 3),
        minSwingDistancePct: num(p, "min_swing_distance_pct", 0.1),
        confirmationCandles: num(p, "confirmation_candles", 0),
        closeConfirmation: bool(p, "close_confirmation", true),
        wickInclusion: bool(p, "wick_inclusion", false),
        atrThresholdMult: num(p, "atr_threshold_mult", 0.5)
      };
      return detectStructureAt(candles, bar, atrSeries, leaf.type, sp);
    }
    case "bullish_order_block":
    case "bearish_order_block": {
      const op: OrderBlockParams = {
        bodyOnly: bool(p, "body_only", false),
        minImpulseAtrMult: num(p, "min_impulse_atr_mult", 1),
        minImpulsePct: num(p, "min_impulse_pct", 0.2),
        minVolumeMult: num(p, "min_volume_mult", 1),
        maxAgeBars: num(p, "max_age_bars", 50),
        mitigationPct: num(p, "mitigation_pct", 50),
        firstTouchOnly: bool(p, "first_touch_only", true),
        retestAllowed: bool(p, "retest_allowed", false),
        entryInsideBlock: bool(p, "entry_inside_block", true),
        invalidateOnCloseBeyond: bool(p, "invalidate_on_close_beyond", true)
      };
      return detectOrderBlocks(candles, bar, atr, leaf.type === "bullish_order_block" ? "bullish" : "bearish", op).hit;
    }
    case "bullish_fvg":
    case "bearish_fvg": {
      const fp: FvgParams = {
        minGapAbs: num(p, "min_gap_abs", 0),
        minGapPct: num(p, "min_gap_pct", 0.05),
        atrRelativeMult: num(p, "atr_relative_mult", 0.25),
        partialFillPct: num(p, "partial_fill_pct", 1),
        fullFillInvalidates: bool(p, "full_fill_invalidates", true),
        maxAgeBars: num(p, "max_age_bars", 50),
        firstTouchOnly: bool(p, "first_touch_only", false),
        entryInsideGap: bool(p, "entry_inside_gap", true),
        invalidateOnCloseThrough: bool(p, "invalidate_on_close_through", true)
      };
      return detectFvg(candles, bar, atr, leaf.type === "bullish_fvg" ? "bullish" : "bearish", fp).hit;
    }
    case "ascending_trend_line":
    case "descending_trend_line":
    case "support_trend_line":
    case "resistance_trend_line": {
      const tp: TrendLineParams = {
        minPivotCount: num(p, "min_pivot_count", 2),
        minTouchCount: num(p, "min_touch_count", 2),
        slopeMin: num(p, "slope_min", 0),
        slopeMax: num(p, "slope_max", 1),
        tolerancePct: num(p, "tolerance_pct", 0.3),
        breakoutByClose: bool(p, "breakout_by_close", true),
        breakoutByWick: bool(p, "breakout_by_wick", false),
        confirmationCandles: num(p, "confirmation_candles", 0),
        retestRequired: bool(p, "retest_required", false),
        maxAgeBars: num(p, "max_age_bars", 100)
      };
      return detectTrendLine(candles, bar, leaf.type, tp).hit;
    }
    case "support_zone":
    case "resistance_zone":
    case "previous_high":
    case "previous_low":
    case "repeated_touch_zone":
    case "sr_flip": {
      const sp: SrParams = {
        lookback: num(p, "lookback", 40),
        minTouches: num(p, "min_touches", 2),
        tolerancePct: num(p, "tolerance_pct", 0.25),
        zoneWidthPct: num(p, "zone_width_pct", 0.3),
        volumeConfirmation: bool(p, "volume_confirmation", false),
        breakoutConfirmation: bool(p, "breakout_confirmation", false),
        maxAgeBars: num(p, "max_age_bars", 120)
      };
      return detectSupportResistance(candles, bar, leaf.type, sp).hit;
    }
    case "sma":
    case "ema":
    case "rsi":
    case "atr":
    case "vwap":
    case "roc":
    case "volume": {
      const period = num(p, "period", leaf.type === "rsi" || leaf.type === "atr" ? 14 : 20);
      const series = buildIndicatorSeries(candles, leaf.type, period);
      const priceCompare = bool(p, "compare_to_price", leaf.type === "sma" || leaf.type === "ema" || leaf.type === "vwap");
      return compareValues(series, bar, leaf.comparison, leaf.value, priceCompare ? candles[bar].close : undefined);
    }
    case "min_quote_volume":
      return (ctx.quoteVolume ?? 0) >= (typeof leaf.value === "number" ? leaf.value : num(p, "min", 0));
    case "quote_volume_rank":
      return (ctx.quoteVolumeRank ?? 999) <= (typeof leaf.value === "number" ? leaf.value : num(p, "max_rank", 50));
    case "min_volatility": {
      const atrPct = atr / Math.max(candles[bar].close, 1e-9) * 100;
      return atrPct >= (typeof leaf.value === "number" ? leaf.value : num(p, "min", 0));
    }
    case "max_volatility": {
      const atrPct = atr / Math.max(candles[bar].close, 1e-9) * 100;
      return atrPct <= (typeof leaf.value === "number" ? leaf.value : num(p, "max", 100));
    }
    case "spread_limit":
      return (ctx.spreadPct ?? 0) <= (typeof leaf.value === "number" ? leaf.value : num(p, "max", 1));
    case "cost_guard": {
      const k = typeof leaf.value === "number" ? leaf.value : num(p, "cost_guard_k", 3);
      const reward = ctx.expectedReward ?? num(p, "expected_reward", 0.01);
      const price = candles[bar].close;
      return evaluateUnifiedCost({
        entryPrice: price,
        side: "LONG",
        expectedProfitFraction: reward,
        costGuardEnabled: true,
        costGuardK: k
      }).passed;
    }
    case "candle_body_ratio": {
      const c = candles[bar];
      const range = Math.max(c.high - c.low, 1e-9);
      const body = Math.abs(c.close - c.open) / range;
      return compareValues([0, body], 1, leaf.comparison, leaf.value);
    }
    case "breakout_volume_multiplier": {
      const vols = candles.slice(Math.max(0, bar - 20), bar).map((c) => c.volume);
      const avg = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
      const mult = typeof leaf.value === "number" ? leaf.value : num(p, "mult", 1.5);
      return avg > 0 && candles[bar].volume >= avg * mult;
    }
    default:
      return false;
  }
}

export function evaluateConditionNode(node: ConditionNode, ctx: EvalContext): boolean {
  if (!node.enabled) return true;
  if (node.type === "group") {
    const group = node as ConditionGroup;
    // Empty group: no conditions configured → do not fire entries/exits
    if (!group.children.length) return false;
    if (group.operator === "AND") return group.children.every((c) => evaluateConditionNode(c, ctx));
    return group.children.some((c) => evaluateConditionNode(c, ctx));
  }
  return evalLeaf(node as LeafCondition, ctx);
}

export type BuilderSignal = "LONG" | "SHORT" | "FLAT";

export function evaluateBuilderSignal(def: CanonicalStrategyDefinition, ctx: EvalContext): BuilderSignal {
  if (def.longEnabled && def.execution.longEnabled) {
    const longOk = evaluateConditionNode(def.entryConditions.long, ctx);
    if (longOk) return "LONG";
  }
  if (def.shortEnabled && def.execution.shortEnabled) {
    const shortOk = evaluateConditionNode(def.entryConditions.short, ctx);
    if (shortOk) return "SHORT";
  }
  return "FLAT";
}

export function shouldExitBuilder(
  def: CanonicalStrategyDefinition,
  side: "LONG" | "SHORT",
  ctx: EvalContext,
  holdBars: number
): boolean {
  if (holdBars >= def.risk.maxHoldBars) return true;
  if (def.risk.timeExitBars != null && holdBars >= def.risk.timeExitBars) return true;
  const tree = side === "LONG" ? def.exitConditions.long : def.exitConditions.short;
  if (evaluateConditionNode(tree, ctx)) return true;
  if (def.risk.oppositeSignalExit) {
    const sig = evaluateBuilderSignal(def, ctx);
    if (side === "LONG" && sig === "SHORT") return true;
    if (side === "SHORT" && sig === "LONG") return true;
  }
  return false;
}
