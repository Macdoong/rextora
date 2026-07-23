/**
 * Operator search-depth and qualification profiles.
 * Single source of truth for UI, API validation, and orchestration.
 * Maps only onto verified SafeV44 / PASS / engine settings.
 */

import { getDefaultSafeV44SearchSpace } from "./paramSpace";
import type {
  StrategySearchCostStressScenario,
  StrategySearchJitterConfig,
  StrategySearchParameterRange,
  StrategySearchPassPolicy,
  StrategySearchScoreWeights,
} from "./types";
import type { SearchSpaceDefinition } from "./searchSpaces";
import { buildSearchSpacesForDepth } from "./searchSpaces";

export type SearchDepthProfileId = "fast" | "standard" | "deep";
export type QualificationProfileId =
  | "conservative"
  | "balanced"
  | "aggressive"
  | "custom";

export type HistoricalPeriodPresetId =
  | "short"
  | "standard"
  | "long"
  | "custom";

export interface SearchDepthProfile {
  id: SearchDepthProfileId;
  labelKo: string;
  descriptionKo: string;
  /** Per-space batch iteration budget (maxIterations for each stage run). */
  stageBatchSize: number;
  /** Global unique-candidate budget across all spaces. */
  candidateBudget: number;
  /** Max wall-clock ms for the whole campaign (null = no cap). */
  maxRuntimeMs: number | null;
  stressEnabled: boolean;
  stressFeeMultiplier: number;
  stressSlippageMultiplier: number;
  jitterEnabled: boolean;
  jitterSamples: number;
  jitterMutationScale: number;
  /** Space stage ids included for this depth (from searchSpaces). */
  spaceIds: string[];
}

export interface QualificationProfile {
  id: QualificationProfileId;
  labelKo: string;
  descriptionKo: string;
  minTradeCount: number | null;
  minTotalReturn: number | null;
  /** Positive ratio in UI; stored as negative for PASS maxMdd. */
  maxMddAbs: number | null;
  minWinRate: number | null;
  minScore: number | null;
  returnWeight: number;
  mddWeight: number;
}

export const SEARCH_DEPTH_PROFILES: Record<
  SearchDepthProfileId,
  SearchDepthProfile
> = {
  fast: {
    id: "fast",
    labelKo: "빠른 탐색",
    descriptionKo: "빠르게 후보를 확인합니다.",
    stageBatchSize: 20,
    candidateBudget: 100,
    maxRuntimeMs: 10 * 60 * 1000,
    stressEnabled: true,
    stressFeeMultiplier: 1.5,
    stressSlippageMultiplier: 1.5,
    jitterEnabled: false,
    jitterSamples: 2,
    jitterMutationScale: 0.2,
    spaceIds: [
      "ema_core",
      "rsi_pullback",
      "breakout",
      "risk_exits",
      "full_safe",
    ],
  },
  standard: {
    id: "standard",
    labelKo: "표준 탐색",
    descriptionKo: "속도와 검증 범위를 균형 있게 적용합니다.",
    stageBatchSize: 40,
    candidateBudget: 200,
    maxRuntimeMs: 30 * 60 * 1000,
    stressEnabled: true,
    stressFeeMultiplier: 1.5,
    stressSlippageMultiplier: 1.5,
    jitterEnabled: false,
    jitterSamples: 2,
    jitterMutationScale: 0.2,
    spaceIds: [
      "ema_core",
      "rsi_pullback",
      "breakout",
      "risk_exits",
      "full_safe",
    ],
  },
  deep: {
    id: "deep",
    labelKo: "심층 탐색",
    descriptionKo: "더 넓은 범위를 오래 검증합니다.",
    stageBatchSize: 80,
    candidateBudget: 500,
    maxRuntimeMs: 90 * 60 * 1000,
    stressEnabled: true,
    stressFeeMultiplier: 1.5,
    stressSlippageMultiplier: 1.5,
    jitterEnabled: true,
    jitterSamples: 3,
    jitterMutationScale: 0.2,
    spaceIds: [
      "ema_core",
      "rsi_pullback",
      "breakout",
      "risk_exits",
      "full_safe",
    ],
  },
};

export const QUALIFICATION_PROFILES: Record<
  Exclude<QualificationProfileId, "custom">,
  QualificationProfile
> = {
  conservative: {
    id: "conservative",
    labelKo: "보수적",
    descriptionKo: "낙폭을 낮게 제한하고 안정성을 우선합니다.",
    minTradeCount: 20,
    minTotalReturn: 0.05,
    maxMddAbs: 0.15,
    minWinRate: 0.45,
    minScore: null,
    returnWeight: 0.8,
    mddWeight: 1.2,
  },
  balanced: {
    id: "balanced",
    labelKo: "균형형",
    descriptionKo: "수익성과 안정성을 함께 평가합니다.",
    minTradeCount: 10,
    minTotalReturn: 0,
    maxMddAbs: 0.25,
    minWinRate: null,
    minScore: null,
    returnWeight: 1,
    mddWeight: 0.5,
  },
  aggressive: {
    id: "aggressive",
    labelKo: "공격적",
    descriptionKo: "더 높은 수익 가능성을 허용하되 변동성이 커질 수 있습니다.",
    minTradeCount: 5,
    minTotalReturn: null,
    maxMddAbs: 0.4,
    minWinRate: null,
    minScore: null,
    returnWeight: 1.4,
    mddWeight: 0.4,
  },
};

/** Historical period presets → day spans (UTC calendar days). */
export const HISTORICAL_PERIOD_PRESETS: Record<
  Exclude<HistoricalPeriodPresetId, "custom">,
  { labelKo: string; days: number }
> = {
  short: { labelKo: "단기 (30일)", days: 30 },
  standard: { labelKo: "표준 (60일)", days: 60 },
  long: { labelKo: "장기 (120일)", days: 120 },
};

/** Markets used elsewhere in Rextora backtest UI. */
export const OPERATOR_SUPPORTED_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
] as const;

/** Matches src/lib/rextora/data/timeframes.ts UI-supported set. */
export const OPERATOR_SUPPORTED_TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "1h",
] as const;

export function getSearchDepthProfile(
  id: SearchDepthProfileId,
): SearchDepthProfile {
  return SEARCH_DEPTH_PROFILES[id];
}

export function getQualificationProfile(
  id: Exclude<QualificationProfileId, "custom">,
): QualificationProfile {
  return QUALIFICATION_PROFILES[id];
}

export function resolveSpacesForDepth(
  depth: SearchDepthProfileId,
): SearchSpaceDefinition[] {
  const profile = getSearchDepthProfile(depth);
  return buildSearchSpacesForDepth(profile.spaceIds);
}

export function buildPassPolicyFromQualification(
  q: QualificationProfile,
): StrategySearchPassPolicy {
  return {
    thresholds: {
      minTradeCount: q.minTradeCount,
      minTotalReturn: q.minTotalReturn,
      maxMdd: q.maxMddAbs == null ? null : -Math.abs(q.maxMddAbs),
      minWinRate: q.minWinRate,
    },
  };
}

export function buildScoreWeightsFromQualification(
  q: QualificationProfile,
): StrategySearchScoreWeights {
  return {
    returnWeight: q.returnWeight,
    mddWeight: q.mddWeight,
    profitFactorWeight: 0.25,
    winRateWeight: 0.25,
    tradeAdequacyWeight: 0.25,
    negativeMonthWeight: 0.1,
    consistencyWeight: 0.1,
  };
}

export function buildStressScenarios(
  depth: SearchDepthProfile,
): StrategySearchCostStressScenario[] {
  if (!depth.stressEnabled) return [];
  return [
    {
      id: "stress_1_5x",
      label: "비용 1.5배",
      requiredForPass: false,
      feeMultiplier: depth.stressFeeMultiplier,
      slippageMultiplier: depth.stressSlippageMultiplier,
      fundingMultiplier: 1,
      spreadMultiplier: depth.stressFeeMultiplier,
      costGuardKMultiplier: 1,
    },
  ];
}

export function buildJitterConfig(
  depth: SearchDepthProfile,
  parameterRanges: StrategySearchParameterRange[],
): StrategySearchJitterConfig {
  return {
    enabled: depth.jitterEnabled,
    sampleCount: depth.jitterSamples,
    mutationScale: depth.jitterMutationScale,
    seed: 7,
    minimumPassRate: 0,
    maximumScoreDropRatio: 1,
    parameterRanges,
  };
}

/** Full catalog ranges — used only for full_safe space construction. */
export function fullSafeRanges(): StrategySearchParameterRange[] {
  return getDefaultSafeV44SearchSpace();
}
