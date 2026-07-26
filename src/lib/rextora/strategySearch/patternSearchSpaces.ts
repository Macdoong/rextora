/**
 * Pattern Search spaces — families with event-sequence templates + Search adapters.
 * Only expose spaces that route through runEventSequenceBacktest with real detectors.
 */

import type { StrategySearchParameterRange } from "./types";
import type { SearchSpaceDefinition } from "./searchSpaces";

export type PatternSearchFamilyId =
  | "order_block"
  | "fvg"
  | "trendline"
  | "support_resistance";

export const ORDER_BLOCK_SPACE_ID = "order_block" as const;
export const FVG_SPACE_ID = "fvg" as const;
export const TRENDLINE_SPACE_ID = "trendline" as const;
export const SUPPORT_RESISTANCE_SPACE_ID = "support_resistance" as const;

export const PATTERN_SEARCH_SPACE_IDS: PatternSearchFamilyId[] = [
  ORDER_BLOCK_SPACE_ID,
  FVG_SPACE_ID,
  TRENDLINE_SPACE_ID,
  SUPPORT_RESISTANCE_SPACE_ID,
];

/** Shared exit / revisit knobs used by all pattern spaces. */
const SHARED_EXIT_KEYS = [
  "penetrationPct",
  "stopAtrMult",
  "tpAtrMult",
  "maxHoldBars",
  "zoneLookback",
] as const;

export const ORDER_BLOCK_PARAM_KEYS = [...SHARED_EXIT_KEYS] as const;

export const FVG_PARAM_KEYS = [
  ...SHARED_EXIT_KEYS,
  "atrRelativeMult",
  "minGapPct",
] as const;

export const TRENDLINE_PARAM_KEYS = [
  ...SHARED_EXIT_KEYS,
  "slopeMin",
  "slopeMax",
  "tolerancePct",
  "minTouchCount",
] as const;

export const SUPPORT_RESISTANCE_PARAM_KEYS = [
  ...SHARED_EXIT_KEYS,
  "minTouches",
  "tolerancePct",
  "zoneWidthPct",
] as const;

export type OrderBlockSearchParams = {
  penetrationPct: number;
  stopAtrMult: number;
  tpAtrMult: number;
  maxHoldBars: number;
  zoneLookback: number;
  /** Operator plan passthrough — not a searchable range key. */
  direction?: "long" | "short" | "both";
  requireTouch?: boolean;
  requireCloseInDirection?: boolean;
};

export type FvgSearchParams = OrderBlockSearchParams & {
  atrRelativeMult: number;
  minGapPct: number;
};

export type TrendlineSearchParams = OrderBlockSearchParams & {
  slopeMin: number;
  slopeMax: number;
  tolerancePct: number;
  minTouchCount: number;
};

export type SupportResistanceSearchParams = OrderBlockSearchParams & {
  minTouches: number;
  tolerancePct: number;
  zoneWidthPct: number;
};

export type PatternSearchParams =
  | OrderBlockSearchParams
  | FvgSearchParams
  | TrendlineSearchParams
  | SupportResistanceSearchParams;

export const ORDER_BLOCK_BASE_PARAMS: OrderBlockSearchParams = {
  penetrationPct: 0.45,
  stopAtrMult: 1.2,
  tpAtrMult: 2.0,
  maxHoldBars: 48,
  zoneLookback: 40,
};

export const FVG_BASE_PARAMS: FvgSearchParams = {
  ...ORDER_BLOCK_BASE_PARAMS,
  atrRelativeMult: 0.2,
  minGapPct: 0.08,
};

export const TRENDLINE_BASE_PARAMS: TrendlineSearchParams = {
  ...ORDER_BLOCK_BASE_PARAMS,
  slopeMin: 0,
  slopeMax: 2,
  tolerancePct: 0.35,
  minTouchCount: 2,
};

export const SUPPORT_RESISTANCE_BASE_PARAMS: SupportResistanceSearchParams = {
  ...ORDER_BLOCK_BASE_PARAMS,
  minTouches: 2,
  tolerancePct: 0.35,
  zoneWidthPct: 0.25,
};

function sharedExitRanges(
  base: OrderBlockSearchParams,
): StrategySearchParameterRange[] {
  return [
    {
      key: "penetrationPct",
      min: 0.2,
      max: 0.8,
      step: 0.05,
      valueType: "float",
      defaultValue: base.penetrationPct,
    },
    {
      key: "stopAtrMult",
      min: 0.5,
      max: 2.5,
      step: 0.1,
      valueType: "float",
      defaultValue: base.stopAtrMult,
    },
    {
      key: "tpAtrMult",
      min: 1.0,
      max: 4.0,
      step: 0.25,
      valueType: "float",
      defaultValue: base.tpAtrMult,
    },
    {
      key: "maxHoldBars",
      min: 12,
      max: 96,
      step: 6,
      valueType: "integer",
      defaultValue: base.maxHoldBars,
    },
    {
      key: "zoneLookback",
      min: 20,
      max: 80,
      step: 5,
      valueType: "integer",
      defaultValue: base.zoneLookback,
    },
  ];
}

export const ORDER_BLOCK_SEARCH_SPACE: SearchSpaceDefinition = {
  id: ORDER_BLOCK_SPACE_ID,
  labelKo: "Order Block",
  keys: [...ORDER_BLOCK_PARAM_KEYS],
};

export const FVG_SEARCH_SPACE: SearchSpaceDefinition = {
  id: FVG_SPACE_ID,
  labelKo: "Fair Value Gap",
  keys: [...FVG_PARAM_KEYS],
};

export const TRENDLINE_SEARCH_SPACE: SearchSpaceDefinition = {
  id: TRENDLINE_SPACE_ID,
  labelKo: "Trendline",
  keys: [...TRENDLINE_PARAM_KEYS],
};

export const SUPPORT_RESISTANCE_SEARCH_SPACE: SearchSpaceDefinition = {
  id: SUPPORT_RESISTANCE_SPACE_ID,
  labelKo: "Support / Resistance",
  keys: [...SUPPORT_RESISTANCE_PARAM_KEYS],
};

export const ALL_PATTERN_SEARCH_SPACES: SearchSpaceDefinition[] = [
  ORDER_BLOCK_SEARCH_SPACE,
  FVG_SEARCH_SPACE,
  TRENDLINE_SEARCH_SPACE,
  SUPPORT_RESISTANCE_SEARCH_SPACE,
];

export function orderBlockSearchRanges(): StrategySearchParameterRange[] {
  return sharedExitRanges(ORDER_BLOCK_BASE_PARAMS);
}

export function fvgSearchRanges(): StrategySearchParameterRange[] {
  return [
    ...sharedExitRanges(FVG_BASE_PARAMS),
    {
      key: "atrRelativeMult",
      min: 0.05,
      max: 0.6,
      step: 0.05,
      valueType: "float",
      defaultValue: FVG_BASE_PARAMS.atrRelativeMult,
    },
    {
      key: "minGapPct",
      min: 0.02,
      max: 0.4,
      step: 0.02,
      valueType: "float",
      defaultValue: FVG_BASE_PARAMS.minGapPct,
    },
  ];
}

export function trendlineSearchRanges(): StrategySearchParameterRange[] {
  return [
    ...sharedExitRanges(TRENDLINE_BASE_PARAMS),
    {
      key: "slopeMin",
      min: 0,
      max: 0.5,
      step: 0.05,
      valueType: "float",
      defaultValue: TRENDLINE_BASE_PARAMS.slopeMin,
    },
    {
      key: "slopeMax",
      min: 0.5,
      max: 5,
      step: 0.25,
      valueType: "float",
      defaultValue: TRENDLINE_BASE_PARAMS.slopeMax,
    },
    {
      key: "tolerancePct",
      min: 0.1,
      max: 1.0,
      step: 0.05,
      valueType: "float",
      defaultValue: TRENDLINE_BASE_PARAMS.tolerancePct,
    },
    {
      key: "minTouchCount",
      min: 2,
      max: 6,
      step: 1,
      valueType: "integer",
      defaultValue: TRENDLINE_BASE_PARAMS.minTouchCount,
    },
  ];
}

export function supportResistanceSearchRanges(): StrategySearchParameterRange[] {
  return [
    ...sharedExitRanges(SUPPORT_RESISTANCE_BASE_PARAMS),
    {
      key: "minTouches",
      min: 2,
      max: 8,
      step: 1,
      valueType: "integer",
      defaultValue: SUPPORT_RESISTANCE_BASE_PARAMS.minTouches,
    },
    {
      key: "tolerancePct",
      min: 0.1,
      max: 1.0,
      step: 0.05,
      valueType: "float",
      defaultValue: SUPPORT_RESISTANCE_BASE_PARAMS.tolerancePct,
    },
    {
      key: "zoneWidthPct",
      min: 0.1,
      max: 1.0,
      step: 0.05,
      valueType: "float",
      defaultValue: SUPPORT_RESISTANCE_BASE_PARAMS.zoneWidthPct,
    },
  ];
}

export function rangesForPatternSpaceId(
  spaceId: string,
): StrategySearchParameterRange[] | null {
  switch (spaceId) {
    case ORDER_BLOCK_SPACE_ID:
      return orderBlockSearchRanges();
    case FVG_SPACE_ID:
      return fvgSearchRanges();
    case TRENDLINE_SPACE_ID:
      return trendlineSearchRanges();
    case SUPPORT_RESISTANCE_SPACE_ID:
      return supportResistanceSearchRanges();
    default:
      return null;
  }
}

export function baseParamsForPatternSpaceId(
  spaceId: string,
): Record<string, number | boolean | string> | null {
  switch (spaceId) {
    case ORDER_BLOCK_SPACE_ID:
      return { ...ORDER_BLOCK_BASE_PARAMS };
    case FVG_SPACE_ID:
      return { ...FVG_BASE_PARAMS };
    case TRENDLINE_SPACE_ID:
      return { ...TRENDLINE_BASE_PARAMS };
    case SUPPORT_RESISTANCE_SPACE_ID:
      return { ...SUPPORT_RESISTANCE_BASE_PARAMS };
    default:
      return null;
  }
}

export function isPatternSearchSpaceId(
  spaceId: string | null | undefined,
): spaceId is PatternSearchFamilyId {
  return (
    spaceId === ORDER_BLOCK_SPACE_ID ||
    spaceId === FVG_SPACE_ID ||
    spaceId === TRENDLINE_SPACE_ID ||
    spaceId === SUPPORT_RESISTANCE_SPACE_ID
  );
}

/** @deprecated prefer isPatternSearchSpaceId */
export function isOrderBlockSpaceId(spaceId: string | null | undefined): boolean {
  return spaceId === ORDER_BLOCK_SPACE_ID;
}

/** Operator / leverage keys that may ride on pattern ranges without changing family. */
export const PATTERN_OPERATOR_PASSTHROUGH_KEYS = [
  "direction",
  "requireTouch",
  "requireCloseInDirection",
] as const;

export const PATTERN_LEVERAGE_PARAM_KEYS = [
  "lev_min",
  "lev_base",
  "lev_max",
  "use_dynamic_leverage",
] as const;

const PATTERN_NON_FAMILY_KEYS = new Set<string>([
  ...PATTERN_OPERATOR_PASSTHROUGH_KEYS,
  ...PATTERN_LEVERAGE_PARAM_KEYS,
]);

function isKeySubset(
  keys: Set<string>,
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);
  return [...keys].every((k) => allowedSet.has(k));
}

function familyKeysOnly(keys: Set<string>): Set<string> {
  return new Set([...keys].filter((k) => !PATTERN_NON_FAMILY_KEYS.has(k)));
}

export function resolvePatternFamilyFromRanges(
  ranges: StrategySearchParameterRange[],
): PatternSearchFamilyId | null {
  if (ranges.length === 0) return null;
  const keys = familyKeysOnly(new Set(ranges.map((r) => r.key)));
  if (
    isKeySubset(keys, FVG_PARAM_KEYS) &&
    (keys.has("atrRelativeMult") || keys.has("minGapPct"))
  ) {
    return FVG_SPACE_ID;
  }
  if (
    isKeySubset(keys, TRENDLINE_PARAM_KEYS) &&
    (keys.has("slopeMin") ||
      keys.has("slopeMax") ||
      keys.has("minTouchCount"))
  ) {
    return TRENDLINE_SPACE_ID;
  }
  if (
    isKeySubset(keys, SUPPORT_RESISTANCE_PARAM_KEYS) &&
    (keys.has("minTouches") || keys.has("zoneWidthPct"))
  ) {
    return SUPPORT_RESISTANCE_SPACE_ID;
  }
  if (isKeySubset(keys, ORDER_BLOCK_PARAM_KEYS)) {
    return ORDER_BLOCK_SPACE_ID;
  }
  return null;
}

export function isPatternParameterRanges(
  ranges: StrategySearchParameterRange[],
): boolean {
  return resolvePatternFamilyFromRanges(ranges) != null;
}

/** @deprecated prefer isPatternParameterRanges */
export function isOrderBlockParameterRanges(
  ranges: StrategySearchParameterRange[],
): boolean {
  return resolvePatternFamilyFromRanges(ranges) === ORDER_BLOCK_SPACE_ID;
}

export function resolvePatternFamilyFromParams(
  params: Record<string, unknown> | null | undefined,
): PatternSearchFamilyId | null {
  if (!params || typeof params !== "object") return null;
  const num = (k: string) => typeof params[k] === "number";
  if (!SHARED_EXIT_KEYS.every(num)) return null;
  if (num("atrRelativeMult") && num("minGapPct")) return FVG_SPACE_ID;
  if (
    num("slopeMin") &&
    num("slopeMax") &&
    num("tolerancePct") &&
    num("minTouchCount")
  ) {
    return TRENDLINE_SPACE_ID;
  }
  if (num("minTouches") && num("tolerancePct") && num("zoneWidthPct")) {
    return SUPPORT_RESISTANCE_SPACE_ID;
  }
  // OB: shared exits only — no FVG/TL/SR exclusive keys
  if (
    !num("atrRelativeMult") &&
    !num("minGapPct") &&
    !num("slopeMin") &&
    !num("minTouchCount") &&
    !num("minTouches") &&
    !num("zoneWidthPct")
  ) {
    return ORDER_BLOCK_SPACE_ID;
  }
  return null;
}

export function isOrderBlockCandidateParams(
  params: Record<string, unknown> | null | undefined,
): boolean {
  return resolvePatternFamilyFromParams(params) === ORDER_BLOCK_SPACE_ID;
}

export function isPatternCandidateParams(
  params: Record<string, unknown> | null | undefined,
): boolean {
  return resolvePatternFamilyFromParams(params) != null;
}

export function patternParamKeysForFamily(
  family: PatternSearchFamilyId,
): readonly string[] {
  switch (family) {
    case FVG_SPACE_ID:
      return FVG_PARAM_KEYS;
    case TRENDLINE_SPACE_ID:
      return TRENDLINE_PARAM_KEYS;
    case SUPPORT_RESISTANCE_SPACE_ID:
      return SUPPORT_RESISTANCE_PARAM_KEYS;
    default:
      return ORDER_BLOCK_PARAM_KEYS;
  }
}

export function baseParamsForFamily(
  family: PatternSearchFamilyId,
): Record<string, number | boolean | string> {
  return baseParamsForPatternSpaceId(family) ?? { ...ORDER_BLOCK_BASE_PARAMS };
}

function readDirection(
  params: Record<string, unknown>,
): "long" | "short" | "both" | undefined {
  const d = params.direction;
  if (d === "long" || d === "short" || d === "both") return d;
  return undefined;
}

function readOptionalBool(
  params: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const v = params[key];
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1" || v === "true") return true;
  if (v === 0 || v === "0" || v === "false") return false;
  return undefined;
}

export function readOrderBlockParams(
  params: Record<string, unknown>,
): OrderBlockSearchParams {
  return {
    penetrationPct: Number(params.penetrationPct),
    stopAtrMult: Number(params.stopAtrMult),
    tpAtrMult: Number(params.tpAtrMult),
    maxHoldBars: Math.trunc(Number(params.maxHoldBars)),
    zoneLookback: Math.trunc(Number(params.zoneLookback)),
    direction: readDirection(params),
    requireTouch: readOptionalBool(params, "requireTouch"),
    requireCloseInDirection: readOptionalBool(
      params,
      "requireCloseInDirection",
    ),
  };
}

export function readFvgParams(params: Record<string, unknown>): FvgSearchParams {
  return {
    ...readOrderBlockParams(params),
    atrRelativeMult: Number(params.atrRelativeMult),
    minGapPct: Number(params.minGapPct),
  };
}

export function readTrendlineParams(
  params: Record<string, unknown>,
): TrendlineSearchParams {
  return {
    ...readOrderBlockParams(params),
    slopeMin: Number(params.slopeMin),
    slopeMax: Number(params.slopeMax),
    tolerancePct: Number(params.tolerancePct),
    minTouchCount: Math.trunc(Number(params.minTouchCount)),
  };
}

export function readSupportResistanceParams(
  params: Record<string, unknown>,
): SupportResistanceSearchParams {
  return {
    ...readOrderBlockParams(params),
    minTouches: Math.trunc(Number(params.minTouches)),
    tolerancePct: Number(params.tolerancePct),
    zoneWidthPct: Number(params.zoneWidthPct),
  };
}
