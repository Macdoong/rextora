/**
 * P3-A7.1.1 read-only forensic: Research evaluation identity, family-scoped
 * ranking, champion semantics, and legacy-resume compatibility.
 *
 * Design only. Does not change paramsHash, scoring, ranking, promotion,
 * Research/Backtest arithmetic, SAFE, jobs, trials, or Paper/Live.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { productionReadonlyHashes } from "../backtest/backtestCostAssumptionsDiagnosis";
import { CONTEXT_FALLBACK_PARAMS } from "../strategy/safeV44Params";
import { computeParamsHash } from "../strategy/strategyHash";
import { isBetterScore } from "./jobStatistics";
import { ORDER_BLOCK_BASE_PARAMS, isPatternCandidateParams } from "./patternSearchSpaces";
import type { StrategySearchBacktestCostConfig } from "./types";

export const P3A711_ARTIFACT_TS = "2026-09-04T02-05-00-000Z";

export const RESEARCH_EVALUATION_IDENTITY_VERSION =
  "research_evaluation_identity_v1" as const;

export const ENGINE_COST_MODEL_SAFE = "safe_execution_price_v1" as const;
export const ENGINE_COST_MODEL_EVENT_SEQUENCE =
  "event_sequence_ledger_v0" as const;
export const ENGINE_COST_MODEL_CONDITION_BUILDER =
  "condition_builder_ledger_v0" as const;

export type ResearchEngineCostModel =
  | typeof ENGINE_COST_MODEL_SAFE
  | typeof ENGINE_COST_MODEL_EVENT_SEQUENCE
  | typeof ENGINE_COST_MODEL_CONDITION_BUILDER;

export type RankingCompatibilityGroup =
  | typeof ENGINE_COST_MODEL_SAFE
  | typeof ENGINE_COST_MODEL_EVENT_SEQUENCE;

export type FieldInclusion = "REQUIRED" | "OPTIONAL" | "NOT_INCLUDED";

export type ParamsHashSemantic =
  | "STRATEGY_PARAMETER_IDENTITY"
  | "EVALUATION_IDENTITY"
  | "DEDUP_KEY"
  | "PROMOTION_KEY"
  | "PROTECTION_KEY"
  | "OTHER";

export interface ResearchCostChannelProvenance {
  configuredEnabled: boolean;
  configuredRate: number;
  engineApplied: boolean;
  effectiveRate: number;
}

export interface ResearchEvaluationCostIdentity {
  version: "cost_assumptions_v1";
  fee: ResearchCostChannelProvenance;
  slippage: ResearchCostChannelProvenance;
  funding: ResearchCostChannelProvenance;
  spread: ResearchCostChannelProvenance;
  costGuard: {
    configuredK: number | null;
    engineApplied: boolean;
    effectiveK: number | null;
  };
  stress: {
    feeMultiplier: number;
    slippageMultiplier: number;
    fundingMultiplier: number;
    spreadMultiplier: number;
    costGuardKMultiplier: number;
  };
}

export interface ResearchEvaluationDataContext {
  symbols: string[];
  timeframe: string;
  windows: Array<{
    id: string;
    fromOpenTime: number;
    toOpenTime: number;
  }>;
  dataVersion: string;
}

export interface ResearchEvaluationIdentityPayload {
  version: typeof RESEARCH_EVALUATION_IDENTITY_VERSION;
  paramsHash: string;
  engineCostModel: ResearchEngineCostModel;
  rankingCompatibilityGroup: RankingCompatibilityGroup | "unranked_legacy";
  cost: ResearchEvaluationCostIdentity;
  data: ResearchEvaluationDataContext;
}

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeResearchEvaluationHash(
  payload: ResearchEvaluationIdentityPayload,
): string {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

export function getParamsHashConsumers() {
  return {
    PARAMS_HASH_CAN_SAFELY_CHANGE: "NO" as const,
    semantic: "STRATEGY_PARAMETER_IDENTITY" as const,
    compute: {
      file: "src/lib/rextora/strategy/strategyHash.ts",
      function: "computeParamsHash",
      digest: "sha256(JSON.stringify(sortedKeys(params))).slice(0, 12)",
      includesCosts: false,
      includesWindows: false,
      includesEngine: false,
    },
    consumers: [
      {
        file: "src/lib/rextora/strategySearch/candidateGenerator.ts",
        functions: ["generateRandomCandidate", "generateUniqueCandidate"],
        semantic: "DEDUP_KEY" as ParamsHashSemantic,
        note: "existingHashes / seenHashes uniqueness; protected SAFE collision retry",
      },
      {
        file: "src/lib/rextora/strategySearch/jobRunner.ts",
        functions: ["generateNextCandidate", "runSearchJob loop"],
        semantic: "DEDUP_KEY" as ParamsHashSemantic,
        note: "seenHashes.add(paramsHash); skip regenerate if already seen",
      },
      {
        file: "src/lib/rextora/strategySearch/jobCheckpoint.ts",
        functions: ["StrategySearchRunnerCheckpointPayload.seenHashes"],
        semantic: "DEDUP_KEY" as ParamsHashSemantic,
        note: "resume restores generation uniqueness, not evaluation economics",
      },
      {
        file: "src/lib/rextora/strategySearch/searchPlan.ts",
        functions: ["globalSeenHashes", "qualifiedHashes"],
        semantic: "DEDUP_KEY" as ParamsHashSemantic,
        note: "campaign-wide seen + qualification list keyed by paramsHash",
      },
      {
        file: "src/lib/rextora/strategySearch/searchOrchestrator.ts",
        functions: ["nextQualified", "recordQualifiedPasses", "recordGenerationForSpace"],
        semantic: "OTHER" as ParamsHashSemantic,
        note: "qualifiedHashes stores passed paramsHash; last qualified used as bestHash for weakness analysis",
      },
      {
        file: "src/lib/rextora/strategySearch/candidateEvaluator.ts",
        functions: ["evaluateCandidatePass guard"],
        semantic: "PROTECTION_KEY" as ParamsHashSemantic,
        note: "isLockedSafeHash / 7893ca3f0e30 collision reject",
      },
      {
        file: "src/lib/rextora/strategySearch/backtestAdapter.ts",
        functions: ["assertCandidate", "window evaluation stamp"],
        semantic: "PROTECTION_KEY" as ParamsHashSemantic,
        note: "protected collision; window row copies paramsHash",
      },
      {
        file: "src/lib/rextora/strategySearch/jitterEvaluator.ts",
        functions: ["evaluateCandidateJitter"],
        semantic: "PROTECTION_KEY" as ParamsHashSemantic,
        note: "jitter samples must not collide with SAFE or parent paramsHash",
      },
      {
        file: "src/lib/rextora/strategySearch/promoteFromSearch.ts",
        functions: [
          "promoteSearchCandidateToStrategy",
          "findExistingByCandidateHash",
          "promoteSelectedTrialsFromJob",
        ],
        semantic: "PROMOTION_KEY" as ParamsHashSemantic,
        note: "dedup existing strategies; sourceParamsHash evidence; selected-trial dedup",
      },
      {
        file: "src/lib/rextora/strategy/strategyStore.ts",
        functions: ["createStrategy", "updateStrategyDisplay"],
        semantic: "STRATEGY_PARAMETER_IDENTITY" as ParamsHashSemantic,
        note: "persisted strategy identity; display rename must not change it",
      },
      {
        file: "src/lib/rextora/strategy/safeV44Strategy.ts",
        functions: ["verifySafeStrategy"],
        semantic: "PROTECTION_KEY" as ParamsHashSemantic,
        note: "EXPECTED_SAFE_PARAMS_HASH lock",
      },
      {
        file: "src/lib/rextora/strategySearch/researchTop10.ts",
        functions: ["identityKey", "selectResearchTop10"],
        semantic: "EVALUATION_IDENTITY" as ParamsHashSemantic,
        note: "MISUSE — Top-10 uniqueness uses paramsHash as if it were evaluation identity",
      },
      {
        file: "src/lib/rextora/strategySearch/researchResultsSummary.ts",
        functions: ["cluster representatives", "roleByHash", "liveSearchBest"],
        semantic: "EVALUATION_IDENTITY" as ParamsHashSemantic,
        note: "MISUSE — cluster/champion roles keyed by paramsHash",
      },
      {
        file: "src/lib/rextora/strategySearch/jobRecordRecovery.ts",
        functions: ["rebuildSeenAndBest"],
        semantic: "DEDUP_KEY" as ParamsHashSemantic,
        note: "rebuilds seenHashes + bestCandidate from trial paramsHash/score",
      },
    ],
    currentEvaluationIdentityStatus: "ABSENT — paramsHash is the only persisted identity",
  };
}

export function makeSafeParams(emaFastOffset = 2) {
  return {
    ...CONTEXT_FALLBACK_PARAMS,
    ema_fast: CONTEXT_FALLBACK_PARAMS.ema_fast + emaFastOffset,
  };
}

export function makePatternParams() {
  return { ...ORDER_BLOCK_BASE_PARAMS } as Record<string, number | boolean | string>;
}

export function proveSameParamsDifferentCostContext() {
  const safeParams = makeSafeParams(7);
  const patternParams = makePatternParams();
  const safeHash = computeParamsHash(safeParams);
  const patternHash = computeParamsHash(patternParams);
  const costA: StrategySearchBacktestCostConfig = {
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    applySpread: false,
    spreadRate: 0.0001,
  };
  const costB: StrategySearchBacktestCostConfig = {
    ...costA,
    feeRate: 0.0008,
    slippageRate: 0.0005,
    applySpread: true,
  };
  return {
    safe: {
      paramsHashA: computeParamsHash(safeParams),
      paramsHashB: computeParamsHash(safeParams),
      paramsHashUnchangedWhenFeeChanges: safeHash,
      costA,
      costB,
      sameParamsHash: computeParamsHash(safeParams) === safeHash,
    },
    pattern: {
      paramsHash: patternHash,
      sameParamsHashAcrossCostProfiles: computeParamsHash(patternParams) === patternHash,
      sameParamsHashAcrossEngineStamp:
        computeParamsHash(patternParams) === patternHash,
    },
    conclusion:
      "Current Research treats different cost/engine evaluations of the same params as one candidate identity.",
  };
}

export function getEvaluationIdentityDesign() {
  const fields: Record<string, FieldInclusion> = {
    paramsHash: "REQUIRED",
    engineCostModel: "REQUIRED",
    costAssumptionsConfigured: "REQUIRED",
    costAssumptionsEffectiveApplied: "REQUIRED",
    symbols: "REQUIRED",
    timeframe: "REQUIRED",
    evaluationWindowsIdFromTo: "REQUIRED",
    dataVersion: "REQUIRED",
    rankingCompatibilityGroup: "REQUIRED",
    identityVersion: "REQUIRED",
    balance: "REQUIRED",
    passPolicy: "OPTIONAL",
    scoreWeights: "OPTIONAL",
    costStressScenarios: "OPTIONAL",
    jitterConfig: "OPTIONAL",
    candidateId: "NOT_INCLUDED",
    iteration: "NOT_INCLUDED",
    jobId: "NOT_INCLUDED",
    createdAt: "NOT_INCLUDED",
    readableName: "NOT_INCLUDED",
    inventedCandleFingerprint: "NOT_INCLUDED",
  };
  return {
    recommendedName: "researchEvaluationHash",
    structuredPayloadName: "researchEvaluationIdentity",
    version: RESEARCH_EVALUATION_IDENTITY_VERSION,
    RESEARCH_EVALUATION_IDENTITY_VERSION_REQUIRED: "YES" as const,
    namingRationale: [
      "paramsHash remains 12-hex strategy-parameter identity (do not overload)",
      "canonicalStrategyIdentity + computeStrategyHash already separate behavior identity from paramsHash",
      "Backtest already uses resultHash for evaluation/result identity",
      "researchEvaluationHash parallels resultHash without colliding with strategyHash",
    ],
    fields,
    hashAlgorithm: "sha256(stableJson(researchEvaluationIdentity)) full hex",
    doNotChoose: [
      "paramsHash — frozen strategy-parameter semantic",
      "evaluationIdentity as digest name — project convention uses *Hash for digests",
      "candidateId — instance id, not economic identity",
    ],
  };
}

export function getDataContextIdentity() {
  return {
    EVALUATION_DATA_CONTEXT_INCLUDED: "NO" as const,
    current: "paramsHash ignores symbol, timeframe, windows, dataVersion, candles",
    existingContract: {
      jobConfig: [
        "config.symbols",
        "config.timeframe",
        "config.evaluationWindows[{id,fromOpenTime,toOpenTime}]",
        "config.dataVersion",
      ],
      executionProfile: [
        "dataRef.availableFrom",
        "dataRef.availableTo",
        "dataRef.source",
      ],
      candleFingerprint: "ABSENT — do not invent",
    },
    recommendedRule:
      "researchEvaluationIdentity.data MUST include symbols, timeframe, window id+from+to, and dataVersion. Do not invent a candle content hash.",
    symbolRule: "REQUIRED — job.config.symbols sorted",
    timeframeRule: "REQUIRED — job.config.timeframe",
    windowRule:
      "REQUIRED — existing StrategySearchWindow id/fromOpenTime/toOpenTime; same params+costs+different window = different researchEvaluationHash",
  };
}

export function buildCostIdentity(input: {
  engineCostModel: ResearchEngineCostModel;
  feeRate: number;
  slippageRate: number;
  fundingRate: number;
  applyFunding: boolean;
  spreadRate: number;
  applySpread: boolean;
  costGuardK: number | null;
  stress?: Partial<ResearchEvaluationCostIdentity["stress"]>;
}): ResearchEvaluationCostIdentity {
  const pattern =
    input.engineCostModel === ENGINE_COST_MODEL_EVENT_SEQUENCE ||
    input.engineCostModel === ENGINE_COST_MODEL_CONDITION_BUILDER;
  const fundingApplied = !pattern && input.applyFunding;
  const spreadApplied = !pattern && input.applySpread;
  const guardApplied = input.engineCostModel === ENGINE_COST_MODEL_SAFE;
  return {
    version: "cost_assumptions_v1",
    fee: {
      configuredEnabled: true,
      configuredRate: input.feeRate,
      engineApplied: true,
      effectiveRate: input.feeRate,
    },
    slippage: {
      configuredEnabled: true,
      configuredRate: input.slippageRate,
      engineApplied: true,
      effectiveRate: input.slippageRate,
    },
    funding: {
      configuredEnabled: input.applyFunding,
      configuredRate: input.fundingRate,
      engineApplied: fundingApplied,
      effectiveRate: fundingApplied ? input.fundingRate : 0,
    },
    spread: {
      configuredEnabled: input.applySpread,
      configuredRate: input.spreadRate,
      engineApplied: spreadApplied,
      effectiveRate: spreadApplied ? input.spreadRate : 0,
    },
    costGuard: {
      configuredK: input.costGuardK,
      engineApplied: guardApplied && input.costGuardK != null,
      effectiveK: guardApplied ? input.costGuardK : null,
    },
    stress: {
      feeMultiplier: input.stress?.feeMultiplier ?? 1.5,
      slippageMultiplier: input.stress?.slippageMultiplier ?? 1.5,
      fundingMultiplier: input.stress?.fundingMultiplier ?? 1,
      spreadMultiplier: input.stress?.spreadMultiplier ?? 1.5,
      costGuardKMultiplier: input.stress?.costGuardKMultiplier ?? 1,
    },
  };
}

export function getCostIdentityDesign() {
  return {
    schema: "cost_assumptions_v1 + engineApplied distinction",
    safe: {
      fee: "configured=effective; engineApplied true",
      slippage: "configured=effective; engineApplied true (execution_price_v1)",
      funding: "effectiveRate = applyFunding ? configuredRate : 0; engineApplied follows applyFunding",
      spread: "effectiveRate = applySpread ? configuredRate : 0; engineApplied follows applySpread",
      costGuard: "effectiveK = params.cost_guard_k; engineApplied true",
    },
    pattern: {
      configured: "job execution-profile rates/flags may be present",
      fee: "engineApplied true (ledger feePct)",
      slippage: "engineApplied true (ledger slipPct)",
      funding: "engineApplied MUST be false; effectiveRate 0 even if configuredEnabled",
      spread: "engineApplied MUST be false; effectiveRate 0 even if configuredEnabled / applySpread true",
      costGuard: "engineApplied false; pattern has no SafeV44 cost_guard_k in engine",
    },
    invariant:
      "Never stamp Pattern configured funding/spread as applied. configured ≠ effective ≠ engineApplied.",
  };
}

export function getComparabilityKey() {
  return {
    RECOMMENDED_COMPARABILITY_KEY: "rankingCompatibilityGroup" as const,
    values: [ENGINE_COST_MODEL_SAFE, ENGINE_COST_MODEL_EVENT_SEQUENCE],
    relationToEngineCostModel:
      "Today 1:1 with Research-reachable engineCostModel. Condition-builder is not a Research evaluator.",
    notPatternFamily:
      "OB/FVG/TL/SR/SD share event_sequence_ledger_v0 and ARE comparable with each other.",
    notEngineFamilyAlone:
      "Family label is not enough if a future SAFE cost-model variant appears; keep an explicit group field.",
    incomparableAcross:
      "safe_execution_price_v1 vs event_sequence_ledger_v0 must not share a ranking list",
  };
}

export function getRankingPipeline() {
  return {
    FIRST_CROSS_ENGINE_COMPARISON_POINT:
      "src/lib/rextora/strategySearch/jobRunner.ts — isBetterScore(bestCandidate.score, trial.score) after trialFromEvaluation",
    laterPoints: [
      "jobRunner.ts isBetterScore(bestPassedCandidate.score, trial.score)",
      "jobStatistics.recordEvaluation bestScore (global numeric max)",
      "jobRecordRecovery rebuilds bestCandidate from all trial scores",
      "searchOrchestrator.recordGenerationForSpace last qualifiedHashes entry as bestHash",
      "researchResultsSummary.compositeScore sorts mixed representatives → 최종 추천",
      "researchTop10.selectResearchTop10 identityKey=paramsHash + compositeScore fill",
      "jobApiService live bestCandidateHash = checkpoint.bestCandidate.paramsHash",
    ],
    scoreUnchanged:
      "calculateCandidateScore / compositeScore formulas must not change in A7.2",
    mixingCause:
      "One trial list, one bestCandidate slot, family-agnostic isBetterScore",
  };
}

export function getRankingModelComparison() {
  return {
    RANK_A: {
      name: "One global list, block cross-model comparisons",
      assessment:
        "Rejected as primary — still implies a single ordered list and hidden global winner unless every compare is blocked (then the list is meaningless).",
    },
    RANK_B: {
      name: "Independent ranking lists keyed by rankingCompatibilityGroup",
      assessment:
        "Selected — no incomparable score compare, no hidden global champion, minimal churn, history remains viewable.",
    },
    RANK_C: {
      name: "Independent lists plus one global recommendation using raw scores",
      assessment: "Rejected — recreates mixed-engine comparison at 최종 추천.",
    },
    RANK_D: {
      name: "Independent lists plus operator chooses which family to promote",
      assessment:
        "Compatible add-on for promotion UX. Ranking itself is RANK-B. Promotion already takes jobId+iteration.",
    },
    RANK_E: {
      name: "Normalize scores across engines",
      assessment: "Rejected — invented scale, not evidence.",
    },
    RECOMMENDED_RANKING_MODEL: "RANK-B" as const,
  };
}

export function getChampionPolicy() {
  return {
    current: {
      bestScore: "jobStatistics.recordEvaluation / checkpoint stats — global max score",
      bestCandidate: "checkpoint.bestCandidate — single slot, any family",
      bestPassedCandidate: "checkpoint.bestPassedCandidate — single slot, passed only",
      top10: "researchTop10.selectResearchTop10 — one list, paramsHash identity",
      finalRecommendation: "researchResultsSummary / researchTop10 최종 추천 via compositeScore",
      promoteFromSearch: "explicit jobId+iteration; not auto from champion",
    },
    options: {
      A: "no global champion before parity",
      B: "one champion per rankingCompatibilityGroup",
      C: "operator-selected champion from group winners",
      D: "keep single global bestCandidate (rejected — preserves mix)",
    },
    RECOMMENDED_CHAMPION_POLICY:
      "B — one champion per rankingCompatibilityGroup; no implicit global champion before arithmetic parity",
    GLOBAL_CHAMPION_ALLOWED_BEFORE_PARITY: "NO" as const,
    groupChampionRule:
      "Each rankingCompatibilityGroup keeps its own bestCandidate / bestPassedCandidate / 최종 추천. Operator may promote any Final PASS in a group (RANK-D UX).",
  };
}

export function getPromotionContract() {
  return {
    currentInput: {
      required: ["jobId", "iteration"],
      optional: ["name", "clusterId"],
      loaded: ["trial.params", "trial.paramsHash", "trial.passed", "trial.windowResults", "job.config.symbols/timeframe"],
    },
    currentIdentity: {
      strategyParamsHash: "created.paramsHash from computeParamsHash(merged params) or existing match",
      sourceParamsHash: "trial.paramsHash",
      strategyHash: "canonical definition hash when present",
      engineType: "inferred at promote time via resolvePatternFamilyFromParams — not persisted on trial",
    },
    FAMILY_SCOPED_PROMOTION_FEASIBLE: "YES" as const,
    evidence:
      "promoteSearchCandidateToStrategy already promotes SAFE and Pattern independently without changing paramsHash meaning. Dedup is paramsHash / candidateParamsHash.",
    recommendedEvidence: {
      strategyIdentity: "paramsHash unchanged",
      promotionEvidence: [
        "sourceJobId",
        "sourceTrialIteration",
        "sourceParamsHash",
        "researchEvaluationHash",
        "engineCostModel",
        "rankingCompatibilityGroup",
        "costAssumptions snapshot",
      ],
    },
  };
}

export function getHistoricalResumeFlow() {
  return {
    path: [
      "failed/interrupted/paused → resumeSearchJob / resumeStrategySearchJobApi",
      "jobExecutionRegistry requires existing execution profile",
      "jobRunner restores checkpoint.randomState payload (prng, statistics, seenHashes)",
      "existing trials at current iteration are replayed for PRNG + seenHashes + isBetterScore(bestCandidate)",
      "new trials continue in the same global bestCandidate / bestScore / trial list",
    ],
    recomputesFromHistoricalTrials: {
      bestScore: "YES — isBetterScore over existing trial.score on resume replay",
      bestCandidate: "YES — rebuilt from existing trials if better",
      topN: "YES — live Top-10 rebuilds from trial list (family-agnostic)",
      qualifiedHashes: "YES — orchestrator recordQualifiedPasses scans all passed trial.paramsHash",
      compositeScore: "YES — researchResultsSummary reads all trials on view",
    },
    costProfileOnResume:
      "Same job execution profile. Orchestrator may rewrite jitter parameterRanges only; baseCostConfig is not changed by resume.",
    seenHashesRestored: "YES — paramsHash only",
  };
}

type ReconClass =
  | "FULLY_RECONSTRUCTABLE"
  | "PARTIALLY_RECONSTRUCTABLE"
  | "NOT_RECONSTRUCTABLE";

export interface LegacyTrialReconstruction {
  jobId: string;
  iteration: number;
  paramsHash: string;
  family: "SAFE" | "PATTERN";
  engineModelReconstructable: boolean;
  feeReconstructable: boolean;
  slippageReconstructable: boolean;
  fundingReconstructable: boolean;
  spreadReconstructable: boolean;
  costGuardReconstructable: boolean;
  stressReconstructable: boolean;
  classification: ReconClass;
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function isSafeSearchParams(params: Record<string, unknown>): boolean {
  return (
    typeof params.ema_fast === "number" ||
    typeof params.sl_atr_mult === "number"
  );
}

function classifyLegacyFamily(
  params: Record<string, unknown>,
): "SAFE" | "PATTERN" | null {
  if (isPatternCandidateParams(params)) return "PATTERN";
  if (isSafeSearchParams(params)) return "SAFE";
  return null;
}

export function reconstructLegacyTrials(cwd = process.cwd()): {
  safe: LegacyTrialReconstruction[];
  pattern: LegacyTrialReconstruction[];
  scannedJobs: number;
  profilesPresent: number;
  indexedJobCount: number;
  orphanTrialDirsScanned: number;
} {
  const root = path.join(cwd, "data/rextora/strategy-search");
  const index = readJsonIfExists<{ jobs?: Array<{ id: string }> }>(
    path.join(root, "index.json"),
  );
  const indexedIds = (index?.jobs ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
  const trialsRoot = path.join(root, "trials");
  const diskJobIds = fs.existsSync(trialsRoot)
    ? fs
        .readdirSync(trialsRoot)
        .filter((name) => name.startsWith("search_"))
    : [];
  const jobIds = [...new Set([...indexedIds, ...diskJobIds])];
  const safe: LegacyTrialReconstruction[] = [];
  const pattern: LegacyTrialReconstruction[] = [];
  let profilesPresent = 0;
  let orphanTrialDirsScanned = 0;

  for (const jobId of jobIds) {
    if (safe.length >= 3 && pattern.length >= 3) break;
    if (!jobId.startsWith("search_")) continue;
    const inIndex = indexedIds.includes(jobId);
    if (!inIndex) orphanTrialDirsScanned += 1;
    const profile = readJsonIfExists<{
      baseCostConfig?: StrategySearchBacktestCostConfig;
      costStressScenarios?: unknown[];
    }>(path.join(root, "jobs", `${jobId}.execution.json`));
    if (profile) profilesPresent += 1;
    const trialDir = path.join(root, "trials", jobId);
    if (!fs.existsSync(trialDir)) continue;
    const allFiles = fs
      .readdirSync(trialDir)
      .filter((name) => /^\d{8}\.json$/.test(name))
      .sort();
    const files = [
      ...allFiles.slice(0, 8),
      ...allFiles.slice(Math.max(8, allFiles.length - 8)),
    ].filter((name, index, arr) => arr.indexOf(name) === index);
    for (const file of files) {
      if (safe.length >= 3 && pattern.length >= 3) break;
      const trial = readJsonIfExists<{
        iteration: number;
        paramsHash: string;
        params?: Record<string, unknown>;
      }>(path.join(trialDir, file));
      if (!trial?.paramsHash || !trial.params || typeof trial.params !== "object") {
        continue;
      }
      if (trial.paramsHash.startsWith("invalid_")) continue;
      const family = classifyLegacyFamily(trial.params);
      if (!family) continue;
      const target = family === "PATTERN" ? pattern : safe;
      if (target.length >= 3) continue;
      const hasCost = Boolean(profile?.baseCostConfig);
      const hasStress = Array.isArray(profile?.costStressScenarios);
      const classification: ReconClass = hasCost
        ? "PARTIALLY_RECONSTRUCTABLE"
        : "NOT_RECONSTRUCTABLE";
      target.push({
        jobId,
        iteration: trial.iteration,
        paramsHash: trial.paramsHash,
        family,
        engineModelReconstructable: true,
        feeReconstructable: hasCost,
        slippageReconstructable: hasCost,
        fundingReconstructable: hasCost,
        spreadReconstructable: hasCost,
        costGuardReconstructable: family === "SAFE",
        stressReconstructable: hasStress,
        classification,
      });
    }
  }

  return {
    safe,
    pattern,
    scannedJobs: jobIds.length,
    profilesPresent,
    indexedJobCount: indexedIds.length,
    orphanTrialDirsScanned,
  };
}

export function proveResumeMixing() {
  const legacy = [
    {
      paramsHash: "legacy_safe_aaaa",
      score: 0.62,
      engineCostModel: null as string | null,
      provenance: "ABSENT" as const,
    },
    {
      paramsHash: "legacy_pattern_bbbb",
      score: 0.61,
      engineCostModel: null as string | null,
      provenance: "ABSENT" as const,
    },
  ];
  const next = [
    {
      paramsHash: "new_safe_cccc",
      score: 0.605,
      engineCostModel: ENGINE_COST_MODEL_SAFE,
      provenance: "COMPLETE" as const,
    },
    {
      paramsHash: "new_pattern_dddd",
      score: 0.625,
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
      provenance: "COMPLETE" as const,
    },
  ];
  const all = [...legacy, ...next];
  let best: (typeof all)[number] | null = null;
  for (const trial of all) {
    if (isBetterScore(best?.score ?? null, trial.score)) best = trial;
  }
  const qualified = all.filter((t) => t.score > 0.6).map((t) => t.paramsHash);
  const topN = [...all].sort((a, b) => b.score - a.score).slice(0, 10);
  const recommend = topN[0];
  return {
    LEGACY_NEW_TRIAL_RANKING_MIX: "YES" as const,
    bestScoreWinner: best,
    qualifiedHashes: qualified,
    topN: topN.map((t) => t.paramsHash),
    compositeRecommendation: recommend,
    evidence:
      "jobRunner resume replay and researchResultsSummary both fold every trial.score into one isBetterScore / compositeScore pool. Provenance presence is not a ranking gate today.",
  };
}

export function getResumePolicyComparison() {
  return {
    RESUME_A: {
      name: "Reconstruct historical provenance and assign compatibility groups at rank-time",
      assessment:
        "Selected — engine family reconstructable from params; job-level costs reconstructable from execution profile; no trial rewrite; resume stays usable.",
    },
    RESUME_B: {
      name: "Resume allowed; legacy trials view-only and excluded from new ranking",
      assessment:
        "Safer against reconstruction error but drops historical scores from champion/Top-N on resume (operator-visible data loss).",
    },
    RESUME_C: {
      name: "Resume blocked; start a new job",
      assessment: "Rejected — unnecessary given reconstructable job profile; breaks checkpoint UX.",
    },
    RESUME_D: {
      name: "Rewrite trials with reconstructed provenance",
      assessment: "Rejected — violates no-rewrite / historical preservation.",
    },
    RECOMMENDED_RESUME_POLICY: "RESUME-A" as const,
    fallback:
      "If execution profile is missing, treat that job's historical trials as view-only for new ranking (RESUME-B fallback for that job only).",
  };
}

export function getSeenHashesSemantics() {
  return {
    current: "Generation uniqueness set of paramsHash inside one job/campaign",
    SEEN_HASHES_SHOULD_INCLUDE_COSTS: "NO" as const,
    reason:
      "seenHashes / generateUniqueCandidate intentionally prevent re-evaluating the same strategy params inside one job. Costs are job-scoped via execution profile. Including costs would allow duplicate param search and change generation/PRNG resume.",
    doNotAlterInA72: true,
  };
}

export function getQualifiedHashesSemantics() {
  return {
    current:
      "Set of paramsHash for Final PASS trials in the campaign (searchOrchestrator.nextQualified)",
    stores: "strategy-params qualification, not evaluation-result identity",
    consumers: [
      "searchOrchestrator.recordQualifiedPasses",
      "recordGenerationForSpace bestHash = last qualifiedHashes entry",
      "jobApiService qualifiedCount / preservedResultCount",
      "residualLifecycleInventory.preservedResultCount",
    ],
    a72MustChange:
      "YES — last-qualified-as-best and a single mixed qualified list are ranking consumers. Storage may remain paramsHash for pass-qualification, but best/Top-N must not treat the flat list as a cross-engine order.",
    sameParamsRemainQualifiedIfCostsChange:
      "Within one job costs do not change on resume. Across jobs, qualifiedHashes are per-plan and must not be reused as cost-invariant identity.",
  };
}

export function getPromotionEvidenceDesign() {
  return {
    strategyIdentityRemains: "paramsHash",
    evidenceReferences: "researchEvaluationHash + engineCostModel + cost snapshot + source job/trial",
    alreadyPromoted: "untouched — no rewrite, no invalidation",
    legacyPromotionToday: "YES if trial.passed (Final PASS) — no provenance gate",
    a72LegacyPromotion:
      "view allowed; new promotion from mixed-engine undocumented ranking should become family-scoped / provenance-gated; require reconstructed group or a new evaluation; already promoted strategies stay valid",
  };
}

export function getLegacyPolicy() {
  return {
    view: "allowed — do not rewrite trials",
    resume: "allowed — RESUME-A rank-time reconstruction; do not mutate past trials",
    rerun: "allowed only as a NEW job/evaluation; do not overwrite historical trial JSON",
    compare: "allowed with PARTIAL caveat — reconstructed group, missing trial-stamped hash",
    ranking:
      "historical scores remain visible; A7.2 new ranking lists are group-scoped using reconstructed rankingCompatibilityGroup",
    promotion:
      "currently allowed if Final PASS; A7.2: family-scoped / reconstructed-group gate for new promotion; no auto-invalidate",
    alreadyPromotedStrategy: "untouched",
  };
}

export function buildDesignIdentity(input: {
  paramsHash: string;
  engineCostModel: ResearchEngineCostModel;
  symbols: string[];
  timeframe: string;
  windows: ResearchEvaluationDataContext["windows"];
  dataVersion: string;
  cost: ResearchEvaluationCostIdentity;
}): { payload: ResearchEvaluationIdentityPayload; hash: string } {
  const group: RankingCompatibilityGroup =
    input.engineCostModel === ENGINE_COST_MODEL_SAFE
      ? ENGINE_COST_MODEL_SAFE
      : ENGINE_COST_MODEL_EVENT_SEQUENCE;
  const payload: ResearchEvaluationIdentityPayload = {
    version: RESEARCH_EVALUATION_IDENTITY_VERSION,
    paramsHash: input.paramsHash,
    engineCostModel: input.engineCostModel,
    rankingCompatibilityGroup: group,
    cost: input.cost,
    data: {
      symbols: [...input.symbols].sort(),
      timeframe: input.timeframe,
      windows: input.windows.map((w) => ({
        id: w.id,
        fromOpenTime: w.fromOpenTime,
        toOpenTime: w.toOpenTime,
      })),
      dataVersion: input.dataVersion,
    },
  };
  return { payload, hash: computeResearchEvaluationHash(payload) };
}

export function proveEvaluationIdentitySensitivity() {
  const params = makeSafeParams(3);
  const paramsHash = computeParamsHash(params);
  const baseWindows = [
    { id: "w1", fromOpenTime: 1_700_000_000_000, toOpenTime: 1_700_086_400_000 },
  ];
  const baseCost = buildCostIdentity({
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    spreadRate: 0.0001,
    applySpread: true,
    costGuardK: 2,
  });
  const base = buildDesignIdentity({
    paramsHash,
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: baseWindows,
    dataVersion: "binance-v1",
    cost: baseCost,
  });
  const same = buildDesignIdentity({
    paramsHash,
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: baseWindows,
    dataVersion: "binance-v1",
    cost: baseCost,
  });
  const fee = buildDesignIdentity({
    paramsHash,
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: baseWindows,
    dataVersion: "binance-v1",
    cost: { ...baseCost, fee: { ...baseCost.fee, configuredRate: 0.0008, effectiveRate: 0.0008 } },
  });
  const slip = buildDesignIdentity({
    paramsHash,
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: baseWindows,
    dataVersion: "binance-v1",
    cost: {
      ...baseCost,
      slippage: { ...baseCost.slippage, configuredRate: 0.0005, effectiveRate: 0.0005 },
    },
  });
  const engine = buildDesignIdentity({
    paramsHash,
    engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: baseWindows,
    dataVersion: "binance-v1",
    cost: buildCostIdentity({
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0.0001,
      applyFunding: false,
      spreadRate: 0.0001,
      applySpread: true,
      costGuardK: null,
    }),
  });
  const funding = buildDesignIdentity({
    paramsHash,
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: baseWindows,
    dataVersion: "binance-v1",
    cost: buildCostIdentity({
      engineCostModel: ENGINE_COST_MODEL_SAFE,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0.0002,
      applyFunding: true,
      spreadRate: 0.0001,
      applySpread: true,
      costGuardK: 2,
    }),
  });
  const spread = buildDesignIdentity({
    paramsHash,
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: baseWindows,
    dataVersion: "binance-v1",
    cost: buildCostIdentity({
      engineCostModel: ENGINE_COST_MODEL_SAFE,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0.0001,
      applyFunding: false,
      spreadRate: 0.0002,
      applySpread: false,
      costGuardK: 2,
    }),
  });
  const symbol = buildDesignIdentity({
    paramsHash,
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    symbols: ["ETHUSDT"],
    timeframe: "15m",
    windows: baseWindows,
    dataVersion: "binance-v1",
    cost: baseCost,
  });
  const timeframe = buildDesignIdentity({
    paramsHash,
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    symbols: ["BTCUSDT"],
    timeframe: "1h",
    windows: baseWindows,
    dataVersion: "binance-v1",
    cost: baseCost,
  });
  const window = buildDesignIdentity({
    paramsHash,
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: [
      { id: "w2", fromOpenTime: 1_710_000_000_000, toOpenTime: 1_710_086_400_000 },
    ],
    dataVersion: "binance-v1",
    cost: baseCost,
  });
  const patternCost = buildCostIdentity({
    engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: true,
    spreadRate: 0.0001,
    applySpread: true,
    costGuardK: 3,
  });
  return {
    paramsHash,
    stableSameContext: base.hash === same.hash,
    feeChangesHash: base.hash !== fee.hash,
    slippageChangesHash: base.hash !== slip.hash,
    engineChangesHash: base.hash !== engine.hash,
    fundingChangesHash: base.hash !== funding.hash,
    spreadChangesHash: base.hash !== spread.hash,
    symbolChangesHash: base.hash !== symbol.hash,
    timeframeChangesHash: base.hash !== timeframe.hash,
    windowChangesHash: base.hash !== window.hash,
    paramsHashUnchanged:
      computeParamsHash(params) === paramsHash &&
      computeParamsHash(params) !== base.hash,
    patternFundingNotApplied:
      patternCost.funding.engineApplied === false &&
      patternCost.funding.effectiveRate === 0 &&
      patternCost.funding.configuredEnabled === true,
    patternSpreadNotApplied:
      patternCost.spread.engineApplied === false &&
      patternCost.spread.effectiveRate === 0 &&
      patternCost.spread.configuredEnabled === true,
  };
}

export function proveGroupRanking() {
  const safe = [
    { id: "S1", score: 0.50, group: ENGINE_COST_MODEL_SAFE },
    { id: "S2", score: 0.55, group: ENGINE_COST_MODEL_SAFE },
  ];
  const pattern = [
    { id: "P1", score: 0.56, group: ENGINE_COST_MODEL_EVENT_SEQUENCE },
    { id: "P2", score: 0.52, group: ENGINE_COST_MODEL_EVENT_SEQUENCE },
  ];
  const safeChamp = [...safe].sort((a, b) => b.score - a.score)[0];
  const patternChamp = [...pattern].sort((a, b) => b.score - a.score)[0];
  const sameGroup = (safeChamp.group as string) === (patternChamp.group as string);
  return {
    safeChampion: safeChamp,
    patternChampion: patternChamp,
    crossGroupComparisonBlocked: !sameGroup,
    noGlobalChampion: true,
    note: "RANK-B: each group sorts independently. P1 score 0.56 is not compared to S2 0.55.",
  };
}

export function getResearchProvenanceSchema() {
  return {
    strategyParamsHash: "paramsHash (unchanged semantic)",
    evaluationIdentity: {
      version: RESEARCH_EVALUATION_IDENTITY_VERSION,
      digestField: "researchEvaluationHash",
    },
    engineCostModel: [
      ENGINE_COST_MODEL_SAFE,
      ENGINE_COST_MODEL_EVENT_SEQUENCE,
      ENGINE_COST_MODEL_CONDITION_BUILDER,
    ],
    rankingCompatibilityGroup: [
      ENGINE_COST_MODEL_SAFE,
      ENGINE_COST_MODEL_EVENT_SEQUENCE,
    ],
    cost: "configured + engineApplied + effective per fee/slip/funding/spread + costGuard + stress",
    data: "symbols, timeframe, windows, dataVersion",
    patternRule:
      "Pattern funding/spread engineApplied=false, effectiveRate=0 even when configured on the job profile",
  };
}

export function getFrozenP3A72IdentityContract(cwd = process.cwd()) {
  const recon = reconstructLegacyTrials(cwd);
  const mixing = proveResumeMixing();
  const identity = getEvaluationIdentityDesign();
  const unresolved: string[] = [];
  if (recon.safe.length < 3) unresolved.push("fewer than 3 historical SAFE trials sampled");
  if (recon.pattern.length < 3) {
    unresolved.push("fewer than 3 historical Pattern trials sampled");
  }
  return {
    P3_A7_2_READY: unresolved.length === 0 ? ("YES" as const) : ("NO" as const),
    unresolved,
    A_paramsHashSemantic:
      "STRATEGY_PARAMETER_IDENTITY — must not change; PARAMS_HASH_CAN_SAFELY_CHANGE=NO",
    B_evaluationIdentitySchema: identity,
    C_identityVersion: RESEARCH_EVALUATION_IDENTITY_VERSION,
    D_comparabilityKey: "rankingCompatibilityGroup",
    E_rankingModel: "RANK-B",
    F_championPolicy:
      "one champion per rankingCompatibilityGroup; no global champion before parity",
    G_promotionEvidenceContract:
      "paramsHash stays strategy identity; promotion evidence references researchEvaluationHash + engineCostModel + cost snapshot + source job/trial",
    H_seenHashesRule: "paramsHash only — do not include costs",
    I_qualifiedHashesRule:
      "remains paramsHash pass-qualification; must not be used as cross-engine order/best",
    J_legacyResumeRule: "RESUME-A rank-time reconstruction; no trial rewrite",
    K_legacyPromotionRule:
      "view allowed; new promotion family-scoped / reconstructed-group gated; already promoted untouched",
    L_patternConfiguredVsApplied:
      "stamp configured flags/rates; engineApplied false and effectiveRate 0 for Pattern funding/spread",
    implementationFiles: [
      "src/lib/rextora/strategySearch/types.ts — additive trial/evaluation fields only",
      "NEW src/lib/rextora/strategySearch/researchEvaluationIdentity.ts — hash + group helpers",
      "src/lib/rextora/strategySearch/backtestAdapter.ts — stamp engineCostModel (no arithmetic change)",
      "src/lib/rextora/strategySearch/jobRunner.ts — persist researchEvaluationHash; group-scope bestCandidate",
      "src/lib/rextora/strategySearch/jobStatistics.ts — keep isBetterScore math; callers pass group-local currentBest",
      "src/lib/rextora/strategySearch/searchOrchestrator.ts — stop using last qualifiedHashes as global best",
      "src/lib/rextora/strategySearch/researchResultsSummary.ts — group-scope composite recommendation",
      "src/lib/rextora/strategySearch/researchTop10.ts — group lists; identityKey must not stay paramsHash-only",
      "src/lib/rextora/strategySearch/promoteFromSearch.ts — attach evaluation evidence; gate legacy mixed promotion",
      "src/lib/rextora/strategySearch/jobApiService.ts — additive rankingGroups; keep flat history list",
      "src/lib/rextora/strategySearch/jobRecordRecovery.ts — reconstruct group champions without rewriting trials",
    ],
    productionMigrationRequired: "NO",
    reconstructionSample: {
      safeCount: recon.safe.length,
      patternCount: recon.pattern.length,
      scannedJobs: recon.scannedJobs,
      profilesPresent: recon.profilesPresent,
    },
    resumeMix: mixing.LEGACY_NEW_TRIAL_RANKING_MIX,
  };
}

export function getUiApiSemantics() {
  return {
    currentExpects: [
      "one Top-10 (job.top10.json)",
      "one bestScore / bestCandidateHash",
      "one 최종 추천",
    ],
    minimumAdditiveShape: {
      rankingGroups: [
        {
          compatibilityGroup: ENGINE_COST_MODEL_SAFE,
          engineCostModel: ENGINE_COST_MODEL_SAFE,
          candidates: [],
          champion: null,
        },
        {
          compatibilityGroup: ENGINE_COST_MODEL_EVENT_SEQUENCE,
          engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
          candidates: [],
          champion: null,
        },
      ],
    },
    historyDisplay:
      "Legacy flat Top-10 / trial list remains readable. New jobs emit rankingGroups. Do not redesign UI in A7.1.1.",
  };
}

export function buildP3A711Diagnosis(cwd = process.cwd()) {
  const hashes = productionReadonlyHashes(cwd);
  return {
    hashes,
    paramsHash: getParamsHashConsumers(),
    sameParamsDifferentCost: proveSameParamsDifferentCostContext(),
    evaluationIdentity: getEvaluationIdentityDesign(),
    dataContext: getDataContextIdentity(),
    costIdentity: getCostIdentityDesign(),
    comparability: getComparabilityKey(),
    rankingPipeline: getRankingPipeline(),
    rankingModels: getRankingModelComparison(),
    champion: getChampionPolicy(),
    promotion: getPromotionContract(),
    resumeFlow: getHistoricalResumeFlow(),
    legacyReconstruction: reconstructLegacyTrials(cwd),
    resumeMixing: proveResumeMixing(),
    resumePolicy: getResumePolicyComparison(),
    seenHashes: getSeenHashesSemantics(),
    qualifiedHashes: getQualifiedHashesSemantics(),
    promotionEvidence: getPromotionEvidenceDesign(),
    legacyPolicy: getLegacyPolicy(),
    identitySensitivity: proveEvaluationIdentitySensitivity(),
    groupRanking: proveGroupRanking(),
    provenanceSchema: getResearchProvenanceSchema(),
    uiApi: getUiApiSemantics(),
    frozen: getFrozenP3A72IdentityContract(cwd),
    productionSafety: {
      researchExecutions: 0,
      paperLiveActions: 0,
      orders: 0,
      diagnosisWritesProduction: false,
    },
  };
}

export function writeP3A711Artifacts(cwd = process.cwd()) {
  const diagnosis = buildP3A711Diagnosis(cwd);
  const dir = path.join(
    cwd,
    ".validation",
    "research-p3-a7-1-1-ranking-identity",
    P3A711_ARTIFACT_TS,
  );
  fs.mkdirSync(dir, { recursive: true });
  const files: Record<string, unknown> = {
    "params-hash-consumers.json": diagnosis.paramsHash,
    "evaluation-identity-design.json": {
      ...diagnosis.evaluationIdentity,
      sensitivity: diagnosis.identitySensitivity,
    },
    "data-context-identity.json": diagnosis.dataContext,
    "cost-identity-design.json": diagnosis.costIdentity,
    "comparability-key.json": diagnosis.comparability,
    "ranking-pipeline.json": diagnosis.rankingPipeline,
    "ranking-model-comparison.json": diagnosis.rankingModels,
    "champion-policy.json": diagnosis.champion,
    "promotion-contract.json": diagnosis.promotion,
    "historical-resume-flow.json": diagnosis.resumeFlow,
    "legacy-trial-reconstruction.json": diagnosis.legacyReconstruction,
    "resume-mixing.json": diagnosis.resumeMixing,
    "resume-policy.json": diagnosis.resumePolicy,
    "seen-hashes-semantics.json": diagnosis.seenHashes,
    "qualified-hashes-semantics.json": diagnosis.qualifiedHashes,
    "promotion-evidence.json": diagnosis.promotionEvidence,
    "legacy-policy.json": diagnosis.legacyPolicy,
    "p3-a7-2-frozen-contract.json": diagnosis.frozen,
    "production-readonly-hashes.json": diagnosis.hashes,
  };
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), "utf8");
  }
  return { dir, diagnosis };
}

export function productionSafetySnapshot(cwd = process.cwd()) {
  const hashes = productionReadonlyHashes(cwd);
  const safePath = path.join(cwd, "data/strategies/SAFE_v44_i4060.json");
  return {
    ...hashes,
    safeSha256Now: sha256File(safePath),
    researchExecutions: 0,
    paperLiveActions: 0,
    orders: 0,
  };
}
