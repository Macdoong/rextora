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
  | "indicator"
  | "volume";

export interface StrategyEventStep {
  kind: StrategyEventStepKind;
  labelKo: string;
  /** Machine-readable params; never natural-language-only. */
  params: Record<string, number | string | boolean | null>;
  patternFamily?: PatternFamily;
}

export interface StrategyEventSequence {
  version: typeof STRATEGY_EVENT_SEQUENCE_VERSION;
  direction: "long" | "short" | "both";
  steps: StrategyEventStep[];
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
  return { ok: errors.length === 0, errors };
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
}): StrategyEventSequence {
  const direction = params.direction ?? "long";
  const bullish =
    direction === "short" ? "bearish" : "bullish";
  const requireTouch = params.requireTouch !== false;
  const requireCloseInDirection = params.requireCloseInDirection !== false;
  return {
    version: STRATEGY_EVENT_SEQUENCE_VERSION,
    direction,
    steps: [
      {
        kind: "pattern_creation",
        labelKo: "오더블록 생성",
        patternFamily: "order_block",
        params: { lookback: params.zoneLookback, direction: bullish },
      },
      {
        kind: "pattern_validity",
        labelKo: "존 유효",
        patternFamily: "order_block",
        params: { invalidation: "close_beyond_zone" },
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
        params: { requireCloseInDirection },
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
        params: { rule: "close_beyond_zone" },
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
}): StrategyEventSequence {
  const direction = params.direction ?? "long";
  const bullish = direction === "short" ? "bearish" : "bullish";
  const requireTouch = params.requireTouch !== false;
  const requireCloseInDirection = params.requireCloseInDirection !== false;
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
        },
      },
      {
        kind: "pattern_validity",
        labelKo: "갭 유효",
        patternFamily: "fvg",
        params: { invalidation: "close_beyond_zone" },
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
        params: { requireCloseInDirection },
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
        params: { rule: "close_beyond_zone" },
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
}): StrategyEventSequence {
  const direction = params.direction ?? "long";
  const requireTouch = params.requireTouch !== false;
  const requireCloseInDirection = params.requireCloseInDirection !== false;
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
          minPivotCount: 2,
        },
      },
      {
        kind: "pattern_validity",
        labelKo: "추세선 유효",
        patternFamily: "trendline",
        params: { invalidation: "close_beyond_zone" },
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
        params: { requireCloseInDirection },
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
        params: { rule: "close_beyond_zone" },
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
}): StrategyEventSequence {
  const direction = params.direction ?? "long";
  const requireTouch = params.requireTouch !== false;
  const requireCloseInDirection = params.requireCloseInDirection !== false;
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
        },
      },
      {
        kind: "pattern_validity",
        labelKo: "존 유효",
        patternFamily: "support_resistance",
        params: { invalidation: "close_beyond_zone" },
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
        params: { requireCloseInDirection },
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
        params: { rule: "close_beyond_zone" },
      },
      {
        kind: "max_hold_exit",
        labelKo: "최대 보유 청산",
        params: { maxHoldBars: params.maxHoldBars },
      },
    ],
  };
}
