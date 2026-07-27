/**
 * Ordered event-sequence strategy representation (additive schema v2).
 * v1 definitions remain readable; this extends without destructive rewrite.
 */

export const STRATEGY_EVENT_SEQUENCE_VERSION = 2 as const;

export type StrategyEventStepKind =
  | "pattern_creation"
  | "pattern_validity"
  | "revisit"
  | "penetration"
  | "confirmation"
  | "entry"
  | "stop_loss"
  | "take_profit"
  | "invalidation"
  | "max_hold_exit";

export type PatternFamily =
  | "order_block"
  | "fvg"
  | "trendline"
  | "support_resistance"
  | "supply_demand"
  | "indicator"
  | "volume";

export interface StrategyEventStep {
  kind: StrategyEventStepKind;
  labelKo: string;
  /** Machine-readable params; never natural-language-only. */
  params: Record<string, number | string | boolean | null>;
  patternFamily?: PatternFamily;
}

/** Additive multi-pattern block (optional sidecar on eventSequence). */
export type PatternBlockRole =
  | "trend_filter"
  | "entry_zone"
  | "confirmation"
  | "invalidation"
  | "stop_placement"
  | "take_profit"
  | "exit_filter";

export type LegacyPatternBlockRole =
  | "direction_filter"
  | "stop_reference"
  | "target_reference";

export type PatternCombinationOperator =
  | "and"
  | "or"
  | "sequence"
  | "weighted_score"
  | "priority";

export type PatternFailurePolicy = "any" | "all" | "majority";

export interface EventSequenceCombinationBlock {
  id: string;
  family: PatternFamily;
  role: PatternBlockRole;
  order: number;
  required: boolean;
  /** Positive finite score weight, capped during validation. */
  weight: number;
  /** Nonnegative integer used by the priority operator. */
  priority: number;
  params: Record<string, number | string | boolean | null>;
}

export interface EventSequenceCombination {
  version: 1;
  templateId: string;
  operator: PatternCombinationOperator;
  /** Canonical failure policy. */
  failurePolicy: PatternFailurePolicy;
  /** Backward-compatible alias retained in serialized definitions. */
  invalidationMode: "any" | "all";
  weightedThreshold?: number;
  blocks: EventSequenceCombinationBlock[];
}

export function normalizePatternBlockRole(
  role: PatternBlockRole | LegacyPatternBlockRole | string,
): PatternBlockRole | null {
  if (role === "direction_filter") return "trend_filter";
  if (role === "stop_reference") return "stop_placement";
  if (role === "target_reference") return "take_profit";
  return role === "trend_filter" ||
    role === "entry_zone" ||
    role === "confirmation" ||
    role === "invalidation" ||
    role === "stop_placement" ||
    role === "take_profit" ||
    role === "exit_filter"
    ? role
    : null;
}

function isEventRoleFamilyAllowed(
  role: PatternBlockRole,
  family: PatternFamily,
): boolean {
  const nonStructural = family === "indicator" || family === "volume";
  if (!nonStructural) return true;
  return (
    role === "trend_filter" ||
    role === "confirmation" ||
    role === "exit_filter"
  );
}

export interface StrategyEventSequence {
  version: typeof STRATEGY_EVENT_SEQUENCE_VERSION;
  direction: "long" | "short" | "both";
  steps: StrategyEventStep[];
  /**
   * Optional multi-pattern combination. When absent, the sequence is a
   * legacy single-family walker (first pattern_creation step).
   */
  combination?: EventSequenceCombination | null;
}

const REQUIRED_ORDER: StrategyEventStepKind[] = [
  "pattern_creation",
  "revisit",
  "confirmation",
  "entry",
  "stop_loss",
  "take_profit",
];

export function validateEventSequence(
  seq: StrategyEventSequence,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (seq.version !== STRATEGY_EVENT_SEQUENCE_VERSION) {
    errors.push(`unsupported event-sequence version: ${seq.version}`);
  }
  if (!Array.isArray(seq.steps) || seq.steps.length === 0) {
    errors.push("event sequence requires at least one step");
    return { ok: false, errors };
  }
  const kinds = seq.steps.map((s) => s.kind);
  let cursor = 0;
  for (const required of REQUIRED_ORDER) {
    const idx = kinds.indexOf(required, cursor);
    if (idx < 0) {
      errors.push(`missing required step: ${required}`);
    } else if (idx < cursor) {
      errors.push(`invalid order for step: ${required}`);
    } else {
      cursor = idx;
    }
  }
  for (const step of seq.steps) {
    if (!step.labelKo?.trim()) errors.push(`step ${step.kind} missing labelKo`);
    if (!step.params || typeof step.params !== "object") {
      errors.push(`step ${step.kind} missing params object`);
    }
  }
  if (seq.combination != null) {
    const c = seq.combination;
    if (c.version !== 1) {
      errors.push(`unsupported combination version: ${String(c.version)}`);
    }
    if (!Array.isArray(c.blocks) || c.blocks.length < 1) {
      errors.push("combination requires at least one block");
    } else if (c.blocks.length > 4) {
      errors.push("combination supports at most four blocks");
    }
    if (
      c.operator !== "and" &&
      c.operator !== "or" &&
      c.operator !== "sequence" &&
      c.operator !== "weighted_score" &&
      c.operator !== "priority"
    ) {
      errors.push("combination operator invalid");
    }
    const failurePolicy =
      c.failurePolicy ?? c.invalidationMode ?? "any";
    if (
      failurePolicy !== "any" &&
      failurePolicy !== "all" &&
      failurePolicy !== "majority"
    ) {
      errors.push("combination failurePolicy invalid");
    }
    const fams = new Set<string>();
    const ids = new Set<string>();
    const orders = new Set<number>();
    let entryZones = 0;
    let totalWeight = 0;
    for (const b of c.blocks ?? []) {
      if (fams.has(b.family)) {
        errors.push(`duplicate combination family: ${b.family}`);
      }
      fams.add(b.family);
      if (!b.id?.trim() || ids.has(b.id)) {
        errors.push(`duplicate or missing combination block id: ${b.id}`);
      }
      ids.add(b.id);
      if (!Number.isInteger(b.order) || b.order < 0 || orders.has(b.order)) {
        errors.push(`invalid combination block order: ${b.order}`);
      }
      orders.add(b.order);
      const role = normalizePatternBlockRole(b.role);
      if (!role) errors.push(`invalid combination block role: ${String(b.role)}`);
      else if (!isEventRoleFamilyAllowed(role, b.family)) {
        errors.push(`role ${role} is not valid for family ${b.family}`);
      }
      if (role === "entry_zone") entryZones += 1;
      const weight = b.weight ?? 1;
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
        errors.push(`invalid combination block weight: ${weight}`);
      }
      totalWeight += Number.isFinite(weight) && weight > 0 ? weight : 0;
      const priority = b.priority ?? b.order;
      if (!Number.isInteger(priority) || priority < 0) {
        errors.push(`invalid combination block priority: ${priority}`);
      }
      if (b.required != null && typeof b.required !== "boolean") {
        errors.push(`invalid combination block required: ${b.id}`);
      }
    }
    if (entryZones !== 1) errors.push("combination requires exactly one entry_zone");
    if (c.operator === "sequence") {
      const sortedOrders = [...orders].sort((a, b) => a - b);
      if (sortedOrders.some((order, index) => order !== index)) {
        errors.push("sequence combination order must be contiguous from zero");
      }
    }
    if (
      c.operator === "weighted_score" &&
      (!Number.isFinite(c.weightedThreshold) ||
        (c.weightedThreshold ?? 0) <= 0 ||
        (c.weightedThreshold ?? 0) > totalWeight)
    ) {
      errors.push("weighted_score requires a threshold within total block weight");
    }
  }
  return { ok: errors.length === 0, errors };
}

export type EventSequenceConfirmationMode =
  | "none"
  | "single_close"
  | "consecutive_closes"
  | "threshold_count";

type ConfirmationBuildInput = {
  requireCloseInDirection?: boolean;
  confirmationMode?: EventSequenceConfirmationMode | string;
  confirmationCandleCount?: number;
  confirmationWindow?: number;
};

function buildConfirmationStepParams(
  params: ConfirmationBuildInput,
): Record<string, number | string | boolean | null> {
  const countRaw = Number(params.confirmationCandleCount ?? 1);
  const count = Number.isFinite(countRaw)
    ? Math.max(1, Math.min(8, Math.trunc(countRaw)))
    : 1;
  const windowRaw = Number(params.confirmationWindow ?? count);
  const window = Number.isFinite(windowRaw)
    ? Math.max(count, Math.min(24, Math.trunc(windowRaw)))
    : count;

  let mode = params.confirmationMode;
  if (
    mode !== "none" &&
    mode !== "single_close" &&
    mode !== "consecutive_closes" &&
    mode !== "threshold_count"
  ) {
    if (params.requireCloseInDirection === false) mode = "none";
    else if (count > 1) mode = "consecutive_closes";
    else mode = "single_close";
  }

  return {
    confirmationMode: mode,
    confirmationCandleCount: mode === "none" || mode === "single_close" ? 1 : count,
    confirmationWindow:
      mode === "none" || mode === "single_close" ? 1 : window,
    confirmationDirection: "trade_side",
    requireCloseInDirection: mode !== "none",
  };
}

/** Build a deterministic OB long sequence template from numeric params. */
export function buildOrderBlockLongSequence(params: {
  penetrationPct: number;
  stopAtrMult: number;
  tpAtrMult: number;
  maxHoldBars: number;
  zoneLookback: number;
  direction?: "long" | "short" | "both";
  requireTouch?: boolean;
  requireCloseInDirection?: boolean;
  confirmationMode?: EventSequenceConfirmationMode | string;
  confirmationCandleCount?: number;
  confirmationWindow?: number;
  invalidationMode?: "close_beyond_zone" | "none";
  bodyOnly?: boolean;
  minImpulseAtrMult?: number;
  minImpulsePct?: number;
  minVolumeMult?: number;
  mitigationPct?: number;
  firstTouchOnly?: boolean;
  retestAllowed?: boolean;
  entryInsideBlock?: boolean;
  invalidateOnCloseBeyond?: boolean;
}): StrategyEventSequence {
  const direction = params.direction ?? "long";
  const bullish =
    direction === "short" ? "bearish" : "bullish";
  const requireTouch = params.requireTouch !== false;
  const confirmationParams = buildConfirmationStepParams(params);
  return {
    version: STRATEGY_EVENT_SEQUENCE_VERSION,
    direction,
    steps: [
      {
        kind: "pattern_creation",
        labelKo: "오더블록 생성",
        patternFamily: "order_block",
        params: {
          lookback: params.zoneLookback,
          maxAgeBars: params.zoneLookback,
          direction: bullish,
          bodyOnly: params.bodyOnly ?? true,
          minImpulseAtrMult: params.minImpulseAtrMult ?? 0.8,
          minImpulsePct: params.minImpulsePct ?? 0.25,
          minVolumeMult: params.minVolumeMult ?? 0.5,
          mitigationPct: params.mitigationPct ?? 50,
          firstTouchOnly: params.firstTouchOnly ?? false,
          retestAllowed: params.retestAllowed ?? true,
          entryInsideBlock: params.entryInsideBlock ?? false,
          invalidateOnCloseBeyond:
            params.invalidationMode !== "none" &&
            (params.invalidateOnCloseBeyond ?? true),
        },
      },
      {
        kind: "pattern_validity",
        labelKo: "존 유효",
        patternFamily: "order_block",
        params: {
          invalidation:
            params.invalidationMode !== "none" &&
            params.invalidateOnCloseBeyond !== false
            ? "close_beyond_zone"
            : "none",
        },
      },
      {
        kind: "revisit",
        labelKo: "존 재방문",
        patternFamily: "order_block",
        params: { requireTouch },
      },
      {
        kind: "penetration",
        labelKo: "침투 깊이",
        patternFamily: "order_block",
        params: { penetrationPct: params.penetrationPct },
      },
      {
        kind: "confirmation",
        labelKo: "확인 봉",
        patternFamily: "indicator",
        params: confirmationParams,
      },
      {
        kind: "entry",
        labelKo: "진입",
        params: { rule: "confirmation_close" },
      },
      {
        kind: "stop_loss",
        labelKo: "손절",
        params: {
          atrMult: params.stopAtrMult,
          anchor: direction === "short" ? "zone_high" : "zone_low",
        },
      },
      {
        kind: "take_profit",
        labelKo: "익절",
        params: { atrMult: params.tpAtrMult },
      },
      {
        kind: "invalidation",
        labelKo: "무효화",
        params: {
          rule:
            params.invalidationMode !== "none" &&
            params.invalidateOnCloseBeyond !== false
              ? "close_beyond_zone"
              : "none",
        },
      },
      {
        kind: "max_hold_exit",
        labelKo: "최대 보유 청산",
        params: { maxHoldBars: params.maxHoldBars },
      },
    ],
  };
}

/** Fair Value Gap long/both sequence — uses FVG detector in eventSequenceBacktest. */
export function buildFvgSequence(params: {
  penetrationPct: number;
  stopAtrMult: number;
  tpAtrMult: number;
  maxHoldBars: number;
  zoneLookback: number;
  atrRelativeMult: number;
  minGapPct: number;
  direction?: "long" | "short" | "both";
  requireTouch?: boolean;
  requireCloseInDirection?: boolean;
  confirmationMode?: EventSequenceConfirmationMode | string;
  confirmationCandleCount?: number;
  confirmationWindow?: number;
  invalidationMode?: "close_beyond_zone" | "none";
  minGapAbs?: number;
  partialFillPct?: number;
  fullFillInvalidates?: boolean;
  firstTouchOnly?: boolean;
  entryInsideGap?: boolean;
  invalidateOnCloseThrough?: boolean;
}): StrategyEventSequence {
  const direction = params.direction ?? "long";
  const bullish = direction === "short" ? "bearish" : "bullish";
  const requireTouch = params.requireTouch !== false;
  const confirmationParams = buildConfirmationStepParams(params);
  return {
    version: STRATEGY_EVENT_SEQUENCE_VERSION,
    direction,
    steps: [
      {
        kind: "pattern_creation",
        labelKo: "FVG 생성",
        patternFamily: "fvg",
        params: {
          lookback: params.zoneLookback,
          direction: bullish,
          atrRelativeMult: params.atrRelativeMult,
          minGapPct: params.minGapPct,
          minGapAbs: params.minGapAbs ?? 0,
          partialFillPct: params.partialFillPct ?? 45,
          fullFillInvalidates: params.fullFillInvalidates ?? true,
          firstTouchOnly: params.firstTouchOnly ?? false,
          entryInsideGap: params.entryInsideGap ?? false,
          invalidateOnCloseThrough:
            params.invalidationMode !== "none" &&
            (params.invalidateOnCloseThrough ?? true),
          maxAgeBars: params.zoneLookback,
        },
      },
      {
        kind: "pattern_validity",
        labelKo: "갭 유효",
        patternFamily: "fvg",
        params: {
          invalidation:
            params.invalidationMode !== "none" &&
            params.invalidateOnCloseThrough !== false
            ? "close_beyond_zone"
            : "none",
        },
      },
      {
        kind: "revisit",
        labelKo: "갭 재방문",
        patternFamily: "fvg",
        params: { requireTouch },
      },
      {
        kind: "penetration",
        labelKo: "채움 비율",
        patternFamily: "fvg",
        params: { penetrationPct: params.penetrationPct },
      },
      {
        kind: "confirmation",
        labelKo: "확인 봉",
        patternFamily: "indicator",
        params: confirmationParams,
      },
      {
        kind: "entry",
        labelKo: "진입",
        params: { rule: "confirmation_close" },
      },
      {
        kind: "stop_loss",
        labelKo: "손절",
        params: {
          atrMult: params.stopAtrMult,
          anchor: direction === "short" ? "zone_high" : "zone_low",
        },
      },
      {
        kind: "take_profit",
        labelKo: "익절",
        params: { atrMult: params.tpAtrMult },
      },
      {
        kind: "invalidation",
        labelKo: "무효화",
        params: {
          rule:
            params.invalidationMode !== "none" &&
            params.invalidateOnCloseThrough !== false
              ? "close_beyond_zone"
              : "none",
        },
      },
      {
        kind: "max_hold_exit",
        labelKo: "최대 보유 청산",
        params: { maxHoldBars: params.maxHoldBars },
      },
    ],
  };
}

/** Trendline sequence — anchors persisted via detector lineAnchors. */
export function buildTrendlineSequence(params: {
  penetrationPct: number;
  stopAtrMult: number;
  tpAtrMult: number;
  maxHoldBars: number;
  zoneLookback: number;
  slopeMin: number;
  slopeMax: number;
  tolerancePct: number;
  minTouchCount: number;
  direction?: "long" | "short" | "both";
  requireTouch?: boolean;
  requireCloseInDirection?: boolean;
  confirmationMode?: EventSequenceConfirmationMode | string;
  confirmationCandleCount?: number;
  confirmationWindow?: number;
  invalidationMode?: "close_beyond_zone" | "none";
  minPivotCount?: number;
  breakoutByClose?: boolean;
  breakoutByWick?: boolean;
  retestRequired?: boolean;
  detectorConfirmationCandles?: number;
}): StrategyEventSequence {
  const direction = params.direction ?? "long";
  const requireTouch = params.requireTouch !== false;
  const confirmationParams = buildConfirmationStepParams(params);
  return {
    version: STRATEGY_EVENT_SEQUENCE_VERSION,
    direction,
    steps: [
      {
        kind: "pattern_creation",
        labelKo: "추세선 생성",
        patternFamily: "trendline",
        params: {
          lookback: params.zoneLookback,
          slopeMin: params.slopeMin,
          slopeMax: params.slopeMax,
          tolerancePct: params.tolerancePct,
          minTouchCount: params.minTouchCount,
          minPivotCount: params.minPivotCount ?? 2,
          breakoutByClose: params.breakoutByClose ?? false,
          breakoutByWick: params.breakoutByWick ?? false,
          retestRequired: params.retestRequired ?? false,
          confirmationCandles: params.detectorConfirmationCandles ?? 0,
          maxAgeBars: params.zoneLookback,
        },
      },
      {
        kind: "pattern_validity",
        labelKo: "추세선 유효",
        patternFamily: "trendline",
        params: {
          invalidation:
            params.invalidationMode === "none" ? "none" : "close_beyond_zone",
        },
      },
      {
        kind: "revisit",
        labelKo: "라인 재접촉",
        patternFamily: "trendline",
        params: { requireTouch },
      },
      {
        kind: "penetration",
        labelKo: "침투 깊이",
        patternFamily: "trendline",
        params: { penetrationPct: params.penetrationPct },
      },
      {
        kind: "confirmation",
        labelKo: "확인 봉",
        patternFamily: "indicator",
        params: confirmationParams,
      },
      {
        kind: "entry",
        labelKo: "진입",
        params: { rule: "confirmation_close" },
      },
      {
        kind: "stop_loss",
        labelKo: "손절",
        params: {
          atrMult: params.stopAtrMult,
          anchor: direction === "short" ? "zone_high" : "zone_low",
        },
      },
      {
        kind: "take_profit",
        labelKo: "익절",
        params: { atrMult: params.tpAtrMult },
      },
      {
        kind: "invalidation",
        labelKo: "무효화",
        params: {
          rule:
            params.invalidationMode === "none" ? "none" : "close_beyond_zone",
        },
      },
      {
        kind: "max_hold_exit",
        labelKo: "최대 보유 청산",
        params: { maxHoldBars: params.maxHoldBars },
      },
    ],
  };
}

/** Support / Resistance zone sequence. */
export function buildSupportResistanceSequence(params: {
  penetrationPct: number;
  stopAtrMult: number;
  tpAtrMult: number;
  maxHoldBars: number;
  zoneLookback: number;
  minTouches: number;
  tolerancePct: number;
  zoneWidthPct: number;
  direction?: "long" | "short" | "both";
  requireTouch?: boolean;
  requireCloseInDirection?: boolean;
  confirmationMode?: EventSequenceConfirmationMode | string;
  confirmationCandleCount?: number;
  confirmationWindow?: number;
  invalidationMode?: "close_beyond_zone" | "none";
  volumeConfirmation?: boolean;
  breakoutConfirmation?: boolean;
}): StrategyEventSequence {
  const direction = params.direction ?? "long";
  const requireTouch = params.requireTouch !== false;
  const confirmationParams = buildConfirmationStepParams(params);
  return {
    version: STRATEGY_EVENT_SEQUENCE_VERSION,
    direction,
    steps: [
      {
        kind: "pattern_creation",
        labelKo: "지지·저항 생성",
        patternFamily: "support_resistance",
        params: {
          lookback: params.zoneLookback,
          minTouches: params.minTouches,
          tolerancePct: params.tolerancePct,
          zoneWidthPct: params.zoneWidthPct,
          volumeConfirmation: params.volumeConfirmation ?? false,
          breakoutConfirmation: params.breakoutConfirmation ?? false,
          maxAgeBars: params.zoneLookback,
        },
      },
      {
        kind: "pattern_validity",
        labelKo: "존 유효",
        patternFamily: "support_resistance",
        params: {
          invalidation:
            params.invalidationMode === "none" ? "none" : "close_beyond_zone",
        },
      },
      {
        kind: "revisit",
        labelKo: "존 재방문",
        patternFamily: "support_resistance",
        params: { requireTouch },
      },
      {
        kind: "penetration",
        labelKo: "침투 깊이",
        patternFamily: "support_resistance",
        params: { penetrationPct: params.penetrationPct },
      },
      {
        kind: "confirmation",
        labelKo: "확인 봉",
        patternFamily: "indicator",
        params: confirmationParams,
      },
      {
        kind: "entry",
        labelKo: "진입",
        params: { rule: "confirmation_close" },
      },
      {
        kind: "stop_loss",
        labelKo: "손절",
        params: {
          atrMult: params.stopAtrMult,
          anchor: direction === "short" ? "zone_high" : "zone_low",
        },
      },
      {
        kind: "take_profit",
        labelKo: "익절",
        params: { atrMult: params.tpAtrMult },
      },
      {
        kind: "invalidation",
        labelKo: "무효화",
        params: {
          rule:
            params.invalidationMode === "none" ? "none" : "close_beyond_zone",
        },
      },
      {
        kind: "max_hold_exit",
        labelKo: "최대 보유 청산",
        params: { maxHoldBars: params.maxHoldBars },
      },
    ],
  };
}

/** Supply / demand base-and-departure zone sequence. */
export function buildSupplyDemandSequence(params: {
  penetrationPct: number;
  stopAtrMult: number;
  tpAtrMult: number;
  maxHoldBars: number;
  zoneLookback: number;
  baseCandleCount: number;
  maxBaseRangeAtrMult: number;
  minDepartureAtrMult: number;
  minDeparturePct: number;
  zoneBodyOnly: boolean;
  firstTouchOnly: boolean;
  requireRejectionClose: boolean;
  invalidateOnCloseBeyond: boolean;
  direction?: "long" | "short" | "both";
  requireTouch?: boolean;
  requireCloseInDirection?: boolean;
  confirmationMode?: EventSequenceConfirmationMode | string;
  confirmationCandleCount?: number;
  confirmationWindow?: number;
  invalidationMode?: "close_beyond_zone" | "none";
}): StrategyEventSequence {
  const direction = params.direction ?? "long";
  const requireTouch = params.requireTouch !== false;
  const confirmationParams = buildConfirmationStepParams(params);
  return {
    version: STRATEGY_EVENT_SEQUENCE_VERSION,
    direction,
    steps: [
      {
        kind: "pattern_creation",
        labelKo: "수요·공급 존 생성",
        patternFamily: "supply_demand",
        params: {
          lookback: params.zoneLookback,
          maxAgeBars: params.zoneLookback,
          kind: direction === "short" ? "supply" : "demand",
          baseCandleCount: params.baseCandleCount,
          maxBaseRangeAtrMult: params.maxBaseRangeAtrMult,
          minDepartureAtrMult: params.minDepartureAtrMult,
          minDeparturePct: params.minDeparturePct,
          zoneBodyOnly: params.zoneBodyOnly,
          firstTouchOnly: params.firstTouchOnly,
          requireRejectionClose: params.requireRejectionClose,
          invalidateOnCloseBeyond:
            params.invalidationMode !== "none" &&
            params.invalidateOnCloseBeyond,
        },
      },
      {
        kind: "pattern_validity",
        labelKo: "수요·공급 존 유효",
        patternFamily: "supply_demand",
        params: {
          invalidation:
            params.invalidationMode !== "none" &&
            params.invalidateOnCloseBeyond
            ? "close_beyond_zone"
            : "none",
        },
      },
      { kind: "revisit", labelKo: "존 재방문", patternFamily: "supply_demand", params: { requireTouch } },
      { kind: "penetration", labelKo: "침투 깊이", patternFamily: "supply_demand", params: { penetrationPct: params.penetrationPct } },
      { kind: "confirmation", labelKo: "확인 봉", patternFamily: "indicator", params: confirmationParams },
      { kind: "entry", labelKo: "진입", params: { rule: "confirmation_close" } },
      { kind: "stop_loss", labelKo: "손절", params: { atrMult: params.stopAtrMult, anchor: direction === "short" ? "zone_high" : "zone_low" } },
      { kind: "take_profit", labelKo: "익절", params: { atrMult: params.tpAtrMult } },
      { kind: "invalidation", labelKo: "무효화", params: { rule: params.invalidationMode !== "none" && params.invalidateOnCloseBeyond ? "close_beyond_zone" : "none" } },
      { kind: "max_hold_exit", labelKo: "최대 보유 청산", params: { maxHoldBars: params.maxHoldBars } },
    ],
  };
}
