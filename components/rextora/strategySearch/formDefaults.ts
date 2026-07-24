/**
 * Operator-facing Strategy Search form defaults and engine preset mapping.
 * Client-safe mirror of server operatorProfiles — do NOT import from
 * @/src/lib/rextora/strategySearch in client components.
 */

import type {
  StrategySearchCreateJobBody,
  StrategySearchOperatorPlan,
} from "./types";
import {
  maxDrawdownPercentToPolicy,
  percentInputToRatio,
  ratioToPercentInput,
  winRatePercentToRatio,
} from "./unitMapping";

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
export type QualifiedTargetPreset = "1" | "3" | "5" | "custom";
export type MarketMode = "recommended" | "manual";
export type DurationPresetId =
  | "60"
  | "180"
  | "360"
  | "720"
  | "1440"
  | "custom";
export type MddPresetId = "10" | "15" | "20" | "25" | "custom";
export type TradingStyleId = "scalping" | "balanced" | "stable";

/** Beginner-facing preset aliases mapped onto verified trading styles. */
export type BeginnerPresetId = "safe" | "balanced" | "aggressive";

export const BEGINNER_PRESET_MAP: Record<
  BeginnerPresetId,
  {
    labelKo: string;
    tradingStyle: TradingStyleId;
    criteriaKo: string[];
  }
> = {
  safe: {
    labelKo: "안전형",
    tradingStyle: "stable",
    criteriaKo: [
      "합격 프로필: 안정형 (max MDD 15%, 최소 거래 20회, 최소 수익 5%)",
      "탐색 깊이: 심층 (지터 검증 ON, 비용 스트레스 ON)",
      "비용 반영 필수",
      "강건성 검증 사용",
      "과적합 위험 검사 (지터·스트레스 결과 기반)",
    ],
  },
  balanced: {
    labelKo: "균형형",
    tradingStyle: "balanced",
    criteriaKo: [
      "합격 프로필: 균형형 (max MDD 25%, 최소 거래 10회, 최소 수익 0%)",
      "탐색 깊이: 표준 (비용 스트레스 ON)",
      "비용 반영 필수",
      "강건성 검증 사용",
      "과적합 위험 검사",
    ],
  },
  aggressive: {
    labelKo: "공격형",
    tradingStyle: "scalping",
    criteriaKo: [
      "합격 프로필: 수익형 (max MDD 40%, 최소 거래 5회)",
      "탐색 깊이: 빠른 탐색 (비용 스트레스 ON)",
      "비용 반영 필수",
      "빠른 후보 평가",
      "과적합 위험 검사",
    ],
  },
};
export type ResearchBasisId =
  | "fresh"
  | "improve_best"
  | "backtest_supplement"
  | "paper_supplement"
  | "live_supplement";

/** Markets used elsewhere in Rextora backtest UI (mirrored from server). */
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

/** Matches server OPERATOR_SUPPORTED_TIMEFRAMES (no 4h). */
export const OPERATOR_SUPPORTED_TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "1h",
] as const;

export interface SearchDepthProfileMirror {
  id: SearchDepthProfileId;
  labelKo: string;
  descriptionKo: string;
  stageBatchSize: number;
  candidateBudget: number;
  maxRuntimeMs: number | null;
  stressEnabled: boolean;
  stressFeeMultiplier: number;
  stressSlippageMultiplier: number;
  jitterEnabled: boolean;
  jitterSamples: number;
  jitterMutationScale: number;
}

export interface QualificationProfileMirror {
  id: QualificationProfileId;
  labelKo: string;
  descriptionKo: string;
  minTradeCount: number | null;
  minTotalReturn: number | null;
  maxMddAbs: number | null;
  minWinRate: number | null;
  minScore: number | null;
  returnWeight: number;
  mddWeight: number;
}

/** Mirrored from src/lib/rextora/strategySearch/operatorProfiles.ts */
export const SEARCH_DEPTH_PROFILES: Record<
  SearchDepthProfileId,
  SearchDepthProfileMirror
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
    jitterEnabled: true,
    jitterSamples: 2,
    jitterMutationScale: 0.2,
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
  },
};

export const QUALIFICATION_PROFILES: Record<
  Exclude<QualificationProfileId, "custom">,
  QualificationProfileMirror
> = {
  conservative: {
    id: "conservative",
    labelKo: "안정형",
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
    descriptionKo: "수익성과 안정성을 함께 평가합니다. 최소 수익률 0% 이상.",
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
    labelKo: "수익형",
    descriptionKo: "최소 수익률 제한 없음. 낙폭 허용 폭이 넓어 손실 후보도 합격할 수 있습니다.",
    minTradeCount: 5,
    minTotalReturn: null,
    maxMddAbs: 0.4,
    minWinRate: null,
    minScore: null,
    returnWeight: 1.4,
    mddWeight: 0.4,
  },
};

export const HISTORICAL_PERIOD_PRESETS: Record<
  Exclude<HistoricalPeriodPresetId, "custom">,
  { labelKo: string; days: number }
> = {
  short: { labelKo: "단기 (30일)", days: 30 },
  standard: { labelKo: "표준 (60일)", days: 60 },
  long: { labelKo: "장기 (120일)", days: 120 },
};

export interface StrategySearchOperatorFormState {
  searchName: string;
  symbol: string;
  timeframe: string;
  periodPreset: HistoricalPeriodPresetId;
  depthProfile: SearchDepthProfileId;
  qualificationProfile: QualificationProfileId;
  qualifiedTargetPreset: QualifiedTargetPreset;
  qualifiedTargetCustom: string;
  /** Explicit hard stop when qualified target is met (default false). */
  stopWhenQualifiedTarget: boolean;
  minTradeCount: string;
  minTotalReturn: string;
  maxMdd: string;
  minWinRate: string;
  minScore: string;
  availableFromDate: string;
  availableToDate: string;
  /** Primary UX: recommended coin vs manual symbol pick. */
  marketMode: MarketMode;
  /** Primary UX: runtime budget preset (minutes as string id). */
  durationPreset: DurationPresetId;
  /** Primary UX: max drawdown preset (percent string id). */
  mddPreset: MddPresetId;
  /** Primary UX: trading style mapped to qual + depth. */
  tradingStyle: TradingStyleId;
  /** Primary UX: research intent metadata for follow-up jobs. */
  researchBasis: ResearchBasisId;
  /** Advanced (collapsed) */
  seed: string;
  balance: string;
  feeRate: string;
  slippageRate: string;
  fundingRate: string;
  spreadRate: string;
  applyFunding: boolean;
  applySpread: boolean;
  stressEnabled: boolean;
  stressFeeMultiplier: string;
  stressSlippageMultiplier: string;
  jitterEnabled: boolean;
  jitterSamples: string;
  jitterMutationScale: string;
  /** Empty = use depth profile candidateBudget */
  candidateBudgetOverride: string;
  /** Empty = use depth profile; minutes when set */
  maxRuntimeMinutesOverride: string;
  showAdvanced: boolean;
  /**
   * Legacy aliases kept for older unit tests / transitional callers.
   * Prefer symbol / depthProfile / qualificationProfile / minTotalReturn.
   */
  symbols?: string;
  intensity?: SearchDepthProfileId | "balanced";
  goal?: Exclude<QualificationProfileId, "custom">;
  targetReturn?: string;
  maxSearchCount?: string;
  /** @deprecated client campaign flag — server operatorPlan always runs to target */
  runUntilQualified?: boolean;
}

function daysAgoMs(days: number): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.getTime();
}

function toDateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function generateDefaultSearchName(
  symbol: string,
  timeframe: string,
): string {
  const s = symbol.trim().toUpperCase() || "BTCUSDT";
  const tf = timeframe.trim() || "15m";
  return `${s} ${tf} 탐색`;
}

export function datesForPeriodPreset(
  preset: Exclude<HistoricalPeriodPresetId, "custom">,
): { from: string; to: string } {
  const days = HISTORICAL_PERIOD_PRESETS[preset].days;
  return {
    from: toDateInput(daysAgoMs(days)),
    to: toDateInput(daysAgoMs(0)),
  };
}

export function getDepthProfile(
  id: SearchDepthProfileId,
): SearchDepthProfileMirror {
  return SEARCH_DEPTH_PROFILES[id];
}

export function getQualificationProfile(
  id: Exclude<QualificationProfileId, "custom">,
): QualificationProfileMirror {
  return QUALIFICATION_PROFILES[id];
}

export function qualificationFieldDefaults(
  profile: QualificationProfileId,
): Pick<
  StrategySearchOperatorFormState,
  "minTradeCount" | "minTotalReturn" | "maxMdd" | "minWinRate" | "minScore"
> {
  if (profile === "custom") {
    return {
      minTradeCount: "10",
      minTotalReturn: "0",
      maxMdd: "25",
      minWinRate: "",
      minScore: "",
    };
  }
  const q = getQualificationProfile(profile);
  return {
    minTradeCount: q.minTradeCount == null ? "" : String(q.minTradeCount),
    minTotalReturn: ratioToPercentInput(q.minTotalReturn),
    maxMdd: ratioToPercentInput(q.maxMddAbs),
    minWinRate: ratioToPercentInput(q.minWinRate),
    minScore: q.minScore == null ? "" : String(q.minScore),
  };
}

export function depthFieldDefaults(
  depth: SearchDepthProfileId,
): Pick<
  StrategySearchOperatorFormState,
  | "stressEnabled"
  | "stressFeeMultiplier"
  | "stressSlippageMultiplier"
  | "jitterEnabled"
  | "jitterSamples"
  | "jitterMutationScale"
  | "candidateBudgetOverride"
  | "maxRuntimeMinutesOverride"
> {
  const d = getDepthProfile(depth);
  return {
    stressEnabled: d.stressEnabled,
    stressFeeMultiplier: String(d.stressFeeMultiplier),
    stressSlippageMultiplier: String(d.stressSlippageMultiplier),
    jitterEnabled: d.jitterEnabled,
    jitterSamples: String(d.jitterSamples),
    jitterMutationScale: String(d.jitterMutationScale),
    candidateBudgetOverride: "",
    maxRuntimeMinutesOverride: "",
  };
}

export function resolveDepthProfileId(
  form: StrategySearchOperatorFormState,
): SearchDepthProfileId {
  const raw = form.intensity ?? form.depthProfile;
  if (raw === "balanced") return "standard";
  return raw;
}

export function resolveQualificationProfileId(
  form: StrategySearchOperatorFormState,
): QualificationProfileId {
  return form.goal ?? form.qualificationProfile;
}

export function resolveSymbol(form: StrategySearchOperatorFormState): string {
  if (typeof form.symbols === "string") {
    const first = form.symbols
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)[0];
    return first ?? "";
  }
  return form.symbol.trim().toUpperCase();
}

export function resolveMinTotalReturn(
  form: StrategySearchOperatorFormState,
): string {
  if (typeof form.targetReturn === "string") return form.targetReturn;
  return form.minTotalReturn;
}

export function resolveQualifiedTarget(
  form: StrategySearchOperatorFormState,
): number {
  if (form.qualifiedTargetPreset === "custom") {
    const n = Math.trunc(Number(form.qualifiedTargetCustom));
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }
  return Math.trunc(Number(form.qualifiedTargetPreset)) || 1;
}

export function resolveCandidateBudget(
  form: StrategySearchOperatorFormState,
): number {
  const depth = getDepthProfile(resolveDepthProfileId(form));
  if (form.candidateBudgetOverride.trim() !== "") {
    const n = Math.trunc(Number(form.candidateBudgetOverride));
    if (Number.isFinite(n) && n >= 1) return n;
  }
  if (typeof form.maxSearchCount === "string" && form.maxSearchCount.trim() !== "") {
    const n = Math.trunc(Number(form.maxSearchCount));
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return depth.candidateBudget;
}

export function resolveMaxRuntimeMs(
  form: StrategySearchOperatorFormState,
): number | null {
  if (form.maxRuntimeMinutesOverride.trim() !== "") {
    const minutes = Number(form.maxRuntimeMinutesOverride);
    if (Number.isFinite(minutes) && minutes > 0) {
      return Math.round(minutes * 60 * 1000);
    }
  }
  return getDepthProfile(resolveDepthProfileId(form)).maxRuntimeMs;
}

export function resolveScoreWeights(
  form: StrategySearchOperatorFormState,
): {
  returnWeight: number;
  mddWeight: number;
} {
  const profile = resolveQualificationProfileId(form);
  if (profile === "custom") {
    return { returnWeight: 1, mddWeight: 0.5 };
  }
  const q = getQualificationProfile(profile);
  return { returnWeight: q.returnWeight, mddWeight: q.mddWeight };
}

export function createDefaultOperatorFormState(): StrategySearchOperatorFormState {
  const dates = datesForPeriodPreset("standard");
  const qual = qualificationFieldDefaults("balanced");
  const depth = depthFieldDefaults("standard");
  const symbol = "BTCUSDT";
  const timeframe = "15m";
  return {
    searchName: generateDefaultSearchName(symbol, timeframe),
    symbol,
    timeframe,
    periodPreset: "standard",
    depthProfile: "standard",
    qualificationProfile: "balanced",
    qualifiedTargetPreset: "3",
    qualifiedTargetCustom: "3",
    /** Soft goal only — research continues until time budget by default. */
    stopWhenQualifiedTarget: false,
    minTradeCount: qual.minTradeCount,
    minTotalReturn: qual.minTotalReturn,
    maxMdd: qual.maxMdd,
    minWinRate: qual.minWinRate,
    minScore: qual.minScore,
    availableFromDate: dates.from,
    availableToDate: dates.to,
    marketMode: "recommended",
    durationPreset: "180",
    mddPreset: "25",
    tradingStyle: "balanced",
    researchBasis: "fresh",
    seed: "42",
    balance: "10000",
    feeRate: "0.0004",
    slippageRate: "0.0002",
    fundingRate: "0.0001",
    spreadRate: "0.0001",
    applyFunding: false,
    applySpread: true,
    stressEnabled: depth.stressEnabled,
    stressFeeMultiplier: depth.stressFeeMultiplier,
    stressSlippageMultiplier: depth.stressSlippageMultiplier,
    jitterEnabled: depth.jitterEnabled,
    jitterSamples: depth.jitterSamples,
    jitterMutationScale: depth.jitterMutationScale,
    candidateBudgetOverride: depth.candidateBudgetOverride,
    /** Primary duration default: 3 hours. */
    maxRuntimeMinutesOverride: "180",
    showAdvanced: false,
  };
}

function parseDateStart(dateStr: string): number {
  return Date.parse(`${dateStr}T00:00:00.000Z`);
}

function parseDateEnd(dateStr: string): number {
  return Date.parse(`${dateStr}T23:59:59.999Z`);
}

function num(s: string): number {
  return Number(s);
}

function optionalNum(s: string): number | null {
  if (s.trim() === "") return null;
  return num(s);
}

/** Placeholder range — server replaces with space ranges when operatorPlan is set. */
const PLACEHOLDER_PARAM_RANGE = {
  key: "ema_fast",
  min: 8,
  max: 40,
  step: 1,
  valueType: "integer" as const,
};

/** Build one create body from operator form (single job; server orchestrates). */
export function operatorFormToCreateBody(
  form: StrategySearchOperatorFormState,
): StrategySearchCreateJobBody {
  const availableFrom = parseDateStart(form.availableFromDate);
  const availableTo = parseDateEnd(form.availableToDate);
  const symbol = resolveSymbol(form) || "BTCUSDT";
  const timeframe = form.timeframe.trim() || "15m";
  const depthId = resolveDepthProfileId(form);
  const qualId = resolveQualificationProfileId(form);
  const depth = getDepthProfile(depthId);
  const weights = resolveScoreWeights(form);
  const candidateBudget = resolveCandidateBudget(form);
  const stageBatchSize = depth.stageBatchSize;
  const maxRuntimeMs = resolveMaxRuntimeMs(form);
  const qualifiedTarget = resolveQualifiedTarget(form);
  const minScore = optionalNum(form.minScore);
  const minTotalReturn = resolveMinTotalReturn(form);
  const searchName =
    form.searchName.trim() || generateDefaultSearchName(symbol, timeframe);

  const costStressScenarios = form.stressEnabled
    ? [
        {
          id: "stress_1_5x",
          label: "비용 1.5배",
          requiredForPass: false,
          feeMultiplier: num(form.stressFeeMultiplier),
          slippageMultiplier: num(form.stressSlippageMultiplier),
          fundingMultiplier: 1,
          spreadMultiplier: num(form.stressFeeMultiplier),
          costGuardKMultiplier: 1,
        },
      ]
    : [];

  const operatorPlan: StrategySearchOperatorPlan = {
    depthProfile: depthId,
    qualificationProfile: qualId,
    qualifiedTarget,
    // Standard lifecycle never stops at qualified target (Expert Mode only).
    stopWhenQualifiedTarget: false,
    candidateBudget,
    stageBatchSize,
    maxRuntimeMs,
    minScore,
    searchName: searchName.slice(0, 80),
  };

  return {
    searchVersion: "1",
    strategyTemplateId: searchName.slice(0, 80),
    symbols: [symbol],
    timeframe,
    dataVersion: "binance-v1",
    seed: Math.trunc(num(form.seed)),
    generatorType: "random",
    maxIterations: Math.min(stageBatchSize, candidateBudget),
    parameterRanges: [PLACEHOLDER_PARAM_RANGE],
    evaluationWindows: [
      {
        id: "full",
        label: "전체 구간",
        fromOpenTime: availableFrom,
        toOpenTime: availableTo,
        requiredForPass: true,
      },
    ],
    balance: num(form.balance),
    baseCostConfig: {
      feeRate: num(form.feeRate),
      slippageRate: num(form.slippageRate),
      fundingRate: num(form.fundingRate),
      applyFunding: form.applyFunding,
      applySpread: form.applySpread,
      spreadRate: num(form.spreadRate),
    },
    passPolicy: {
      thresholds: {
        minTradeCount: optionalNum(form.minTradeCount),
        minTotalReturn: percentInputToRatio(minTotalReturn),
        maxMdd: maxDrawdownPercentToPolicy(form.maxMdd),
        minWinRate: winRatePercentToRatio(form.minWinRate),
      },
    },
    scoreWeights: {
      returnWeight: weights.returnWeight,
      mddWeight: weights.mddWeight,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios,
    jitterConfig: {
      enabled: form.jitterEnabled,
      sampleCount: Math.trunc(num(form.jitterSamples)) || 2,
      mutationScale: num(form.jitterMutationScale) || 0.2,
      seed: 7,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [PLACEHOLDER_PARAM_RANGE],
    },
    dataRef: {
      source: "binance_historical",
      availableFrom,
      availableTo,
    },
    operatorPlan,
  };
}

/** @deprecated — kept for older unit tests that import legacy form helpers */
export {
  createDefaultOperatorFormState as createDefaultFormState,
};

export type StrategySearchFormState = StrategySearchOperatorFormState;

export function formStateToCreateBody(
  form: StrategySearchOperatorFormState,
): StrategySearchCreateJobBody {
  return operatorFormToCreateBody(form);
}

/** @deprecated alias — depth stage batch size */
export function intensityBatchSize(
  intensity: SearchDepthProfileId | "balanced",
): number {
  const id = intensity === "balanced" ? "standard" : intensity;
  return getDepthProfile(id).stageBatchSize;
}

/** @deprecated alias */
export function intensityDefaults(
  intensity: SearchDepthProfileId | "balanced",
): {
  stressEnabled: boolean;
  jitterEnabled: boolean;
  jitterSamples: string;
} {
  const id = intensity === "balanced" ? "standard" : intensity;
  const d = depthFieldDefaults(id);
  return {
    stressEnabled: d.stressEnabled,
    jitterEnabled: d.jitterEnabled,
    jitterSamples: d.jitterSamples,
  };
}

/** @deprecated alias */
export function goalDefaults(goal: Exclude<QualificationProfileId, "custom">): {
  minTradeCount: string;
  maxMdd: string;
  targetReturn: string;
  returnWeight: number;
  mddWeight: number;
} {
  const q = getQualificationProfile(goal);
  return {
    minTradeCount: q.minTradeCount == null ? "" : String(q.minTradeCount),
    maxMdd: ratioToPercentInput(q.maxMddAbs),
    targetReturn: ratioToPercentInput(q.minTotalReturn),
    returnWeight: q.returnWeight,
    mddWeight: q.mddWeight,
  };
}
