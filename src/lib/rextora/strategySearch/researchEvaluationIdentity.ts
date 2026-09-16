/**
 * Research evaluation identity, truthful cost provenance, and CHAMP-A
 * group ranking helpers (P3-A7.2).
 *
 * Does not change paramsHash, scoring formulas, or engine arithmetic.
 */

import { createHash } from "node:crypto";
import { isBetterScore } from "./jobStatistics";
import {
  PATTERN_SEARCH_SPACE_IDS,
  isPatternCandidateParams,
} from "./patternSearchSpaces";
import { SAFE_V44_SEARCH_SPACES } from "./searchSpaces";
import type {
  StrategySearchBacktestCostConfig,
  StrategySearchBestCandidateReference,
  StrategySearchCostStressScenario,
  StrategySearchGroupBestState,
  StrategySearchJitterConfig,
  StrategySearchParameterRange,
  StrategySearchPassPolicy,
  StrategySearchScoreWeights,
  StrategySearchTrial,
  StrategySearchWindow,
} from "./types";

export const RESEARCH_EVALUATION_IDENTITY_VERSION =
  "research_evaluation_identity_v1" as const;

export const RESEARCH_EVALUATION_POLICY_VERSION =
  "research_evaluation_policy_v1" as const;

export const ENGINE_COST_MODEL_SAFE = "safe_execution_price_v1" as const;
export const ENGINE_COST_MODEL_EVENT_SEQUENCE =
  "event_sequence_ledger_v0" as const;
export const ENGINE_COST_MODEL_EVENT_SEQUENCE_V1 =
  "event_sequence_execution_price_v1" as const;

export const GROUP_SAFE = ENGINE_COST_MODEL_SAFE;
export const GROUP_PATTERN_CANONICAL = ENGINE_COST_MODEL_EVENT_SEQUENCE_V1;
export const GROUP_PATTERN = ENGINE_COST_MODEL_EVENT_SEQUENCE;
export const GROUP_UNKNOWN_LEGACY = "unknown_legacy" as const;

export const COMPETITIVE_RANKING_GROUPS = [
  GROUP_SAFE,
  GROUP_PATTERN_CANONICAL,
  GROUP_PATTERN,
] as const;

export type ResearchEngineCostModel =
  | typeof ENGINE_COST_MODEL_SAFE
  | typeof ENGINE_COST_MODEL_EVENT_SEQUENCE
  | typeof ENGINE_COST_MODEL_EVENT_SEQUENCE_V1;

export type RankingCompatibilityGroup =
  | typeof GROUP_SAFE
  | typeof GROUP_PATTERN_CANONICAL
  | typeof GROUP_PATTERN
  | typeof GROUP_UNKNOWN_LEGACY;

export type ResearchTrialClass = "PROVEN_SAFE" | "PROVEN_PATTERN" | "UNKNOWN_LEGACY";

export interface ResearchCostChannelProvenance {
  configuredEnabled: boolean;
  configuredRate: number;
  engineApplied: boolean;
  effectiveRate: number;
}

export interface ResearchCostProvenance {
  version: "cost_assumptions_v1";
  fee: ResearchCostChannelProvenance;
  slippage: ResearchCostChannelProvenance & { model: ResearchEngineCostModel };
  funding: ResearchCostChannelProvenance;
  spread: ResearchCostChannelProvenance;
  costGuard: {
    configuredK: number | null;
    engineApplied: boolean;
    effectiveK: number | null;
  };
}

export interface ResearchEvaluationWindowIdentity {
  id: string;
  fromOpenTime: number;
  toOpenTime: number;
  /** Omitted windows are treated as required by evaluateCandidatePass/score. */
  requiredForPass: boolean;
}

const PASS_THRESHOLD_KEYS = [
  "minTotalReturn",
  "maxMdd",
  "minTradeCount",
  "minWinRate",
  "minProfitFactor",
  "maxNegativeMonths",
  "minEndingBalance",
  "minMonthlyReturn",
  "maxMonthlyReturnDispersion",
] as const;

export interface ResearchEvaluationPassPolicyIdentity {
  thresholds: Partial<Record<(typeof PASS_THRESHOLD_KEYS)[number], number>>;
}

export interface ResearchEvaluationScorePolicyIdentity {
  returnWeight: number;
  mddWeight: number;
  profitFactorWeight: number;
  winRateWeight: number;
  tradeAdequacyWeight: number;
  negativeMonthWeight: number;
  consistencyWeight: number;
  tradeAdequacyReference: number;
}

export interface ResearchEvaluationCostStressScenarioIdentity {
  id: string;
  requiredForPass: boolean;
  feeMultiplier: number;
  slippageMultiplier: number;
  fundingMultiplier: number;
  spreadMultiplier: number;
  costGuardKMultiplier: number;
}

export interface ResearchEvaluationJitterRangeIdentity {
  key: string;
  min: number | boolean | null;
  max: number | boolean | null;
  step: number | null;
  valueType: string | null;
  enumValues: Array<number | boolean | string> | null;
  defaultValue: number | boolean | string | null;
}

export type ResearchEvaluationJitterPolicyIdentity =
  | { enabled: false }
  | {
      enabled: true;
      sampleCount: number;
      mutationScale: number;
      seed: number;
      minimumPassRate: number;
      maximumScoreDropRatio: number;
      parameterRanges: ResearchEvaluationJitterRangeIdentity[];
    };

export interface ResearchEvaluationPolicyIdentity {
  version: typeof RESEARCH_EVALUATION_POLICY_VERSION;
  passPolicy: ResearchEvaluationPassPolicyIdentity;
  scorePolicy: ResearchEvaluationScorePolicyIdentity;
  costStress: { scenarios: ResearchEvaluationCostStressScenarioIdentity[] };
  jitter: ResearchEvaluationJitterPolicyIdentity;
}

export interface ResearchEvaluationIdentity {
  version: typeof RESEARCH_EVALUATION_IDENTITY_VERSION;
  paramsHash: string;
  engineCostModel: ResearchEngineCostModel;
  rankingCompatibilityGroup: Exclude<
    RankingCompatibilityGroup,
    typeof GROUP_UNKNOWN_LEGACY
  >;
  cost: ResearchCostProvenance;
  symbols: string[];
  timeframe: string;
  windows: ResearchEvaluationWindowIdentity[];
  dataVersion: string;
  /**
   * Resolved evaluator starting balance (job execution profile.balance).
   * Result-determining: endingBalance scales with it, and minEndingBalance PASS
   * can flip. Campaign plan.minScore is not part of this identity.
   */
  evaluationBalance: number;
  evaluationPolicy: ResearchEvaluationPolicyIdentity;
}

export interface ResearchTrialClassification {
  class: ResearchTrialClass;
  rankingCompatibilityGroup: RankingCompatibilityGroup;
  engineCostModel: ResearchEngineCostModel | null;
  rankingEligible: boolean;
  promotionEligible: boolean;
  evidenceUsed: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function isSafeSearchParams(params: Record<string, unknown>): boolean {
  return (
    typeof params.ema_fast === "number" ||
    typeof params.sl_atr_mult === "number"
  );
}

export function classifyResearchTrial(input: {
  params?: Record<string, unknown> | null;
  engineCostModel?: string | null;
  rankingCompatibilityGroup?: string | null;
  strategyType?: string | null;
}): ResearchTrialClassification {
  if (
    input.rankingCompatibilityGroup === GROUP_SAFE ||
    input.engineCostModel === ENGINE_COST_MODEL_SAFE ||
    input.strategyType === "safe_params"
  ) {
    return {
      class: "PROVEN_SAFE",
      rankingCompatibilityGroup: GROUP_SAFE,
      engineCostModel: ENGINE_COST_MODEL_SAFE,
      rankingEligible: true,
      promotionEligible: true,
      evidenceUsed: "explicit type/model",
    };
  }
  if (
    input.rankingCompatibilityGroup === GROUP_PATTERN_CANONICAL ||
    input.engineCostModel === ENGINE_COST_MODEL_EVENT_SEQUENCE_V1
  ) {
    return {
      class: "PROVEN_PATTERN",
      rankingCompatibilityGroup: GROUP_PATTERN_CANONICAL,
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
      rankingEligible: true,
      promotionEligible: true,
      evidenceUsed: "explicit type/model",
    };
  }
  if (
    input.rankingCompatibilityGroup === GROUP_PATTERN ||
    input.engineCostModel === ENGINE_COST_MODEL_EVENT_SEQUENCE
  ) {
    return {
      class: "PROVEN_PATTERN",
      rankingCompatibilityGroup: GROUP_PATTERN,
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
      rankingEligible: true,
      promotionEligible: true,
      evidenceUsed: "explicit type/model",
    };
  }

  const params = input.params;
  const present =
    Boolean(params) &&
    typeof params === "object" &&
    Object.keys(params ?? {}).length > 0;
  if (present && params) {
    if (isPatternCandidateParams(params)) {
      return {
        class: "PROVEN_PATTERN",
        rankingCompatibilityGroup: GROUP_PATTERN,
        engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
        rankingEligible: true,
        promotionEligible: true,
        evidenceUsed: "trial.params shape",
      };
    }
    if (isSafeSearchParams(params)) {
      return {
        class: "PROVEN_SAFE",
        rankingCompatibilityGroup: GROUP_SAFE,
        engineCostModel: ENGINE_COST_MODEL_SAFE,
        rankingEligible: true,
        promotionEligible: true,
        evidenceUsed: "trial.params shape",
      };
    }
  }

  return {
    class: "UNKNOWN_LEGACY",
    rankingCompatibilityGroup: GROUP_UNKNOWN_LEGACY,
    engineCostModel: null,
    rankingEligible: false,
    promotionEligible: false,
    evidenceUsed: present ? "unrecognized params" : "empty/missing params",
  };
}

export function resolveResearchEngineCostModel(
  params: Record<string, unknown>,
): ResearchEngineCostModel | null {
  const classified = classifyResearchTrial({ params });
  return classified.engineCostModel;
}

export function buildResearchCostProvenance(input: {
  engineCostModel: ResearchEngineCostModel;
  cost: StrategySearchBacktestCostConfig;
  costGuardK: number | null;
}): ResearchCostProvenance {
  const ledger = input.engineCostModel === ENGINE_COST_MODEL_EVENT_SEQUENCE;
  const fundingApplied = !ledger && input.cost.applyFunding;
  const spreadApplied = !ledger && input.cost.applySpread;
  const guardApplied =
    input.engineCostModel === ENGINE_COST_MODEL_SAFE &&
    input.costGuardK != null;
  return {
    version: "cost_assumptions_v1",
    fee: {
      configuredEnabled: true,
      configuredRate: input.cost.feeRate,
      engineApplied: true,
      effectiveRate: input.cost.feeRate,
    },
    slippage: {
      configuredEnabled: true,
      configuredRate: input.cost.slippageRate,
      engineApplied: true,
      effectiveRate: input.cost.slippageRate,
      model: input.engineCostModel,
    },
    funding: {
      configuredEnabled: input.cost.applyFunding,
      configuredRate: input.cost.fundingRate,
      engineApplied: fundingApplied,
      effectiveRate: fundingApplied ? input.cost.fundingRate : 0,
    },
    spread: {
      configuredEnabled: input.cost.applySpread,
      configuredRate: input.cost.spreadRate,
      engineApplied: spreadApplied,
      effectiveRate: spreadApplied ? input.cost.spreadRate : 0,
    },
    costGuard: {
      configuredK: input.costGuardK,
      engineApplied: guardApplied,
      effectiveK: guardApplied ? input.costGuardK : null,
    },
  };
}

function snapshotJitterRange(
  range: StrategySearchParameterRange,
): ResearchEvaluationJitterRangeIdentity {
  return {
    key: range.key,
    min: range.min,
    max: range.max,
    step: range.step ?? null,
    valueType: range.valueType ?? null,
    enumValues: range.enumValues ? [...range.enumValues] : null,
    defaultValue: range.defaultValue ?? null,
  };
}

export function buildResearchEvaluationPolicy(input: {
  passPolicy: StrategySearchPassPolicy;
  scoreWeights: StrategySearchScoreWeights;
  costStressScenarios: readonly StrategySearchCostStressScenario[];
  jitterConfig: StrategySearchJitterConfig;
}): ResearchEvaluationPolicyIdentity {
  const thresholds: ResearchEvaluationPassPolicyIdentity["thresholds"] = {};
  for (const key of PASS_THRESHOLD_KEYS) {
    const value = input.passPolicy.thresholds[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      thresholds[key] = value;
    }
  }
  const scenarios = [...input.costStressScenarios]
    .map((scenario) => ({
      id: scenario.id,
      requiredForPass: scenario.requiredForPass,
      feeMultiplier: scenario.feeMultiplier,
      slippageMultiplier: scenario.slippageMultiplier,
      fundingMultiplier: scenario.fundingMultiplier,
      spreadMultiplier: scenario.spreadMultiplier,
      costGuardKMultiplier: scenario.costGuardKMultiplier,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const jitter: ResearchEvaluationJitterPolicyIdentity = input.jitterConfig.enabled
    ? {
        enabled: true,
        sampleCount: input.jitterConfig.sampleCount,
        mutationScale: input.jitterConfig.mutationScale,
        seed: input.jitterConfig.seed,
        minimumPassRate: input.jitterConfig.minimumPassRate,
        maximumScoreDropRatio: input.jitterConfig.maximumScoreDropRatio,
        parameterRanges: [...input.jitterConfig.parameterRanges]
          .map(snapshotJitterRange)
          .sort((a, b) => a.key.localeCompare(b.key)),
      }
    : { enabled: false };
  return {
    version: RESEARCH_EVALUATION_POLICY_VERSION,
    passPolicy: { thresholds },
    scorePolicy: {
      returnWeight: input.scoreWeights.returnWeight,
      mddWeight: input.scoreWeights.mddWeight,
      profitFactorWeight: input.scoreWeights.profitFactorWeight,
      winRateWeight: input.scoreWeights.winRateWeight,
      tradeAdequacyWeight: input.scoreWeights.tradeAdequacyWeight,
      negativeMonthWeight: input.scoreWeights.negativeMonthWeight,
      consistencyWeight: input.scoreWeights.consistencyWeight,
      tradeAdequacyReference:
        input.scoreWeights.tradeAdequacyReference != null &&
        input.scoreWeights.tradeAdequacyReference > 0
          ? input.scoreWeights.tradeAdequacyReference
          : 20,
    },
    costStress: { scenarios },
    jitter,
  };
}

function assertEvaluationBalance(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("evaluationBalance must be a positive finite number");
  }
  return value;
}

export function buildResearchEvaluationIdentity(input: {
  paramsHash: string;
  engineCostModel: ResearchEngineCostModel;
  cost: StrategySearchBacktestCostConfig;
  costGuardK: number | null;
  symbols: string[];
  timeframe: string;
  windows: Array<
    Pick<StrategySearchWindow, "id" | "fromOpenTime" | "toOpenTime"> & {
      requiredForPass?: boolean;
    }
  >;
  dataVersion: string;
  evaluationBalance: number;
  evaluationPolicy: ResearchEvaluationPolicyIdentity;
}): ResearchEvaluationIdentity {
  const group = rankingGroupForEngineCostModel(input.engineCostModel);
  const windows = [...input.windows]
    .map((w) => ({
      id: w.id,
      fromOpenTime: w.fromOpenTime,
      toOpenTime: w.toOpenTime,
      requiredForPass: w.requiredForPass !== false,
    }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.fromOpenTime - b.fromOpenTime);
  return {
    version: RESEARCH_EVALUATION_IDENTITY_VERSION,
    paramsHash: input.paramsHash,
    engineCostModel: input.engineCostModel,
    rankingCompatibilityGroup: group,
    cost: buildResearchCostProvenance({
      engineCostModel: input.engineCostModel,
      cost: input.cost,
      costGuardK: input.costGuardK,
    }),
    symbols: [...input.symbols].sort(),
    timeframe: input.timeframe,
    windows,
    dataVersion: input.dataVersion,
    evaluationBalance: assertEvaluationBalance(input.evaluationBalance),
    evaluationPolicy: input.evaluationPolicy,
  };
}

export function computeResearchEvaluationHash(
  identity: ResearchEvaluationIdentity,
): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(identity)))
    .digest("hex");
}

function rankingGroupForEngineCostModel(
  engineCostModel: ResearchEngineCostModel,
): Exclude<RankingCompatibilityGroup, typeof GROUP_UNKNOWN_LEGACY> {
  if (engineCostModel === ENGINE_COST_MODEL_SAFE) return GROUP_SAFE;
  if (engineCostModel === ENGINE_COST_MODEL_EVENT_SEQUENCE_V1) {
    return GROUP_PATTERN_CANONICAL;
  }
  return GROUP_PATTERN;
}

export function stampResearchEvaluation(input: {
  params: Record<string, unknown>;
  paramsHash: string;
  cost: StrategySearchBacktestCostConfig;
  symbols: string[];
  timeframe: string;
  windows: Array<
    Pick<StrategySearchWindow, "id" | "fromOpenTime" | "toOpenTime"> & {
      requiredForPass?: boolean;
    }
  >;
  dataVersion: string;
  evaluationBalance: number;
  passPolicy: StrategySearchPassPolicy;
  scoreWeights: StrategySearchScoreWeights;
  costStressScenarios: readonly StrategySearchCostStressScenario[];
  jitterConfig: StrategySearchJitterConfig;
  /**
   * Explicit engine model from the persisted job execution profile.
   * When omitted, Pattern params-shape classifies as ledger_v0 (never today's default).
   */
  engineCostModel?: ResearchEngineCostModel | null;
}): {
  classification: ResearchTrialClassification;
  researchEvaluationIdentity: ResearchEvaluationIdentity | null;
  researchEvaluationHash: string | null;
} {
  const classification = classifyResearchTrial({
    params: input.params,
    engineCostModel: input.engineCostModel,
  });
  if (!classification.engineCostModel || !classification.rankingEligible) {
    return {
      classification,
      researchEvaluationIdentity: null,
      researchEvaluationHash: null,
    };
  }
  const costGuardK =
    classification.engineCostModel === ENGINE_COST_MODEL_SAFE &&
    typeof input.params.cost_guard_k === "number"
      ? input.params.cost_guard_k
      : null;
  const identity = buildResearchEvaluationIdentity({
    paramsHash: input.paramsHash,
    engineCostModel: classification.engineCostModel,
    cost: input.cost,
    costGuardK,
    symbols: input.symbols,
    timeframe: input.timeframe,
    windows: input.windows,
    dataVersion: input.dataVersion,
    evaluationBalance: input.evaluationBalance,
    evaluationPolicy: buildResearchEvaluationPolicy({
      passPolicy: input.passPolicy,
      scoreWeights: input.scoreWeights,
      costStressScenarios: input.costStressScenarios,
      jitterConfig: input.jitterConfig,
    }),
  });
  return {
    classification,
    researchEvaluationIdentity: identity,
    researchEvaluationHash: computeResearchEvaluationHash(identity),
  };
}

export function emptyBestByCompatibilityGroup(): StrategySearchGroupBestState[] {
  return COMPETITIVE_RANKING_GROUPS.map((rankingCompatibilityGroup) => ({
    rankingCompatibilityGroup,
    bestCandidate: null,
    bestPassedCandidate: null,
    bestScore: null,
  }));
}

export function cloneBestByCompatibilityGroup(
  rows: StrategySearchGroupBestState[] | null | undefined,
): StrategySearchGroupBestState[] {
  const base = emptyBestByCompatibilityGroup();
  if (!rows?.length) return base;
  return base.map((row) => {
    const found = rows.find(
      (item) => item.rankingCompatibilityGroup === row.rankingCompatibilityGroup,
    );
    if (!found) return row;
    return {
      rankingCompatibilityGroup: row.rankingCompatibilityGroup,
      bestCandidate: found.bestCandidate ? { ...found.bestCandidate } : null,
      bestPassedCandidate: found.bestPassedCandidate
        ? { ...found.bestPassedCandidate }
        : null,
      bestScore: found.bestScore,
    };
  });
}

export function applyGroupChampA(
  groups: StrategySearchGroupBestState[],
  group: RankingCompatibilityGroup,
  ref: StrategySearchBestCandidateReference,
): StrategySearchGroupBestState[] {
  if (group === GROUP_UNKNOWN_LEGACY) return cloneBestByCompatibilityGroup(groups);
  return cloneBestByCompatibilityGroup(groups).map((row) => {
    if (row.rankingCompatibilityGroup !== group) return row;
    const next = { ...row };
    if (isBetterScore(row.bestCandidate?.score ?? null, ref.score)) {
      next.bestCandidate = { ...ref };
      next.bestScore = ref.score;
    }
    if (
      ref.passed &&
      isBetterScore(row.bestPassedCandidate?.score ?? null, ref.score)
    ) {
      next.bestPassedCandidate = { ...ref, passed: true };
    }
    return next;
  });
}

export function classifyPersistedTrial(
  trial: Pick<
    StrategySearchTrial,
    "params" | "paramsHash"
  > & {
    engineCostModel?: string | null;
    rankingCompatibilityGroup?: string | null;
  },
): ResearchTrialClassification {
  return classifyResearchTrial({
    params: trial.params as Record<string, unknown>,
    engineCostModel: trial.engineCostModel,
    rankingCompatibilityGroup: trial.rankingCompatibilityGroup,
  });
}

export function reconstructGroupBestFromReferenced(input: {
  bestCandidate: StrategySearchBestCandidateReference | null;
  bestPassedCandidate: StrategySearchBestCandidateReference | null;
  resolveTrial: (
    ref: StrategySearchBestCandidateReference,
  ) => StrategySearchTrial | null | undefined;
}): StrategySearchGroupBestState[] {
  let groups = emptyBestByCompatibilityGroup();
  const seed = (
    ref: StrategySearchBestCandidateReference | null,
    asPassed: boolean,
  ) => {
    if (!ref) return;
    const trial = input.resolveTrial(ref);
    const classified = classifyResearchTrial({
      params: (trial?.params ?? null) as Record<string, unknown> | null,
      engineCostModel: trial?.engineCostModel,
      rankingCompatibilityGroup: trial?.rankingCompatibilityGroup,
    });
    if (!classified.rankingEligible) return;
    groups = applyGroupChampA(groups, classified.rankingCompatibilityGroup, {
      candidateId: ref.candidateId,
      iteration: ref.iteration,
      paramsHash: ref.paramsHash,
      score: ref.score,
      passed: asPassed || ref.passed,
    });
  };
  seed(input.bestCandidate, false);
  seed(input.bestPassedCandidate, true);
  return groups;
}

export function reconstructGroupBestFromTrials(
  trials: StrategySearchTrial[],
): StrategySearchGroupBestState[] {
  let groups = emptyBestByCompatibilityGroup();
  const sorted = [...trials].sort((a, b) => a.iteration - b.iteration);
  for (const trial of sorted) {
    const classified = classifyPersistedTrial(trial);
    if (!classified.rankingEligible) continue;
    groups = applyGroupChampA(groups, classified.rankingCompatibilityGroup, {
      candidateId: trial.candidateId,
      iteration: trial.iteration,
      paramsHash: trial.paramsHash,
      score: trial.score,
      passed: trial.passed,
    });
  }
  return groups;
}

export function groupForSearchSpaceId(
  spaceId: string | null | undefined,
): RankingCompatibilityGroup | null {
  if (!spaceId) return null;
  if ((PATTERN_SEARCH_SPACE_IDS as readonly string[]).includes(spaceId)) {
    return GROUP_PATTERN;
  }
  if (SAFE_V44_SEARCH_SPACES.some((space) => space.id === spaceId)) {
    return GROUP_SAFE;
  }
  return null;
}

export function champAHashes(
  groups: StrategySearchGroupBestState[] | null | undefined,
): string[] {
  return (groups ?? [])
    .map((row) => row.bestPassedCandidate?.paramsHash)
    .filter((hash): hash is string => typeof hash === "string" && hash.length > 0);
}

export function formatEvaluationEvidence(input: {
  researchEvaluationHash: string | null;
  engineCostModel: string | null;
  rankingCompatibilityGroup: string | null;
  reconstructed?: boolean;
}): string {
  const legacyWarning =
    input.engineCostModel === ENGINE_COST_MODEL_EVENT_SEQUENCE
      ? " · costModelWarning=legacy_event_sequence_ledger_v0"
      : "";
  return (
    ` · researchEvaluationHash=${input.researchEvaluationHash ?? "none"}` +
    ` · engineCostModel=${input.engineCostModel ?? "none"}` +
    ` · rankingCompatibilityGroup=${input.rankingCompatibilityGroup ?? "none"}` +
    (input.reconstructed ? " · evaluationEvidence=reconstructed" : "") +
    legacyWarning
  );
}

export function sortTrialsByChampA(
  trials: StrategySearchTrial[],
): StrategySearchTrial[] {
  return [...trials].sort((a, b) => {
    if (isBetterScore(b.score, a.score)) return -1;
    if (isBetterScore(a.score, b.score)) return 1;
    return a.iteration - b.iteration;
  });
}
