/**
 * Canonical Research → Results summary.
 * Derives counts/clusters/recommendations from persisted trials + plan promotions.
 * Does not fabricate metrics or auto-register strategies.
 */

import { evaluateHighlightEligibility } from "../results/eligibility";
import {
  buildStrategyDisplayAlias,
  resolveCostStatus,
  resolveReviewStage,
  resolveSampleConfidence,
  type CostStatusKo,
  type SampleConfidenceKo,
  type StrategyRoleBadge,
} from "../results/researchDisplay";
import { listStrategies } from "../strategy/strategyStore";
import { EXPECTED_SAFE_PARAMS_HASH } from "../strategy/strategyTypes";
import {
  getSearchJob,
  getSearchTrial,
  listSearchTrials,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { getSearchPlan } from "./searchPlan";
import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import { describeLeverageFromParams } from "./leverageMode";
import {
  combinationLabelKo,
  resolveCombinationFromParams,
} from "./patternCombination";
import {
  buildReadableStrategyIdentity,
  classifySafeV44Family,
  classifyStyleProfile,
  type StrategyFamilyId,
} from "./readableStrategyName";
import { resolveResearchOutcome } from "./researchOutcome";
import type { StrategySearchTrial } from "./types";
import {
  promoteSearchCandidateToStrategy,
  promoteSelectedTrialsFromJob,
} from "./promoteFromSearch";
import {
  buildAndPersistResearchTop10,
  buildResearchScopeKey,
  finalizeResearchTop10,
  findLatestSameScopeTop10,
  getResearchTop10,
} from "./researchTop10";

export interface ResearchResultCounts {
  evaluatedStrategies: number;
  qualifiedStrategies: number;
  uniqueQualifiedStrategies: number;
  clusteredRepresentatives: number;
  duplicateOrNearDuplicateMembers: number;
  promotedStrategies: number;
  registeredStrategies: number;
  recommendationEligibleStrategies: number;
  backtestRecommendedStrategies: number;
  /** Persistent Top-10 shortlist size (≤10). */
  top10Saved: number;
  /** Qualification stage funnel counts (evidence-based). */
  stageBasicQualified: number;
  stageStabilityPassed: number;
  stageCostPassed: number;
  stageSampleOk: number;
  stageOverfitOk: number;
  stageFinalRecommendable: number;
}

export interface ResearchResultCard {
  iteration: number;
  candidateId: string;
  paramsHash: string;
  /** Canonical family · style name (immutable identity display base). */
  readableName: string;
  /** Deterministic alias with short discriminator for scanning. */
  displayAlias: string;
  strategyFamily: StrategyFamilyId;
  symbol: string;
  timeframe: string;
  sourceResearchJobId: string;
  netReturn: number | null;
  maxDrawdown: number | null;
  tradeCount: number | null;
  profitFactor: number | null;
  winRate?: number | null;
  /** Computed only when an actual persisted return/equity series exists. */
  sharpe?: number | null;
  patternStack?: string;
  confidence?: string;
  risk?: string;
  /** Bounded actual persisted series; null when the trial did not store one. */
  miniSeries?: number[] | null;
  totalCost: number | null;
  costStatus: CostStatusKo;
  sampleConfidence: SampleConfidenceKo;
  sampleConfidenceDetail: string;
  score: number | null;
  stressPassed: boolean | null;
  jitterPassed: boolean | null;
  robustnessStatus: string;
  overfittingRisk: string;
  /** Clarified review stage label (does not change recommendable membership). */
  eligibilityStatus: string;
  recommendable: boolean;
  finalRecommendable: boolean;
  roles: StrategyRoleBadge[];
  registrationState: "미등록" | "등록됨" | "중복" | "등록 실패";
  registeredStrategyId: string | null;
  clusterId: string;
  isRepresentative: boolean;
  memberCount: number;
  strongestPoint: string;
  primaryWeakness: string;
  recommendationReason: string;
  /** Leverage summary from trial params (or n/a for pattern strategies). */
  leverageLabel: string;
  /** Why this card is not #1 (heuristic; empty when rank 1 or unknown). */
  whyNotRank1: string;
  /** Prior Top-10 rank note when available. */
  vsPreviousRankNote: string;
}

export interface ResearchCluster {
  clusterId: string;
  representativeIteration: number;
  representativeParamsHash: string;
  memberCount: number;
  memberIterations: number[];
  exactHashMembers: string[];
  structuralSimilarityMembers: number[];
  similarityReason: string;
  family: StrategyFamilyId;
  structureFingerprint: string;
  parameterDistance: number | null;
  comparisonReason: string;
}

export interface BestReturnView {
  labelKo: string;
  netReturn: number | null;
  iteration: number | null;
  paramsHash: string | null;
  readableName: string | null;
  explanationKo: string;
}

export interface ResearchResultsSummary {
  jobId: string;
  searchName: string;
  status: string;
  symbol: string;
  timeframe: string;
  outcome: ReturnType<typeof resolveResearchOutcome>;
  counts: ResearchResultCounts;
  equation: string;
  /** Checkpoint best-passed during search (score-selected). */
  liveSearchBest: BestReturnView;
  /** Finalized representative ranking by net return. */
  finalizedBest: BestReturnView;
  topProfit: ResearchResultCard | null;
  topStable: ResearchResultCard | null;
  topRecommend: ResearchResultCard | null;
  backtestRecommendations: ResearchResultCard[];
  /** Persistent Top-10 shortlist (canonical Results focus). */
  top10: ResearchResultCard[];
  top10RankChanges: Array<{
    strategyHash: string;
    change: string;
    previousRank: number | null;
    currentRank: number | null;
  }>;
  clusters: ResearchCluster[];
  /** Full representatives — expert/secondary “원본 후보” view only. */
  representatives: ResearchResultCard[];
  selectionSummary: {
    whyTopSelected: string[];
    whyExcluded: string[];
    overfittingNote: string;
    costSensitivityNote: string;
    drawdownRiskNote: string;
    tradeConfidenceNote: string;
    nextActions: string[];
  };
  provenanceNote: string;
}

const SOURCE_JOB_RE = /sourceResearchJobId=([^\s·]+)/;
const SOURCE_ITER_RE = /sourceTrialIteration=(\d+)/;

export function parseSourceResearchJobId(
  description: string | null | undefined,
): string | null {
  if (!description) return null;
  const m = description.match(SOURCE_JOB_RE);
  return m?.[1] ?? null;
}

export function parseSourceTrialIteration(
  description: string | null | undefined,
): number | null {
  if (!description) return null;
  const m = description.match(SOURCE_ITER_RE);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}

function primaryWindow(trial: StrategySearchTrial): {
  totalReturn: number | null;
  mdd: number | null;
  trades: number | null;
  profitFactor: number | null;
  totalCost: number | null;
  winRate: number | null;
  sharpe: number | null;
  miniSeries: number[] | null;
} {
  const w = (trial.windowResults?.[0] ?? {}) as Record<string, unknown>;
  const num = (k: string) =>
    typeof w[k] === "number" && Number.isFinite(w[k] as number)
      ? (w[k] as number)
      : null;
  // Prefer totalCost; fall back to totalCostUsdt when present in newer adapters.
  const totalCost = num("totalCost") ?? num("totalCostUsdt");
  const rawSeries = (() => {
    for (const key of ["equityCurve", "equity", "returns", "returnSeries"]) {
      const value = w[key];
      if (
        Array.isArray(value) &&
        value.length > 1 &&
        value.every((item) => typeof item === "number" && Number.isFinite(item))
      ) {
        return value as number[];
      }
    }
    const monthly = w.monthlyReturns;
    if (Array.isArray(monthly)) {
      const values = monthly
        .map((item) =>
          item &&
          typeof item === "object" &&
          typeof (item as { returnPct?: unknown }).returnPct === "number"
            ? (item as { returnPct: number }).returnPct
            : null,
        )
        .filter((item): item is number => item != null && Number.isFinite(item));
      if (values.length > 1) return values;
    }
    return null;
  })();
  const isEquitySeries =
    rawSeries != null &&
    (w.equityCurve === rawSeries || w.equity === rawSeries);
  const returns = rawSeries
    ? isEquitySeries
      ? rawSeries
          .slice(1)
          .map((value, index) =>
            rawSeries[index] !== 0 ? value / rawSeries[index]! - 1 : 0,
          )
      : [...rawSeries]
    : null;
  const sharpe =
    returns && returns.length > 1
      ? (() => {
          const mean =
            returns.reduce((sum, value) => sum + value, 0) / returns.length;
          const variance =
            returns.reduce(
              (sum, value) => sum + (value - mean) * (value - mean),
              0,
            ) /
            (returns.length - 1);
          const deviation = Math.sqrt(variance);
          return deviation > 0
            ? (mean / deviation) * Math.sqrt(returns.length)
            : null;
        })()
      : null;
  const miniSeries =
    rawSeries == null
      ? null
      : rawSeries.length <= 30
        ? [...rawSeries]
        : Array.from({ length: 30 }, (_, index) => {
            const sourceIndex = Math.round(
              (index * (rawSeries.length - 1)) / 29,
            );
            return rawSeries[sourceIndex]!;
          });
  return {
    totalReturn: num("totalReturn"),
    mdd: num("mdd"),
    trades: num("trades"),
    profitFactor: num("profitFactor"),
    totalCost,
    winRate: num("winRate"),
    sharpe,
    miniSeries,
  };
}

function stressPassedOf(trial: StrategySearchTrial): boolean | null {
  const rows = trial.costStressResults ?? [];
  if (rows.length === 0) return null;
  // Strict: every row must explicitly pass (matches weaknessAnalysis).
  return rows.every((r) => (r as { passed?: boolean }).passed === true);
}

function jitterPassedOf(trial: StrategySearchTrial): boolean | null {
  const rows = trial.jitterResults ?? [];
  if (rows.length === 0) return null;
  return rows.every((r) => (r as { passed?: boolean }).passed === true);
}

function strengthWeakness(input: {
  netReturn: number | null;
  maxDrawdown: number | null;
  tradeCount: number | null;
  stressPassed: boolean | null;
}): { strength: string; weakness: string } {
  const strength =
    input.netReturn != null && input.netReturn > 0
      ? `순수익 ${(input.netReturn * 100).toFixed(2)}%`
      : input.tradeCount != null
        ? `거래 ${input.tradeCount}건`
        : "성과 데이터 확인";
  const weakness =
    input.maxDrawdown != null && Math.abs(input.maxDrawdown) > 0.2
      ? `낙폭 ${(input.maxDrawdown * 100).toFixed(2)}%`
      : input.stressPassed === false
        ? "비용 부담 검증 미통과"
        : input.tradeCount != null && input.tradeCount < 10
          ? "거래 수 부족"
          : "추가 검증 권장";
  return { strength, weakness };
}

function compositeScore(card: {
  netReturn: number | null;
  maxDrawdown: number | null;
  profitFactor: number | null;
  score: number | null;
  stressPassed: boolean | null;
  jitterPassed: boolean | null;
}): number {
  const r = card.netReturn ?? -1;
  const mdd = Math.abs(card.maxDrawdown ?? 1);
  const pf = card.profitFactor ?? 0;
  const base = card.score ?? r * 2 - mdd + pf * 0.1;
  const bonus =
    (card.stressPassed === true ? 0.05 : 0) +
    (card.jitterPassed === true ? 0.05 : 0);
  return base + bonus;
}

function numParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function boolParam(
  params: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const v = params[key];
  return typeof v === "boolean" ? v : fallback;
}

function bucket(value: number, step: number): number {
  if (!Number.isFinite(value) || step <= 0) return 0;
  return Math.round(value / step) * step;
}

/**
 * Canonical SafeV44 structure fingerprint (no free-form AST in this codebase).
 * Entry / exit / risk logic must match before any near-duplicate merge.
 * If fingerprints differ, clustering is forbidden even when performance is similar.
 */
export function buildStructureFingerprint(
  params: Record<string, unknown>,
): string {
  const family = classifySafeV44Family(params);
  const style = classifyStyleProfile(params);
  const confirmBull = boolParam(
    params,
    "confirm_bull",
    CONTEXT_FALLBACK_PARAMS.confirm_bull,
  );
  const confirmBear = boolParam(
    params,
    "confirm_bear",
    CONTEXT_FALLBACK_PARAMS.confirm_bear,
  );
  const useTrailing = boolParam(
    params,
    "use_trailing",
    CONTEXT_FALLBACK_PARAMS.use_trailing,
  );
  const allowInRange = boolParam(
    params,
    "allow_in_range",
    CONTEXT_FALLBACK_PARAMS.allow_in_range,
  );
  const emaFast = numParam(params, "ema_fast", CONTEXT_FALLBACK_PARAMS.ema_fast);
  const emaMid = numParam(params, "ema_mid", CONTEXT_FALLBACK_PARAMS.ema_mid);
  const entry = [
    confirmBull ? "bull1" : "bull0",
    confirmBear ? "bear1" : "bear0",
    `brk${bucket(numParam(params, "break_margin", CONTEXT_FALLBACK_PARAMS.break_margin), 0.0005)}`,
    `pb${bucket(numParam(params, "pullback_max_dist", CONTEXT_FALLBACK_PARAMS.pullback_max_dist), 0.005)}`,
    emaFast < emaMid ? "ema_fast_lt_mid" : "ema_fast_ge_mid",
  ].join(",");
  const exit = [
    `sl${bucket(numParam(params, "sl_atr_mult", CONTEXT_FALLBACK_PARAMS.sl_atr_mult), 0.25)}`,
    `tp${bucket(numParam(params, "tp_atr_mult", CONTEXT_FALLBACK_PARAMS.tp_atr_mult), 0.25)}`,
    useTrailing ? "trail1" : "trail0",
    `hold${bucket(numParam(params, "max_hold_bars", CONTEXT_FALLBACK_PARAMS.max_hold_bars), 8)}`,
  ].join(",");
  const risk = [
    style,
    allowInRange ? "range1" : "range0",
    `vol${bucket(numParam(params, "vol_ratio_min", CONTEXT_FALLBACK_PARAMS.vol_ratio_min), 0.1)}`,
  ].join(",");
  return `${family}|entry:${entry}|exit:${exit}|risk:${risk}`;
}

function keyParamFingerprint(params: Record<string, unknown>): number[] {
  const keys = [
    "ema_fast",
    "ema_mid",
    "ema_slow",
    "rsi_period",
    "sl_atr_mult",
    "tp_atr_mult",
    "vol_ratio_min",
    "pullback_max_dist",
  ];
  return keys.map((k) => {
    const v = params[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  });
}

function parameterDistance(
  aParams: Record<string, unknown>,
  bParams: Record<string, unknown>,
): number {
  const fa = keyParamFingerprint(aParams);
  const fb = keyParamFingerprint(bParams);
  let sum = 0;
  for (let i = 0; i < fa.length; i += 1) {
    const av = fa[i]!;
    const bv = fb[i]!;
    const scale = Math.max(1, Math.abs(av), Math.abs(bv));
    sum += Math.abs(av - bv) / scale;
  }
  return sum / fa.length;
}

/**
 * Near-duplicate only when structural fingerprint matches AND params are close.
 * Performance proximity is secondary and never sufficient alone.
 */
export function areStructurallyNearDuplicates(
  aParams: Record<string, unknown>,
  bParams: Record<string, unknown>,
  opts?: {
    aRet?: number | null;
    bRet?: number | null;
    aMdd?: number | null;
    bMdd?: number | null;
  },
): { ok: boolean; reason: string; distance: number } {
  const fa = buildStructureFingerprint(aParams);
  const fb = buildStructureFingerprint(bParams);
  if (fa !== fb) {
    return {
      ok: false,
      reason: "구조 지문이 달라 클러스터하지 않음",
      distance: 1,
    };
  }
  const dist = parameterDistance(aParams, bParams);
  const keysA = keyParamFingerprint(aParams);
  const keysB = keyParamFingerprint(bParams);
  let closeParams = 0;
  for (let i = 0; i < keysA.length; i += 1) {
    const av = keysA[i]!;
    const bv = keysB[i]!;
    const scale = Math.max(1, Math.abs(av), Math.abs(bv));
    if (Math.abs(av - bv) / scale <= 0.12) closeParams += 1;
  }
  // Require tight parameter proximity — structure alone is not enough.
  if (closeParams < 7 || dist > 0.1) {
    return {
      ok: false,
      reason: "동일 구조이나 파라미터 거리가 커서 분리",
      distance: dist,
    };
  }
  // Secondary: borderline proximity also needs similar performance.
  if (closeParams < 8 || dist > 0.05) {
    const aRet = opts?.aRet ?? null;
    const bRet = opts?.bRet ?? null;
    const aMdd = opts?.aMdd ?? null;
    const bMdd = opts?.bMdd ?? null;
    if (aRet != null && bRet != null && Math.abs(aRet - bRet) > 0.08) {
      return {
        ok: false,
        reason: "구조·파라미터 경계 · 성과 차이로 분리",
        distance: dist,
      };
    }
    if (aMdd != null && bMdd != null && Math.abs(aMdd - bMdd) > 0.05) {
      return {
        ok: false,
        reason: "구조·파라미터 경계 · 낙폭 차이로 분리",
        distance: dist,
      };
    }
  }
  return {
    ok: true,
    reason: "동일 구조 지문 · 유사 파라미터",
    distance: dist,
  };
}

function toCard(
  trial: StrategySearchTrial,
  jobId: string,
  symbol: string,
  timeframe: string,
  registeredByHash: Map<string, string>,
  clusterId: string,
  isRepresentative: boolean,
  memberCount: number,
): ResearchResultCard {
  const w = primaryWindow(trial);
  const stressPassed = stressPassedOf(trial);
  const jitterPassed = jitterPassedOf(trial);
  const identity = buildReadableStrategyIdentity(
    trial.params as Record<string, unknown>,
    trial.paramsHash,
    {
      includeSuffix: false,
      symbol,
      timeframe,
      comboAware: true,
    },
  );
  const hasStressEvidence = (trial.costStressResults?.length ?? 0) > 0;
  const hasAbsoluteCost =
    w.totalCost != null && Number.isFinite(w.totalCost);
  // Final recommendation cost gate: stress evidence (project rule). Absolute fee total is display-only.
  const hasCostEvidence = hasStressEvidence || hasAbsoluteCost;
  const eligibility = evaluateHighlightEligibility({
    hasBacktest: w.totalReturn != null && w.mdd != null,
    totalReturn: w.totalReturn,
    mdd: w.mdd,
    tradeCount: w.trades,
    passed: trial.passed,
    strategyId: trial.candidateId,
    strategyHash: trial.paramsHash,
    hasCostEvidence,
    overfittingInput: {
      jitterEnabled: (trial.jitterResults?.length ?? 0) > 0,
      jitterPassed,
      stressEnabled: hasStressEvidence,
      stressPassed,
      tradeCount: w.trades,
      minTradeCount: 5,
    },
  });
  const sw = strengthWeakness({
    netReturn: w.totalReturn,
    maxDrawdown: w.mdd,
    tradeCount: w.trades,
    stressPassed,
  });
  const registeredId = registeredByHash.get(trial.paramsHash) ?? null;
  const sample = resolveSampleConfidence(w.trades);
  const costStatus = resolveCostStatus({
    totalCost: w.totalCost,
    stressPassed,
  });
  const reviewStage = resolveReviewStage({
    recommendable: eligibility.eligible,
    stressPassed,
    jitterPassed,
  });
  const finalRecommendable =
    eligibility.eligible && stressPassed === true;
  const combination = resolveCombinationFromParams(
    trial.params as Record<string, unknown>,
  );
  return {
    iteration: trial.iteration,
    candidateId: trial.candidateId,
    paramsHash: trial.paramsHash,
    readableName: identity.readableName,
    displayAlias: buildStrategyDisplayAlias({
      readableName: identity.readableName,
      paramsHash: trial.paramsHash,
    }),
    strategyFamily: identity.strategyFamily,
    symbol,
    timeframe,
    sourceResearchJobId: jobId,
    netReturn: w.totalReturn,
    maxDrawdown: w.mdd,
    tradeCount: w.trades,
    profitFactor: w.profitFactor,
    winRate: w.winRate,
    sharpe: w.sharpe,
    patternStack: combination
      ? combinationLabelKo(combination)
      : identity.readableName.split(" · ")[1] ?? identity.readableName,
    confidence: sample.level,
    risk:
      jitterPassed == null ? "검증 대기" : jitterPassed ? "낮음" : "높음",
    miniSeries: w.miniSeries,
    totalCost: w.totalCost,
    costStatus,
    sampleConfidence: sample.level,
    sampleConfidenceDetail: sample.detailKo,
    score: trial.score,
    stressPassed,
    jitterPassed,
    robustnessStatus:
      stressPassed == null
        ? "검증 대기"
        : stressPassed
          ? "거래 안정성 통과"
          : "거래 안정성 미통과",
    overfittingRisk:
      jitterPassed == null ? "검증 대기" : jitterPassed ? "낮음" : "높음",
    eligibilityStatus: reviewStage,
    recommendable: eligibility.eligible,
    finalRecommendable,
    roles: [],
    registrationState: registeredId ? "등록됨" : "미등록",
    registeredStrategyId: registeredId,
    clusterId,
    isRepresentative,
    memberCount,
    strongestPoint: sw.strength,
    primaryWeakness: sw.weakness,
    recommendationReason: eligibility.eligible
      ? reviewStage === "최종 추천 가능"
        ? "합격·비용 스트레스·거래 안정성·과거 데이터 편중 증거를 충족"
        : "기본 수익·낙폭 조건을 통과 · 안정성 추가 검증 권장"
      : eligibility.messageKo ?? "추가 검증 필요",
    leverageLabel: describeLeverageFromParams(
      trial.params as Record<string, unknown>,
    ),
    whyNotRank1: "",
    vsPreviousRankNote: "",
  };
}

export function buildResearchResultsSummary(
  jobId: string,
  options?: StrategySearchStoreOptions,
): ResearchResultsSummary {
  const job = getSearchJob(jobId, options);
  if (!job) {
    throw new Error(`strategy-search job not found: ${jobId}`);
  }
  const plan = getSearchPlan(jobId, options);
  const symbol = job.config.symbols[0] ?? "BTCUSDT";
  const timeframe = job.config.timeframe;
  const trials = listSearchTrials(jobId, options);
  const passed = trials.filter(
    (t) =>
      t.passed &&
      t.paramsHash &&
      !t.paramsHash.startsWith("invalid_") &&
      t.paramsHash !== EXPECTED_SAFE_PARAMS_HASH &&
      t.paramsHash !== "7893ca3f0e30",
  );

  const strategies = listStrategies();
  const registeredByHash = new Map(
    strategies.filter((s) => !s.locked).map((s) => [s.paramsHash, s.id]),
  );
  const registeredFromJob = strategies.filter((s) => {
    if (s.locked) return false;
    const src = parseSourceResearchJobId(s.description);
    return src === jobId;
  });

  const promotedFromPlan = (plan?.promotions ?? []).filter(
    (p) => p.status === "promoted" || p.status === "duplicate",
  );

  // Exact unique by hash (already unique for this job, but keep invariant).
  const byHash = new Map<string, StrategySearchTrial>();
  for (const t of passed) {
    const prev = byHash.get(t.paramsHash);
    if (!prev || (t.score ?? -Infinity) > (prev.score ?? -Infinity)) {
      byHash.set(t.paramsHash, t);
    }
  }
  const uniquePassed = [...byHash.values()].sort(
    (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity),
  );

  // Near-duplicate clusters require proven structural similarity first.
  const clusters: ResearchCluster[] = [];
  const trialCluster = new Map<number, string>();
  const reps: StrategySearchTrial[] = [];

  for (const trial of uniquePassed) {
    const family = classifySafeV44Family(
      trial.params as Record<string, unknown>,
    );
    const structureFingerprint = buildStructureFingerprint(
      trial.params as Record<string, unknown>,
    );
    const w = primaryWindow(trial);
    let assigned: ResearchCluster | null = null;
    let joinReason = "";
    let joinDistance: number | null = null;
    for (const c of clusters) {
      if (c.structureFingerprint !== structureFingerprint) continue;
      if (c.family !== family) continue;
      const rep = uniquePassed.find((t) => t.iteration === c.representativeIteration);
      if (!rep) continue;
      const rw = primaryWindow(rep);
      const cmp = areStructurallyNearDuplicates(
        trial.params as Record<string, unknown>,
        rep.params as Record<string, unknown>,
        {
          aRet: w.totalReturn,
          bRet: rw.totalReturn,
          aMdd: w.mdd,
          bMdd: rw.mdd,
        },
      );
      if (cmp.ok) {
        assigned = c;
        joinReason = cmp.reason;
        joinDistance = cmp.distance;
        break;
      }
    }
    if (!assigned) {
      const clusterId = `cluster_${family}_${structureFingerprint.slice(0, 24)}_${trial.paramsHash.slice(0, 8)}`;
      assigned = {
        clusterId,
        representativeIteration: trial.iteration,
        representativeParamsHash: trial.paramsHash,
        memberCount: 1,
        memberIterations: [trial.iteration],
        exactHashMembers: [trial.paramsHash],
        structuralSimilarityMembers: [trial.iteration],
        similarityReason: "동일 구조 지문 · 단독 대표",
        family,
        structureFingerprint,
        parameterDistance: 0,
        comparisonReason: "구조 유사성이 증명된 경우에만 병합",
      };
      clusters.push(assigned);
      reps.push(trial);
      trialCluster.set(trial.iteration, clusterId);
    } else {
      assigned.memberCount += 1;
      assigned.memberIterations.push(trial.iteration);
      assigned.structuralSimilarityMembers.push(trial.iteration);
      if (!assigned.exactHashMembers.includes(trial.paramsHash)) {
        assigned.exactHashMembers.push(trial.paramsHash);
      }
      assigned.similarityReason = joinReason || assigned.similarityReason;
      if (joinDistance != null) {
        assigned.parameterDistance =
          assigned.parameterDistance == null
            ? joinDistance
            : Math.max(assigned.parameterDistance, joinDistance);
      }
      trialCluster.set(trial.iteration, assigned.clusterId);
      const currentRep = uniquePassed.find(
        (t) => t.iteration === assigned!.representativeIteration,
      )!;
      const curCard = {
        netReturn: primaryWindow(currentRep).totalReturn,
        maxDrawdown: primaryWindow(currentRep).mdd,
        profitFactor: primaryWindow(currentRep).profitFactor,
        score: currentRep.score,
        stressPassed: stressPassedOf(currentRep),
        jitterPassed: jitterPassedOf(currentRep),
      };
      const nextCard = {
        netReturn: w.totalReturn,
        maxDrawdown: w.mdd,
        profitFactor: w.profitFactor,
        score: trial.score,
        stressPassed: stressPassedOf(trial),
        jitterPassed: jitterPassedOf(trial),
      };
      if (compositeScore(nextCard) > compositeScore(curCard)) {
        assigned.representativeIteration = trial.iteration;
        assigned.representativeParamsHash = trial.paramsHash;
        const idx = reps.findIndex(
          (r) => r.paramsHash === currentRep.paramsHash,
        );
        if (idx >= 0) reps[idx] = trial;
      }
    }
  }

  const representatives = reps.map((trial) => {
    const clusterId = trialCluster.get(trial.iteration)!;
    const cluster = clusters.find((c) => c.clusterId === clusterId)!;
    return toCard(
      trial,
      jobId,
      symbol,
      timeframe,
      registeredByHash,
      clusterId,
      true,
      cluster.memberCount,
    );
  });

  const recommendable = representatives.filter((c) => c.recommendable);
  const byReturn = [...representatives].sort(
    (a, b) => (b.netReturn ?? -Infinity) - (a.netReturn ?? -Infinity),
  );
  const byStability = [...recommendable].sort((a, b) => {
    const ma = Math.abs(a.maxDrawdown ?? 1);
    const mb = Math.abs(b.maxDrawdown ?? 1);
    if (ma !== mb) return ma - mb;
    return (b.profitFactor ?? 0) - (a.profitFactor ?? 0);
  });
  const byRecommend = [...recommendable].sort(
    (a, b) => compositeScore(b) - compositeScore(a),
  );

  const topProfit = byReturn[0] ?? null;
  const topStable = byStability[0] ?? null;
  const topRecommend = byRecommend[0] ?? null;

  const roleByHash = new Map<string, StrategyRoleBadge[]>();
  const pushRole = (hash: string | undefined, role: StrategyRoleBadge) => {
    if (!hash) return;
    const prev = roleByHash.get(hash) ?? [];
    if (!prev.includes(role)) prev.push(role);
    roleByHash.set(hash, prev);
  };
  pushRole(topProfit?.paramsHash, "TOP 수익");
  pushRole(topStable?.paramsHash, "TOP 안정");
  pushRole(topRecommend?.paramsHash, "최종 추천");

  const withRoles = (card: ResearchResultCard): ResearchResultCard => ({
    ...card,
    roles: roleByHash.get(card.paramsHash) ?? [],
  });

  const backtestRecommendations = byRecommend.slice(0, 10).map((c, i) => {
    const roles = [...(roleByHash.get(c.paramsHash) ?? [])];
    if (!roles.includes("백테스트 추천")) roles.push("백테스트 추천");
    roleByHash.set(c.paramsHash, roles);
    const leader = byRecommend[0];
    let whyNotRank1 = "";
    if (i > 0 && leader) {
      const parts: string[] = [];
      if (
        (leader.netReturn ?? -Infinity) > (c.netReturn ?? -Infinity) &&
        (leader.netReturn ?? 0) - (c.netReturn ?? 0) > 0.005
      ) {
        parts.push("1위 대비 순수익이 낮음");
      }
      if (
        Math.abs(c.maxDrawdown ?? 1) >
        Math.abs(leader.maxDrawdown ?? 1) + 0.01
      ) {
        parts.push("1위 대비 낙폭이 큼");
      }
      if ((c.tradeCount ?? 0) + 5 < (leader.tradeCount ?? 0)) {
        parts.push("1위 대비 거래 표본이 적음");
      }
      if (c.primaryWeakness && c.primaryWeakness !== leader.primaryWeakness) {
        parts.push(`약점: ${c.primaryWeakness}`);
      }
      whyNotRank1 =
        parts.length > 0
          ? parts.join(" · ")
          : "종합 점수가 1위보다 낮아 차순위";
    }
    return {
      ...c,
      roles,
      recommendationReason: `백테스트 추천 ${i + 1}위 · ${c.recommendationReason}`,
      whyNotRank1,
      vsPreviousRankNote: "",
    };
  });

  const evaluated =
    plan?.uniqueEvaluatedCount ??
    trials.length;
  const qualified = plan?.qualifiedHashes.length ?? passed.length;
  const uniqueQualified = uniquePassed.length;
  const clusteredReps = representatives.length;
  const dupMembers = Math.max(0, uniqueQualified - clusteredReps);
  const promoted = promotedFromPlan.length;
  const registered = registeredFromJob.length;
  // If promotions empty but registry has matching hashes from this job's trials:
  const registeredByHashCount = uniquePassed.filter((t) =>
    registeredByHash.has(t.paramsHash),
  ).length;

  const stageBasicQualified = uniqueQualified;
  const stageStabilityPassed = representatives.filter(
    (c) => c.jitterPassed === true || c.robustnessStatus.includes("통과"),
  ).length;
  const stageCostPassed = representatives.filter(
    (c) =>
      c.costStatus === "비용 스트레스 통과" ||
      c.stressPassed === true,
  ).length;
  const stageSampleOk = representatives.filter(
    (c) =>
      c.sampleConfidence === "표본 충분" ||
      c.sampleConfidence === "표본 보통",
  ).length;
  const stageOverfitOk = representatives.filter(
    (c) =>
      c.overfittingRisk !== "high" && c.overfittingRisk !== "unavailable",
  ).length;
  const stageFinalRecommendable = recommendable.filter(
    (c) => c.finalRecommendable,
  ).length;

  const comboFamilies =
    plan?.patternCombinationSpec?.blocks.map((b) => b.family) ??
    plan?.patternCombinationFamilies ??
    null;
  const patternStackKey =
    comboFamilies && comboFamilies.length > 0
      ? `${plan?.patternCombinationOperator ?? "single"}:${comboFamilies.join("+")}`
      : (plan?.spaces ?? []).map((s) => s.id).join("+") || "default";
  const scopeKey = buildResearchScopeKey({
    symbol,
    timeframe,
    qualificationProfile: plan?.qualificationProfile ?? null,
    depthProfile: plan?.depthProfile ?? null,
    stressEnabled: true,
    jitterEnabled: true,
    patternStackKey,
  });
  const previousSameScope = findLatestSameScopeTop10(scopeKey, jobId, options);
  const top10Snapshot = buildAndPersistResearchTop10({
    jobId,
    scopeKey,
    representatives: representatives.map(withRoles),
    previousSameScope,
    options,
  });
  const isTerminal =
    job.status === "completed" ||
    job.status === "cancelled" ||
    job.status === "failed";
  if (isTerminal && !top10Snapshot.finalizedAt) {
    finalizeResearchTop10(jobId, options);
  }
  const top10Cards = top10Snapshot.entries
    .map((e) =>
      representatives.find(
        (r) =>
          r.paramsHash === e.strategyHash &&
          r.iteration === e.sourceTrialIteration,
      ),
    )
    .filter((c): c is ResearchResultCard => !!c)
    .map((c) => {
      const entry = top10Snapshot.entries.find(
        (e) => e.strategyHash === c.paramsHash,
      );
      return {
        ...withRoles(c),
        roles: entry?.roleBadges ?? c.roles,
      };
    });

  const counts: ResearchResultCounts = {
    evaluatedStrategies: evaluated,
    qualifiedStrategies: qualified,
    uniqueQualifiedStrategies: uniqueQualified,
    clusteredRepresentatives: clusteredReps,
    duplicateOrNearDuplicateMembers: dupMembers,
    promotedStrategies: Math.max(promoted, registered),
    registeredStrategies: Math.max(registered, registeredByHashCount),
    recommendationEligibleStrategies: recommendable.length,
    backtestRecommendedStrategies: backtestRecommendations.length,
    top10Saved: top10Cards.length,
    stageBasicQualified,
    stageStabilityPassed,
    stageCostPassed,
    stageSampleOk,
    stageOverfitOk,
    stageFinalRecommendable,
  };

  const liveRef =
    job.checkpoint.bestPassedCandidate ?? job.checkpoint.bestCandidate;
  let liveReturn: number | null = null;
  let liveName: string | null = null;
  let liveHash: string | null = null;
  let liveIter: number | null = null;
  if (liveRef) {
    const liveTrial = getSearchTrial(jobId, liveRef.iteration, options);
    liveIter = liveRef.iteration;
    liveHash = liveRef.paramsHash;
    const lw = liveTrial ? primaryWindow(liveTrial) : null;
    liveReturn = lw?.totalReturn ?? null;
    if (liveTrial?.params) {
      liveName = buildReadableStrategyIdentity(
        liveTrial.params as Record<string, unknown>,
        liveTrial.paramsHash,
        { includeSuffix: false },
      ).readableName;
    }
  }

  const outcome = resolveResearchOutcome({
    status: job.status,
    completionReason: plan?.completionReason ?? null,
    preservedResultCount: qualified,
    qualifiedCount: qualified,
  });

  const whyExcluded: string[] = [];
  if (dupMembers > 0) {
    whyExcluded.push(
      `구조가 동일한 유사 전략 ${dupMembers}개는 대표 전략 카드에 묶여 목록 기본값에서 접혀 있습니다.`,
    );
  }
  const nonRec = representatives.length - recommendable.length;
  if (nonRec > 0) {
    whyExcluded.push(
      `${nonRec}개 대표 전략은 거래 안정성·과거 데이터 편중 증거 부족으로 최종 추천에서 제외됐습니다.`,
    );
  }
  whyExcluded.push(
    "구조 지문이 다른 전략은 성과가 비슷해도 클러스터하지 않습니다.",
  );
  whyExcluded.push("SAFE 원본·보호 해시는 이번 탐색 결과에서 제외됩니다.");

  const liveSearchBest: BestReturnView = {
    labelKo: "실시간 탐색 최고",
    netReturn: liveReturn,
    iteration: liveIter,
    paramsHash: liveHash,
    readableName: liveName,
    explanationKo:
      "탐색 중 마지막으로 기록된 최고 전략(점수 기준 합격 후보)",
  };
  const finalizedBest: BestReturnView = {
    labelKo: "최종 정리 후 최고",
    netReturn: topProfit?.netReturn ?? null,
    iteration: topProfit?.iteration ?? null,
    paramsHash: topProfit?.paramsHash ?? null,
    readableName: topProfit?.readableName ?? null,
    explanationKo:
      "유사 전략 정리와 최종 순위 계산 후 선정된 최고 전략(순수익 기준 대표)",
  };

  return {
    jobId,
    searchName: plan?.searchName ?? job.config.strategyTemplateId,
    status: job.status,
    symbol,
    timeframe,
    outcome,
    counts,
    equation:
      "qualifiedStrategies ⊇ uniqueQualifiedStrategies ≥ clusteredRepresentatives; registeredStrategies ⊆ promotedStrategies",
    liveSearchBest,
    finalizedBest,
    topProfit: topProfit ? withRoles(topProfit) : null,
    topStable: topStable ? withRoles(topStable) : null,
    topRecommend: topRecommend ? withRoles(topRecommend) : null,
    backtestRecommendations,
    top10: top10Cards,
    top10RankChanges: top10Snapshot.rankChanges,
    clusters,
    // Full representative set — secondary “원본 후보” explorer only.
    representatives: representatives
      .sort((a, b) => compositeScore(b) - compositeScore(a))
      .map(withRoles),
    selectionSummary: {
      whyTopSelected: [
        topProfit
          ? `최종 정리 후 최고: ${topProfit.displayAlias} (순수익 ${((topProfit.netReturn ?? 0) * 100).toFixed(2)}%)`
          : "최고 수익 후보 없음",
        liveReturn != null
          ? `실시간 탐색 최고: ${liveName ?? "—"} (순수익 ${(liveReturn * 100).toFixed(2)}%)`
          : "실시간 탐색 최고 기록 없음",
        topStable
          ? `최고 안정: ${topStable.displayAlias} (낙폭 ${((topStable.maxDrawdown ?? 0) * 100).toFixed(2)}%)`
          : "최고 안정 후보 없음 — 추천 자격 미충족",
      ].slice(0, 3),
      whyExcluded: whyExcluded.slice(0, 3),
      overfittingNote:
        recommendable.length > 0
          ? "추천 후보는 소폭 파라미터 변경 검증(지터) 증거를 포함합니다."
          : "과거 데이터 편중 위험이 확인된 후보만 최종 추천됩니다.",
      costSensitivityNote:
        "비용 부담 검증(스트레스) 통과 여부를 추천 자격에 반영합니다. 절대 비용 금액이 trial에 없으면 비용 데이터 없음으로 표시합니다.",
      drawdownRiskNote: "최대 낙폭 절대값 25% 초과 후보는 안정/추천에서 제외됩니다.",
      tradeConfidenceNote:
        "표본 충분 기준 30회(백테스트 최소 거래), 보통 기준 10회입니다.",
      nextActions: [
        "추천 전략은 「전략 등록 후 백테스트」로 라이브러리에 등록한 뒤 검증하세요.",
        backtestRecommendations.length > 0
          ? `백테스트 추천 ${backtestRecommendations.length}개(상한 10)만 선택 등록하세요.`
          : "추천 자격이 없어 백테스트 전 추가 탐색·검증이 필요합니다.",
        "상위 전략만 전략 라이브러리에 선택 등록하세요.",
      ].slice(0, 3),
    },
    provenanceNote:
      "합격 전략은 탐색 trial로 저장되어 있으며, 전략 라이브러리 등록은 별도 승격(promotion)입니다.",
  };
}

/** Runtime integrity checks for Results UI / API consumers. */
export function validateResearchResultsIntegrity(
  summary: ResearchResultsSummary,
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const c = summary.counts;
  if (c.qualifiedStrategies < c.uniqueQualifiedStrategies) {
    issues.push("qualified count less than unique qualified");
  }
  if (c.uniqueQualifiedStrategies < c.clusteredRepresentatives) {
    issues.push("unique qualified less than clustered representatives");
  }
  if (c.backtestRecommendedStrategies > 10) {
    issues.push("backtest recommendations exceed bound of 10");
  }
  if (c.registeredStrategies > c.qualifiedStrategies) {
    issues.push("registered exceeds qualified");
  }
  for (const card of [
    summary.topProfit,
    summary.topStable,
    summary.topRecommend,
    ...summary.representatives,
    ...summary.backtestRecommendations,
  ]) {
    if (!card) continue;
    if (card.sourceResearchJobId !== summary.jobId) {
      issues.push(`sourceResearchJobId mismatch on ${card.paramsHash}`);
    }
    if (
      card.paramsHash === EXPECTED_SAFE_PARAMS_HASH ||
      card.paramsHash === "7893ca3f0e30"
    ) {
      issues.push("SAFE hash appeared in current Research results");
    }
  }
  const clusterIds = new Set(summary.clusters.map((cl) => cl.clusterId));
  for (const card of summary.representatives) {
    if (!clusterIds.has(card.clusterId)) {
      issues.push(`orphan clusterId ${card.clusterId}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Bounded top promotion — never registers all qualified trials. */
export function promoteTopResearchResults(
  jobId: string,
  input?: { limit?: number; storeOptions?: StrategySearchStoreOptions },
): {
  summary: ResearchResultsSummary;
  promoted: ReturnType<typeof promoteSelectedTrialsFromJob>;
} {
  const limit = Math.min(20, Math.max(1, input?.limit ?? 10));
  const summary = buildResearchResultsSummary(jobId, input?.storeOptions);
  const pool = [
    ...summary.backtestRecommendations,
    ...summary.representatives.filter((r) => r.recommendable),
    ...summary.representatives,
  ];
  const seen = new Set<string>();
  const iterations: number[] = [];
  for (const card of pool) {
    if (seen.has(card.paramsHash)) continue;
    if (card.registrationState === "등록됨") continue;
    seen.add(card.paramsHash);
    iterations.push(card.iteration);
    if (iterations.length >= limit) break;
  }
  const promoted =
    iterations.length > 0
      ? promoteSelectedTrialsFromJob(jobId, iterations, input?.storeOptions)
      : [];
  return {
    summary: buildResearchResultsSummary(jobId, input?.storeOptions),
    promoted,
  };
}

/**
 * Explicit single-trial registration for Backtest handoff.
 * Reuses existing registry identity when paramsHash already registered.
 */
export function registerTrialForBacktest(
  jobId: string,
  iteration: number,
  storeOptions?: StrategySearchStoreOptions,
): {
  result: ReturnType<typeof promoteSearchCandidateToStrategy>;
  clusterId: string | null;
  backtestHref: string;
  summary: ResearchResultsSummary;
} {
  const summaryBefore = buildResearchResultsSummary(jobId, storeOptions);
  const card =
    summaryBefore.representatives.find((r) => r.iteration === iteration) ??
    summaryBefore.backtestRecommendations.find((r) => r.iteration === iteration) ??
    null;
  const clusterId = card?.clusterId ?? null;
  const result = promoteSearchCandidateToStrategy({
    jobId,
    iteration,
    storeOptions,
    clusterId: clusterId ?? undefined,
  });
  const summary = buildResearchResultsSummary(jobId, storeOptions);
  const symbol = summary.symbol;
  const timeframe = summary.timeframe;
  const qs = new URLSearchParams({
    strategyId: result.strategyId,
    strategyHash: result.strategyHash,
    sourceParamsHash: result.sourceParamsHash ?? result.paramsHash,
    symbol,
    timeframe,
    sourceResearchJobId: jobId,
    sourceTrialIteration: String(iteration),
  });
  if (clusterId) qs.set("sourceClusterId", clusterId);
  return {
    result,
    clusterId,
    backtestHref: `/backtest?${qs.toString()}`,
    summary,
  };
}

/**
 * Rebuild and persist live Top-10 from current trials.
 * Safe to call during a running Research Job (bounded by caller cadence).
 */
export function refreshLiveResearchTop10(
  jobId: string,
  options?: StrategySearchStoreOptions,
): ReturnType<typeof getResearchTop10> {
  const job = getSearchJob(jobId, options);
  if (!job) return null;
  const trials = listSearchTrials(jobId, options);
  const hasQualified = trials.some(
    (t) =>
      t.passed &&
      t.paramsHash &&
      !t.paramsHash.startsWith("invalid_") &&
      t.paramsHash !== EXPECTED_SAFE_PARAMS_HASH,
  );
  if (!hasQualified) return getResearchTop10(jobId, options);
  buildResearchResultsSummary(jobId, options);
  return getResearchTop10(jobId, options);
}
