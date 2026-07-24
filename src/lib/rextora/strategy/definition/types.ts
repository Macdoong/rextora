/**
 * Canonical strategy definition schema (v1).
 * One schema for builder, storage, backtest, market-watch, paper, live.
 * Extends existing StoredStrategy fields for backward compatibility.
 */

import type { StrategyEventSequence } from "./eventSequence";

export const STRATEGY_SCHEMA_VERSION = 1 as const;
export const MAX_CONDITION_DEPTH = 4;
export const MAX_CONDITIONS_PER_GROUP = 32;

export type StrategyKind = "safe_params" | "condition_builder";

export type ComparisonOp =
  | "above"
  | "below"
  | "cross_above"
  | "cross_below"
  | "gt"
  | "lt"
  | "between"
  | "increasing"
  | "decreasing"
  | "equals"
  | "true";

export type ConditionCategory =
  | "structure"
  | "order_block"
  | "fvg"
  | "trend_line"
  | "support_resistance"
  | "indicator"
  | "filter"
  | "group";

export type LeafConditionType =
  // Market structure
  | "higher_high"
  | "higher_low"
  | "lower_high"
  | "lower_low"
  | "bullish_structure"
  | "bearish_structure"
  | "break_of_structure"
  | "change_of_character"
  // Order block
  | "bullish_order_block"
  | "bearish_order_block"
  // FVG
  | "bullish_fvg"
  | "bearish_fvg"
  // Trend line
  | "ascending_trend_line"
  | "descending_trend_line"
  | "support_trend_line"
  | "resistance_trend_line"
  // S/R
  | "support_zone"
  | "resistance_zone"
  | "previous_high"
  | "previous_low"
  | "repeated_touch_zone"
  | "sr_flip"
  // Indicators
  | "sma"
  | "ema"
  | "rsi"
  | "atr"
  | "vwap"
  | "roc"
  | "volume"
  // Filters
  | "min_quote_volume"
  | "quote_volume_rank"
  | "min_volatility"
  | "max_volatility"
  | "spread_limit"
  | "cost_guard"
  | "candle_body_ratio"
  | "breakout_volume_multiplier";

export interface ConditionNodeBase {
  id: string;
  type: LeafConditionType | "group";
  enabled: boolean;
  description?: string;
  timeframeOverride?: string;
  validationStatus: "ok" | "error" | "unknown";
  validationMessage?: string;
}

export interface LeafCondition extends ConditionNodeBase {
  type: LeafConditionType;
  category: Exclude<ConditionCategory, "group">;
  parameters: Record<string, number | boolean | string>;
  comparison: ComparisonOp;
  value: number | [number, number] | boolean | null;
}

export interface ConditionGroup extends ConditionNodeBase {
  type: "group";
  category: "group";
  operator: "AND" | "OR";
  children: ConditionNode[];
}

export type ConditionNode = LeafCondition | ConditionGroup;

export interface RiskSettings {
  stopLossAtrMult: number;
  takeProfitAtrMult: number;
  useTrailing: boolean;
  trailAtrMult: number;
  maxHoldBars: number;
  oppositeSignalExit: boolean;
  structureInvalidationExit: boolean;
  timeExitBars?: number;
  partialExitEnabled: boolean;
}

export interface PositionSizingSettings {
  baseBalancePct: number;
  sizeMin: number;
  sizeMax: number;
  useVolTarget: boolean;
  targetAtrPct: number;
}

export interface ExecutionSettings {
  costGuardEnabled: boolean;
  costGuardK: number;
  cooldownBars: number;
  longEnabled: boolean;
  shortEnabled: boolean;
}

export interface FilterSettings {
  minQuoteVolume?: number;
  maxSpreadPct?: number;
  minVolatilityPct?: number;
  maxVolatilityPct?: number;
}

export interface CanonicalStrategyDefinition {
  schemaVersion: typeof STRATEGY_SCHEMA_VERSION;
  strategyId: string;
  strategyName: string;
  description: string;
  version: string;
  strategyType: StrategyKind;
  sourceStrategyId: string | null;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  timeframe: "1m" | "3m" | "5m" | "15m" | "1h" | "unknown";
  symbols: string[];
  longEnabled: boolean;
  shortEnabled: boolean;
  entryConditions: {
    long: ConditionGroup;
    short: ConditionGroup;
  };
  exitConditions: {
    long: ConditionGroup;
    short: ConditionGroup;
  };
  filters: FilterSettings;
  risk: RiskSettings;
  positionSizing: PositionSizingSettings;
  execution: ExecutionSettings;
  metadata: Record<string, string | number | boolean | null>;
  paramsHash: string;
  /** SAFE-compatible numeric params (required for safe_params strategies) */
  safeParams?: Record<string, number | boolean>;
  /**
   * Optional ordered event-sequence executor (additive).
   * Schema version stays 1 for old records; presence selects the new path.
   */
  eventSequence?: StrategyEventSequence;
}

export function emptyGroup(operator: "AND" | "OR" = "AND"): ConditionGroup {
  return {
    id: `grp_${Math.random().toString(36).slice(2, 10)}`,
    type: "group",
    category: "group",
    operator,
    enabled: true,
    children: [],
    validationStatus: "ok"
  };
}

export function newLeafId(): string {
  return `cnd_${Math.random().toString(36).slice(2, 10)}`;
}
