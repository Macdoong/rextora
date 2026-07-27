/**
 * Pattern Search spaces — families with event-sequence templates + Search adapters.
 * Only expose spaces that route through runEventSequenceBacktest with real detectors.
 */

import type { StrategySearchParameterRange } from "./types";
import type { SearchSpaceDefinition } from "./searchSpaces";
import {
  catalogDefaultsForPatternFamily,
  catalogForPatternFamily,
  catalogRangesForPatternFamily,
} from "./patternParameterCatalog";

export type PatternSearchFamilyId =
  | "order_block"
  | "fvg"
  | "trendline"
  | "support_resistance"
  | "supply_demand";

export const ORDER_BLOCK_SPACE_ID = "order_block" as const;
export const FVG_SPACE_ID = "fvg" as const;
export const TRENDLINE_SPACE_ID = "trendline" as const;
export const SUPPORT_RESISTANCE_SPACE_ID = "support_resistance" as const;
export const SUPPLY_DEMAND_SPACE_ID = "supply_demand" as const;

export const PATTERN_SEARCH_SPACE_IDS: PatternSearchFamilyId[] = [
  ORDER_BLOCK_SPACE_ID,
  FVG_SPACE_ID,
  TRENDLINE_SPACE_ID,
  SUPPORT_RESISTANCE_SPACE_ID,
  SUPPLY_DEMAND_SPACE_ID,
];

/** Shared exit / revisit knobs used by all pattern spaces. */
const SHARED_EXIT_KEYS = [
  "penetrationPct",
  "stopAtrMult",
  "tpAtrMult",
  "maxHoldBars",
  "zoneLookback",
] as const;

export const ORDER_BLOCK_PARAM_KEYS = catalogForPatternFamily("order_block").map(
  (entry) => entry.key,
);

export const FVG_PARAM_KEYS = catalogForPatternFamily("fvg").map(
  (entry) => entry.key,
);

export const TRENDLINE_PARAM_KEYS = catalogForPatternFamily("trendline").map(
  (entry) => entry.key,
);

export const SUPPORT_RESISTANCE_PARAM_KEYS =
  catalogForPatternFamily("support_resistance").map((entry) => entry.key);

export const SUPPLY_DEMAND_PARAM_KEYS =
  catalogForPatternFamily("supply_demand").map((entry) => entry.key);

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
  confirmationMode?:
    | "none"
    | "single_close"
    | "consecutive_closes"
    | "threshold_count";
  confirmationCandleCount?: number;
  confirmationWindow?: number;
  invalidationMode?: "close_beyond_zone" | "none";
  bodyOnly: boolean;
  minImpulseAtrMult: number;
  minImpulsePct: number;
  minVolumeMult: number;
  mitigationPct: number;
  firstTouchOnly: boolean;
  retestAllowed: boolean;
  entryInsideBlock: boolean;
  invalidateOnCloseBeyond: boolean;
};

export type FvgSearchParams = OrderBlockSearchParams & {
  atrRelativeMult: number;
  minGapPct: number;
  minGapAbs: number;
  partialFillPct: number;
  fullFillInvalidates: boolean;
  entryInsideGap: boolean;
  invalidateOnCloseThrough: boolean;
};

export type TrendlineSearchParams = OrderBlockSearchParams & {
  slopeMin: number;
  slopeMax: number;
  tolerancePct: number;
  minTouchCount: number;
  minPivotCount: number;
  breakoutByClose: boolean;
  breakoutByWick: boolean;
  retestRequired: boolean;
  detectorConfirmationCandles: number;
};

export type SupportResistanceSearchParams = OrderBlockSearchParams & {
  minTouches: number;
  tolerancePct: number;
  zoneWidthPct: number;
  volumeConfirmation: boolean;
  breakoutConfirmation: boolean;
};

export type SupplyDemandSearchParams = OrderBlockSearchParams & {
  baseCandleCount: number;
  maxBaseRangeAtrMult: number;
  minDepartureAtrMult: number;
  minDeparturePct: number;
  zoneBodyOnly: boolean;
  requireRejectionClose: boolean;
};

export type PatternSearchParams =
  | OrderBlockSearchParams
  | FvgSearchParams
  | TrendlineSearchParams
  | SupportResistanceSearchParams
  | SupplyDemandSearchParams;

export const ORDER_BLOCK_BASE_PARAMS =
  catalogDefaultsForPatternFamily("order_block") as OrderBlockSearchParams;

export const FVG_BASE_PARAMS =
  catalogDefaultsForPatternFamily("fvg") as FvgSearchParams;

export const TRENDLINE_BASE_PARAMS =
  catalogDefaultsForPatternFamily("trendline") as TrendlineSearchParams;

export const SUPPORT_RESISTANCE_BASE_PARAMS =
  catalogDefaultsForPatternFamily(
    "support_resistance",
  ) as SupportResistanceSearchParams;

export const SUPPLY_DEMAND_BASE_PARAMS =
  catalogDefaultsForPatternFamily("supply_demand") as SupplyDemandSearchParams;

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

export const SUPPLY_DEMAND_SEARCH_SPACE: SearchSpaceDefinition = {
  id: SUPPLY_DEMAND_SPACE_ID,
  labelKo: "Supply / Demand",
  keys: [...SUPPLY_DEMAND_PARAM_KEYS],
};

export const ALL_PATTERN_SEARCH_SPACES: SearchSpaceDefinition[] = [
  ORDER_BLOCK_SEARCH_SPACE,
  FVG_SEARCH_SPACE,
  TRENDLINE_SEARCH_SPACE,
  SUPPORT_RESISTANCE_SEARCH_SPACE,
  SUPPLY_DEMAND_SEARCH_SPACE,
];

export function orderBlockSearchRanges(): StrategySearchParameterRange[] {
  return catalogRangesForPatternFamily("order_block");
}

export function fvgSearchRanges(): StrategySearchParameterRange[] {
  return catalogRangesForPatternFamily("fvg");
}

export function trendlineSearchRanges(): StrategySearchParameterRange[] {
  return catalogRangesForPatternFamily("trendline");
}

export function supportResistanceSearchRanges(): StrategySearchParameterRange[] {
  return catalogRangesForPatternFamily("support_resistance");
}

export function supplyDemandSearchRanges(): StrategySearchParameterRange[] {
  return catalogRangesForPatternFamily("supply_demand");
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
    case SUPPLY_DEMAND_SPACE_ID:
      return supplyDemandSearchRanges();
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
    case SUPPLY_DEMAND_SPACE_ID:
      return { ...SUPPLY_DEMAND_BASE_PARAMS };
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
    spaceId === SUPPORT_RESISTANCE_SPACE_ID ||
    spaceId === SUPPLY_DEMAND_SPACE_ID
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
  "confirmationMode",
  "confirmationCandleCount",
  "confirmationWindow",
  /** Multi-pattern combination identity (must survive normalize → hash). */
  "combinationTemplate",
  "combinationOperator",
  "combinationInvalidationMode",
  "combinationFamilies",
  "combinationRoles",
  "combinationOrders",
  "combinationBlocks",
  "combinationFailurePolicy",
  "combinationWeightedThreshold",
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
  return new Set(
    [...keys].filter(
      (k) => !PATTERN_NON_FAMILY_KEYS.has(k) && !k.startsWith("block."),
    ),
  );
}

export function resolvePatternFamilyFromRanges(
  ranges: StrategySearchParameterRange[],
): PatternSearchFamilyId | null {
  if (ranges.length === 0) return null;
  const keys = familyKeysOnly(new Set(ranges.map((r) => r.key)));
  if (
    isKeySubset(keys, SUPPLY_DEMAND_PARAM_KEYS) &&
    (keys.has("baseCandleCount") || keys.has("minDepartureAtrMult"))
  ) {
    return SUPPLY_DEMAND_SPACE_ID;
  }
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
  if (
    num("baseCandleCount") &&
    num("maxBaseRangeAtrMult") &&
    num("minDepartureAtrMult")
  ) {
    return SUPPLY_DEMAND_SPACE_ID;
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
    case SUPPLY_DEMAND_SPACE_ID:
      return SUPPLY_DEMAND_PARAM_KEYS;
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

function readConfirmationMode(
  params: Record<string, unknown>,
): OrderBlockSearchParams["confirmationMode"] | undefined {
  const m = params.confirmationMode;
  if (
    m === "none" ||
    m === "single_close" ||
    m === "consecutive_closes" ||
    m === "threshold_count"
  ) {
    return m;
  }
  return undefined;
}

function readInvalidationMode(
  params: Record<string, unknown>,
): OrderBlockSearchParams["invalidationMode"] {
  return params.invalidationMode === "none" ? "none" : "close_beyond_zone";
}

export function readOrderBlockParams(
  params: Record<string, unknown>,
): OrderBlockSearchParams {
  const countRaw = Number(params.confirmationCandleCount);
  const windowRaw = Number(params.confirmationWindow);
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
    confirmationMode: readConfirmationMode(params),
    confirmationCandleCount: Number.isFinite(countRaw)
      ? Math.max(1, Math.min(8, Math.trunc(countRaw)))
      : undefined,
    confirmationWindow: Number.isFinite(windowRaw)
      ? Math.max(1, Math.min(24, Math.trunc(windowRaw)))
      : undefined,
    invalidationMode: readInvalidationMode(params),
    bodyOnly: readOptionalBool(params, "bodyOnly") ?? true,
    minImpulseAtrMult: Number(params.minImpulseAtrMult),
    minImpulsePct: Number(params.minImpulsePct),
    minVolumeMult: Number(params.minVolumeMult),
    mitigationPct: Number(params.mitigationPct),
    firstTouchOnly: readOptionalBool(params, "firstTouchOnly") ?? false,
    retestAllowed: readOptionalBool(params, "retestAllowed") ?? true,
    entryInsideBlock: readOptionalBool(params, "entryInsideBlock") ?? false,
    invalidateOnCloseBeyond:
      readOptionalBool(params, "invalidateOnCloseBeyond") ?? true,
  };
}

export function readFvgParams(params: Record<string, unknown>): FvgSearchParams {
  return {
    ...readOrderBlockParams(params),
    atrRelativeMult: Number(params.atrRelativeMult),
    minGapPct: Number(params.minGapPct),
    minGapAbs: Number(params.minGapAbs),
    partialFillPct: Number(params.partialFillPct),
    fullFillInvalidates:
      readOptionalBool(params, "fullFillInvalidates") ?? true,
    entryInsideGap: readOptionalBool(params, "entryInsideGap") ?? false,
    invalidateOnCloseThrough:
      readOptionalBool(params, "invalidateOnCloseThrough") ?? true,
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
    minPivotCount: Math.trunc(Number(params.minPivotCount)),
    breakoutByClose: readOptionalBool(params, "breakoutByClose") ?? false,
    breakoutByWick: readOptionalBool(params, "breakoutByWick") ?? false,
    retestRequired: readOptionalBool(params, "retestRequired") ?? false,
    detectorConfirmationCandles: Math.trunc(
      Number(params.detectorConfirmationCandles),
    ),
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
    volumeConfirmation:
      readOptionalBool(params, "volumeConfirmation") ?? false,
    breakoutConfirmation:
      readOptionalBool(params, "breakoutConfirmation") ?? false,
  };
}

export function readSupplyDemandParams(
  params: Record<string, unknown>,
): SupplyDemandSearchParams {
  return {
    ...readOrderBlockParams(params),
    baseCandleCount: Math.trunc(Number(params.baseCandleCount)),
    maxBaseRangeAtrMult: Number(params.maxBaseRangeAtrMult),
    minDepartureAtrMult: Number(params.minDepartureAtrMult),
    minDeparturePct: Number(params.minDeparturePct),
    zoneBodyOnly: readOptionalBool(params, "zoneBodyOnly") ?? false,
    requireRejectionClose:
      readOptionalBool(params, "requireRejectionClose") ?? false,
  };
}
