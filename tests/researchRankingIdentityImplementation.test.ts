import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import * as strategyStore from "../src/lib/rextora/strategy/strategyStore";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import {
  createSearchJob,
  runSearchJob,
  saveSearchTrial,
  type EvaluateCompleteCandidateInput,
  type StrategySearchCompleteCandidateEvaluation,
  type StrategySearchConfig,
  type StrategySearchTrial,
} from "../src/lib/rextora/strategySearch";
import { getStrategySearchJobApi } from "../src/lib/rextora/strategySearch/jobApiService";
import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import { StrategySearchApiError } from "../src/lib/rextora/strategySearch/jobApiService";
import { promoteSearchCandidateToStrategy } from "../src/lib/rextora/strategySearch/promoteFromSearch";
import {
  ENGINE_COST_MODEL_EVENT_SEQUENCE,
  ENGINE_COST_MODEL_SAFE,
  GROUP_PATTERN,
  GROUP_SAFE,
  GROUP_UNKNOWN_LEGACY,
  RESEARCH_EVALUATION_IDENTITY_VERSION,
  applyGroupChampA,
  buildResearchCostProvenance,
  buildResearchEvaluationIdentity,
  buildResearchEvaluationPolicy,
  champAHashes,
  classifyResearchTrial,
  computeResearchEvaluationHash,
  emptyBestByCompatibilityGroup,
  reconstructGroupBestFromReferenced,
  reconstructGroupBestFromTrials,
  stampResearchEvaluation,
} from "../src/lib/rextora/strategySearch/researchEvaluationIdentity";
import { selectResearchTop10 } from "../src/lib/rextora/strategySearch/researchTop10";
import type { ResearchResultCard } from "../src/lib/rextora/strategySearch/researchResultsSummary";

const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const BACKTEST_INDEX_SHA =
  "4140af487e4bd32aa0b2b34ea2f57069e7785689a268a437acfca5d886fda9ae";

const hashesBefore = productionReadonlyHashes();
const tempRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a72-"));
  tempRoots.push(root);
  return { rootDir: root };
}

const BASE_COST = {
  feeRate: 0.0004,
  slippageRate: 0.0002,
  fundingRate: 0.0001,
  applyFunding: true,
  applySpread: true,
  spreadRate: 0.00005,
};

const WINDOWS = [
  { id: "w1", fromOpenTime: 1_700_000_000_000, toOpenTime: 1_700_100_000_000 },
  { id: "w2", fromOpenTime: 1_699_000_000_000, toOpenTime: 1_699_900_000_000 },
];

const SAFE_PARAMS = {
  ...CONTEXT_FALLBACK_PARAMS,
  ema_fast: 12,
  sl_atr_mult: 1.5,
  cost_guard_k: 2,
};

const PATTERN_PARAMS = {
  penetrationPct: 0.3,
  stopAtrMult: 1.2,
  tpAtrMult: 2,
  maxHoldBars: 48,
  zoneLookback: 20,
};

const DEFAULT_SCORE_WEIGHTS = {
  returnWeight: 1,
  mddWeight: 0.5,
  profitFactorWeight: 0.25,
  winRateWeight: 0.25,
  tradeAdequacyWeight: 0.25,
  negativeMonthWeight: 0.1,
  consistencyWeight: 0.1,
};

const DEFAULT_JITTER = {
  enabled: false,
  sampleCount: 1,
  mutationScale: 0.1,
  seed: 1,
  minimumPassRate: 0,
  maximumScoreDropRatio: 1,
  parameterRanges: [],
};

function defaultPolicy() {
  return buildResearchEvaluationPolicy({
    passPolicy: { thresholds: { minTradeCount: 0 } },
    scoreWeights: DEFAULT_SCORE_WEIGHTS,
    costStressScenarios: [],
    jitterConfig: DEFAULT_JITTER,
  });
}

function identityInput(
  overrides: Partial<Parameters<typeof buildResearchEvaluationIdentity>[0]> = {},
) {
  return {
    paramsHash: computeParamsHash(SAFE_PARAMS),
    engineCostModel: ENGINE_COST_MODEL_SAFE as typeof ENGINE_COST_MODEL_SAFE,
    cost: { ...BASE_COST },
    costGuardK: 2,
    symbols: ["ETHUSDT", "BTCUSDT"],
    timeframe: "15m",
    windows: WINDOWS,
    dataVersion: "binance-v1",
    evaluationBalance: 10_000,
    evaluationPolicy: defaultPolicy(),
    ...overrides,
  };
}

function stampInput(
  overrides: Partial<Parameters<typeof stampResearchEvaluation>[0]> = {},
) {
  return {
    params: SAFE_PARAMS,
    paramsHash: computeParamsHash(SAFE_PARAMS),
    cost: BASE_COST,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: WINDOWS,
    dataVersion: "v1",
    evaluationBalance: 10_000,
    passPolicy: { thresholds: { minTradeCount: 0 } },
    scoreWeights: DEFAULT_SCORE_WEIGHTS,
    costStressScenarios: [],
    jitterConfig: DEFAULT_JITTER,
    ...overrides,
  };
}

function makeTrial(
  overrides: Partial<StrategySearchTrial> &
    Pick<StrategySearchTrial, "iteration" | "paramsHash" | "score" | "passed">,
): StrategySearchTrial {
  return {
    jobId: "job_test",
    candidateId: `c${overrides.iteration}`,
    params: {},
    generatorType: "random",
    parentCandidateIds: [],
    failureReasons: [],
    windowResults: [],
    costStressResults: [],
    jitterResults: [],
    durationMs: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function card(input: {
  paramsHash: string;
  score: number;
  netReturn: number;
  maxDrawdown: number;
  profitFactor: number;
  tradeCount: number;
}): ResearchResultCard {
  return {
    iteration: 1,
    candidateId: input.paramsHash,
    paramsHash: input.paramsHash,
    readableName: input.paramsHash,
    displayAlias: input.paramsHash,
    strategyFamily: "ema_trend",
    symbol: "BTCUSDT",
    timeframe: "15m",
    sourceResearchJobId: "job",
    netReturn: input.netReturn,
    maxDrawdown: input.maxDrawdown,
    tradeCount: input.tradeCount,
    profitFactor: input.profitFactor,
    totalCost: 0,
    costStatus: "비용 데이터 없음",
    sampleConfidence: "표본 충분",
    sampleConfidenceDetail: "",
    score: input.score,
    stressPassed: true,
    jitterPassed: true,
    robustnessStatus: "ok",
    overfittingRisk: "low",
    eligibilityStatus: "최종 추천 가능",
    recommendable: true,
    finalRecommendable: true,
    roles: [],
    registrationState: "미등록",
    registeredStrategyId: null,
    clusterId: input.paramsHash,
    isRepresentative: true,
    memberCount: 1,
    strongestPoint: "",
    primaryWeakness: "",
    recommendationReason: "",
    leverageLabel: "—",
    whyNotRank1: "",
    vsPreviousRankNote: "",
  };
}

function sampleConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "a72_identity",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 42,
    generatorType: "random",
    maxIterations: 2,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 12, step: 1, valueType: "integer" },
    ],
    evaluationWindows: [
      {
        id: "w1",
        label: "recent",
        fromOpenTime: 1_700_000_000_000,
        toOpenTime: 1_700_100_000_000,
      },
    ],
    passCriteria: { minTradeCount: 1, requireAllWindowsPass: true },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function evalFixtures() {
  return {
    windows: [
      {
        id: "w1",
        label: "recent",
        requestedFrom: 1_700_000_000_000,
        requestedTo: 1_700_100_000_000,
        requiredForPass: true,
      },
    ],
    balance: 10_000,
    baseCostConfig: { ...BASE_COST, applyFunding: false, fundingRate: 0 },
    passPolicy: { thresholds: { minTradeCount: 0 } },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [] as const,
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.1,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        {
          key: "ema_fast",
          min: 10,
          max: 10,
          step: 1,
          valueType: "integer" as const,
        },
      ],
    },
  };
}

function mockEval(
  score: number,
): (
  input: EvaluateCompleteCandidateInput,
) => Promise<StrategySearchCompleteCandidateEvaluation> {
  return async (input) => ({
    candidateId: input.candidate.candidateId,
    paramsHash: input.candidate.paramsHash,
    baseEvaluation: {
      candidateId: input.candidate.candidateId,
      paramsHash: input.candidate.paramsHash,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [],
      costConfig: evalFixtures().baseCostConfig,
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 1,
    },
    basePass: {
      passed: true,
      requiredWindowCount: 1,
      passedRequiredWindowCount: 1,
      failedRequiredWindowCount: 0,
      issues: [],
    },
    baseScore: {
      finalScore: score,
      breakdown: {
        returnReward: score,
        mddPenalty: 0,
        profitFactorReward: 0,
        winRateReward: 0,
        tradeAdequacy: 0,
        negativeMonthPenalty: 0,
        consistency: 0,
        weightedReturn: score,
        weightedMdd: 0,
        weightedProfitFactor: 0,
        weightedWinRate: 0,
        weightedTradeAdequacy: 0,
        weightedNegativeMonth: 0,
        weightedConsistency: 0,
      },
      weights: evalFixtures().scoreWeights,
      requiredWindowCount: 1,
    },
    costStressResults: [],
    costStressPassed: true,
    jitterResult: {
      enabled: false,
      jitterPassed: true,
      sampleCount: 0,
      passedSampleCount: 0,
      failedSampleCount: 0,
      passRate: 1,
      averageScore: null,
      minimumScore: null,
      maximumScore: null,
      averageScoreDropRatio: null,
      maximumObservedScoreDropRatio: null,
      baseScore: score,
      samples: [],
    },
    finalPassed: true,
    startedAt: "2024-01-01T00:00:00.000Z",
    completedAt: "2024-01-01T00:00:01.000Z",
    durationMs: 1,
  });
}

describe("P3-A7.2 research evaluation identity", () => {
  it("keeps paramsHash unchanged across cost and engine-model changes", () => {
    const base = computeParamsHash(SAFE_PARAMS);
    expect(computeParamsHash({ ...SAFE_PARAMS })).toBe(base);
    const feeA = stampResearchEvaluation(stampInput({ paramsHash: base }));
    const feeB = stampResearchEvaluation(
      stampInput({ paramsHash: base, cost: { ...BASE_COST, feeRate: 0.002 } }),
    );
    const slipB = stampResearchEvaluation(
      stampInput({
        paramsHash: base,
        cost: { ...BASE_COST, slippageRate: 0.01 },
      }),
    );
    const engineB = stampResearchEvaluation(
      stampInput({ params: PATTERN_PARAMS, paramsHash: base }),
    );
    expect(feeA.researchEvaluationHash).not.toBe(feeB.researchEvaluationHash);
    expect(feeA.researchEvaluationHash).not.toBe(slipB.researchEvaluationHash);
    expect(feeA.researchEvaluationHash).not.toBe(engineB.researchEvaluationHash);
    expect(feeA.classification.engineCostModel).toBe(ENGINE_COST_MODEL_SAFE);
    expect(engineB.classification.engineCostModel).toBe(
      ENGINE_COST_MODEL_EVENT_SEQUENCE,
    );
  });

  it("uses research_evaluation_identity_v1 and a stable hash", () => {
    const a = buildResearchEvaluationIdentity(identityInput());
    const b = buildResearchEvaluationIdentity(identityInput());
    expect(a.version).toBe(RESEARCH_EVALUATION_IDENTITY_VERSION);
    expect(computeResearchEvaluationHash(a)).toBe(computeResearchEvaluationHash(b));
    expect(a.symbols).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(a.windows.map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("changes evaluation hash for each required context field", () => {
    const base = computeResearchEvaluationHash(
      buildResearchEvaluationIdentity(identityInput()),
    );
    expect(
      computeResearchEvaluationHash(
        buildResearchEvaluationIdentity(
          identityInput({ cost: { ...BASE_COST, feeRate: 0.001 } }),
        ),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        buildResearchEvaluationIdentity(
          identityInput({ cost: { ...BASE_COST, slippageRate: 0.001 } }),
        ),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        buildResearchEvaluationIdentity(
          identityInput({ cost: { ...BASE_COST, fundingRate: 0.0009 } }),
        ),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        buildResearchEvaluationIdentity(
          identityInput({ cost: { ...BASE_COST, spreadRate: 0.0009 } }),
        ),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        buildResearchEvaluationIdentity(
          identityInput({ engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE }),
        ),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        buildResearchEvaluationIdentity(identityInput({ symbols: ["SOLUSDT"] })),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        buildResearchEvaluationIdentity(identityInput({ timeframe: "1h" })),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        buildResearchEvaluationIdentity(
          identityInput({
            windows: [
              {
                id: "w1",
                fromOpenTime: 1,
                toOpenTime: 2,
              },
            ],
          }),
        ),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        buildResearchEvaluationIdentity(identityInput({ dataVersion: "v2" })),
      ),
    ).not.toBe(base);
    const oneWindow = computeResearchEvaluationHash(
      buildResearchEvaluationIdentity(
        identityInput({ windows: [WINDOWS[0]!] }),
      ),
    );
    expect(oneWindow).not.toBe(base);
  });

  it("excludes volatile identifiers from the evaluation hash", () => {
    const identity = buildResearchEvaluationIdentity(identityInput());
    expect(Object.keys(identity).sort()).toEqual([
      "cost",
      "dataVersion",
      "engineCostModel",
      "evaluationBalance",
      "evaluationPolicy",
      "paramsHash",
      "rankingCompatibilityGroup",
      "symbols",
      "timeframe",
      "version",
      "windows",
    ]);
    expect(JSON.stringify(identity)).not.toMatch(
      /candidateId|iteration|jobId|createdAt|uiName/,
    );
  });
});

describe("P3-A7.2 cost provenance truthfulness", () => {
  it("records SAFE configured vs applied vs effective costs", () => {
    const disabledFunding = buildResearchCostProvenance({
      engineCostModel: ENGINE_COST_MODEL_SAFE,
      cost: { ...BASE_COST, applyFunding: false, fundingRate: 0.0003 },
      costGuardK: 2,
    });
    expect(disabledFunding.funding.configuredEnabled).toBe(false);
    expect(disabledFunding.funding.configuredRate).toBe(0.0003);
    expect(disabledFunding.funding.engineApplied).toBe(false);
    expect(disabledFunding.funding.effectiveRate).toBe(0);

    const spreadOn = buildResearchCostProvenance({
      engineCostModel: ENGINE_COST_MODEL_SAFE,
      cost: BASE_COST,
      costGuardK: 2,
    });
    expect(spreadOn.spread.engineApplied).toBe(true);
    expect(spreadOn.spread.effectiveRate).toBe(BASE_COST.spreadRate);
    expect(spreadOn.fee.engineApplied).toBe(true);
    expect(spreadOn.slippage.engineApplied).toBe(true);
    expect(spreadOn.costGuard.engineApplied).toBe(true);
    expect(spreadOn.costGuard.effectiveK).toBe(2);
  });

  it("keeps Pattern configured costs while engine-applied funding/spread/guard stay off", () => {
    const pattern = buildResearchCostProvenance({
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
      cost: BASE_COST,
      costGuardK: 2,
    });
    expect(pattern.funding.configuredEnabled).toBe(true);
    expect(pattern.funding.engineApplied).toBe(false);
    expect(pattern.funding.effectiveRate).toBe(0);
    expect(pattern.spread.configuredEnabled).toBe(true);
    expect(pattern.spread.engineApplied).toBe(false);
    expect(pattern.spread.effectiveRate).toBe(0);
    expect(pattern.fee.engineApplied).toBe(true);
    expect(pattern.slippage.engineApplied).toBe(true);
    expect(pattern.slippage.model).toBe(ENGINE_COST_MODEL_EVENT_SEQUENCE);
    expect(pattern.costGuard.engineApplied).toBe(false);
    expect(pattern.costGuard.effectiveK).toBeNull();
    expect(pattern.costGuard.configuredK).toBe(2);
  });
});

describe("P3-A7.2 group ranking", () => {
  it("keeps independent CHAMP-A winners and ignores UNKNOWN 999", () => {
    let groups = emptyBestByCompatibilityGroup();
    groups = applyGroupChampA(groups, GROUP_SAFE, {
      candidateId: "s1",
      iteration: 0,
      paramsHash: "safe60",
      score: 0.6,
      passed: true,
    });
    groups = applyGroupChampA(groups, GROUP_PATTERN, {
      candidateId: "p1",
      iteration: 1,
      paramsHash: "pat90",
      score: 0.9,
      passed: true,
    });
    groups = applyGroupChampA(groups, GROUP_SAFE, {
      candidateId: "s2",
      iteration: 2,
      paramsHash: "safe70",
      score: 0.7,
      passed: true,
    });
    groups = applyGroupChampA(groups, GROUP_PATTERN, {
      candidateId: "p2",
      iteration: 3,
      paramsHash: "pat80",
      score: 0.8,
      passed: true,
    });
    const afterUnknown = applyGroupChampA(groups, GROUP_UNKNOWN_LEGACY, {
      candidateId: "u1",
      iteration: 4,
      paramsHash: "unk999",
      score: 999,
      passed: true,
    });
    const safe = afterUnknown.find(
      (row) => row.rankingCompatibilityGroup === GROUP_SAFE,
    );
    const pattern = afterUnknown.find(
      (row) => row.rankingCompatibilityGroup === GROUP_PATTERN,
    );
    expect(safe?.bestCandidate?.score).toBe(0.7);
    expect(safe?.bestPassedCandidate?.paramsHash).toBe("safe70");
    expect(pattern?.bestCandidate?.score).toBe(0.9);
    expect(pattern?.bestPassedCandidate?.paramsHash).toBe("pat90");
    expect(afterUnknown.some((row) => row.bestScore === 999)).toBe(false);
    expect(afterUnknown.some((row) => row.bestScore === 0.9 && row.rankingCompatibilityGroup === GROUP_SAFE)).toBe(false);
    const unknown = classifyResearchTrial({ params: {} });
    expect(unknown.rankingCompatibilityGroup).toBe(GROUP_UNKNOWN_LEGACY);
    expect(unknown.rankingEligible).toBe(false);
    expect(unknown.promotionEligible).toBe(false);
  });

  it("does not write an authoritative new-job global scalar champion", async () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 2 }), store);
    const result = await runSearchJob({
      jobId: job.id,
      storeOptions: store,
      ...evalFixtures(),
      evaluate: mockEval(0.55),
    });
    expect(result.job.checkpoint.bestCandidate).toBeNull();
    expect(result.job.checkpoint.bestPassedCandidate).toBeNull();
    expect(result.statistics.bestScore).toBeNull();
    const safe = result.job.checkpoint.bestByCompatibilityGroup?.find(
      (row) => row.rankingCompatibilityGroup === GROUP_SAFE,
    );
    expect(safe?.bestCandidate?.score).toBe(0.55);
    const summary = getStrategySearchJobApi(job.id, store);
    expect(summary.bestCandidateHash).toBeNull();
    expect(summary.rankingGroups?.some((g) => g.bestCandidate?.score === 0.55)).toBe(
      true,
    );
    expect(summary.unknownLegacy?.rankingEligible).toBe(false);
    expect(summary.unknownLegacy?.promotionEligible).toBe(false);
  });
});

describe("P3-A7.2 checkpoint reconstruction", () => {
  it("seeds only the proven referenced group and never writes historical files", () => {
    const safeTrial = makeTrial({
      iteration: 1,
      paramsHash: "safe70",
      score: 0.7,
      passed: true,
      params: SAFE_PARAMS,
    });
    const patternTrial = makeTrial({
      iteration: 2,
      paramsHash: "pat90",
      score: 0.9,
      passed: true,
      params: PATTERN_PARAMS,
    });
    const unknownTrial = makeTrial({
      iteration: 3,
      paramsHash: "invalid_3",
      score: 999,
      passed: true,
      params: {},
    });
    const byIter = new Map([
      [1, safeTrial],
      [2, patternTrial],
      [3, unknownTrial],
    ]);
    const safeOnly = reconstructGroupBestFromReferenced({
      bestCandidate: {
        candidateId: "c1",
        iteration: 1,
        paramsHash: "safe70",
        score: 0.7,
        passed: true,
      },
      bestPassedCandidate: {
        candidateId: "c1",
        iteration: 1,
        paramsHash: "safe70",
        score: 0.7,
        passed: true,
      },
      resolveTrial: (ref) => byIter.get(ref.iteration),
    });
    expect(safeOnly[0]?.bestCandidate?.paramsHash).toBe("safe70");
    expect(
      safeOnly.find((row) => row.rankingCompatibilityGroup === GROUP_PATTERN)
        ?.bestCandidate,
    ).toBeNull();

    const patternOnly = reconstructGroupBestFromReferenced({
      bestCandidate: {
        candidateId: "c2",
        iteration: 2,
        paramsHash: "pat90",
        score: 0.9,
        passed: true,
      },
      bestPassedCandidate: null,
      resolveTrial: (ref) => byIter.get(ref.iteration),
    });
    expect(
      patternOnly.find((row) => row.rankingCompatibilityGroup === GROUP_SAFE)
        ?.bestCandidate,
    ).toBeNull();
    expect(
      patternOnly.find((row) => row.rankingCompatibilityGroup === GROUP_PATTERN)
        ?.bestCandidate?.paramsHash,
    ).toBe("pat90");

    const unknown = reconstructGroupBestFromReferenced({
      bestCandidate: {
        candidateId: "c3",
        iteration: 3,
        paramsHash: "invalid_3",
        score: 999,
        passed: true,
      },
      bestPassedCandidate: {
        candidateId: "c3",
        iteration: 3,
        paramsHash: "invalid_3",
        score: 999,
        passed: true,
      },
      resolveTrial: (ref) => byIter.get(ref.iteration),
    });
    expect(unknown[0]?.bestCandidate).toBeNull();
    expect(unknown[1]?.bestCandidate).toBeNull();
  });

  it("resumes mixed legacy + new trials group-locally", () => {
    const trials = [
      makeTrial({
        iteration: 0,
        paramsHash: "legacy_safe",
        score: 0.61,
        passed: true,
        params: SAFE_PARAMS,
      }),
      makeTrial({
        iteration: 1,
        paramsHash: "legacy_pat",
        score: 0.88,
        passed: true,
        params: PATTERN_PARAMS,
      }),
      makeTrial({
        iteration: 2,
        paramsHash: "invalid_2",
        score: 999,
        passed: true,
        params: {},
      }),
      makeTrial({
        iteration: 3,
        paramsHash: "new_safe",
        score: 0.72,
        passed: true,
        params: SAFE_PARAMS,
        engineCostModel: ENGINE_COST_MODEL_SAFE,
        rankingCompatibilityGroup: GROUP_SAFE,
        rankingEligible: true,
      }),
      makeTrial({
        iteration: 4,
        paramsHash: "new_pat",
        score: 0.81,
        passed: true,
        params: PATTERN_PARAMS,
        engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
        rankingCompatibilityGroup: GROUP_PATTERN,
        rankingEligible: true,
      }),
    ];
    const groups = reconstructGroupBestFromTrials(trials);
    expect(groups[0]?.bestPassedCandidate?.paramsHash).toBe("new_safe");
    expect(groups[0]?.bestScore).toBe(0.72);
    expect(
      groups.find((row) => row.rankingCompatibilityGroup === GROUP_PATTERN)
        ?.bestPassedCandidate?.paramsHash,
    ).toBe("legacy_pat");
    expect(
      groups.find((row) => row.rankingCompatibilityGroup === GROUP_PATTERN)
        ?.bestScore,
    ).toBe(0.88);
    expect(champAHashes(groups).includes("invalid_2")).toBe(false);
  });
});

describe("P3-A7.2 qualifiedHashes and display formulas", () => {
  it("does not treat last qualified hash as a group champion", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/searchOrchestrator.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(
      /qualifiedHashes\[plan\.qualifiedHashes\.length - 1\]/,
    );
    expect(src).toMatch(/groupForSearchSpaceId/);
    const trials = [
      makeTrial({
        iteration: 0,
        paramsHash: "qualified_last",
        score: 0.1,
        passed: true,
        params: SAFE_PARAMS,
      }),
      makeTrial({
        iteration: 1,
        paramsHash: "champ_safe",
        score: 0.7,
        passed: true,
        params: SAFE_PARAMS,
      }),
    ];
    const groups = reconstructGroupBestFromTrials(trials);
    expect(groups[0]?.bestPassedCandidate?.paramsHash).toBe("champ_safe");
    expect(groups[0]?.bestPassedCandidate?.paramsHash).not.toBe(
      "qualified_last",
    );
  });

  it("keeps Top10/Summary formulas display-only and binds 최종 추천 to CHAMP-A", () => {
    const a = card({
      paramsHash: "top10_winner",
      score: 0.4,
      netReturn: 0.4,
      maxDrawdown: -0.05,
      profitFactor: 2,
      tradeCount: 40,
    });
    const b = card({
      paramsHash: "summary_winner",
      score: 0.9,
      netReturn: 0.05,
      maxDrawdown: -0.2,
      profitFactor: 1.1,
      tradeCount: 8,
    });
    const top10 = selectResearchTop10([a, b], {
      champAHashes: ["summary_winner"],
    });
    const recommended = top10.find((row) => row.roles.includes("최종 추천"));
    expect(recommended?.paramsHash).toBe("summary_winner");
    const top10Only = selectResearchTop10([a, b]);
    expect(top10Only[0]?.paramsHash).toBe("top10_winner");
    expect(champAHashes([
      {
        rankingCompatibilityGroup: GROUP_SAFE,
        bestCandidate: null,
        bestPassedCandidate: {
          candidateId: "b",
          iteration: 1,
          paramsHash: "summary_winner",
          score: 0.9,
          passed: true,
        },
        bestScore: 0.9,
      },
      {
        rankingCompatibilityGroup: GROUP_PATTERN,
        bestCandidate: null,
        bestPassedCandidate: null,
        bestScore: null,
      },
    ])).toEqual(["summary_winner"]);
  });
});

describe("P3-A7.2 promotion provenance", () => {
  function profile() {
    const fixtures = evalFixtures();
    return {
      version: 1 as const,
      balance: 10_000,
      baseCostConfig: fixtures.baseCostConfig,
      passPolicy: fixtures.passPolicy,
      scoreWeights: fixtures.scoreWeights,
      costStressScenarios: [],
      jitterConfig: fixtures.jitterConfig,
      dataRef: {
        availableFrom: 1_700_000_000_000,
        availableTo: 1_700_100_000_000,
        source: "preloaded" as const,
      },
    };
  }

  it("allows new SAFE and Pattern Final PASS with complete evidence", () => {
    vi.spyOn(strategyStore, "listStrategies").mockReturnValue([]);
    vi.spyOn(strategyStore, "createStrategy").mockImplementation((input) => ({
      id: `promoted_${input.sourceParamsHash ?? "x"}`,
      name: input.name,
      paramsHash: typeof input.params === "object"
        ? computeParamsHash(input.params as Record<string, unknown>)
        : "mock",
      strategyHash: "mock",
      sourceParamsHash: input.sourceParamsHash ?? null,
      locked: false,
      description: input.description,
    }) as ReturnType<typeof strategyStore.createStrategy>);
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 1 }), store);
    saveJobExecutionProfile(job.id, profile(), store);
    const safeHash = computeParamsHash(SAFE_PARAMS);
    const stamped = stampResearchEvaluation(
      stampInput({
        paramsHash: safeHash,
        symbols: job.config.symbols,
        timeframe: job.config.timeframe,
        windows: job.config.evaluationWindows,
        dataVersion: job.config.dataVersion,
      }),
    );
    saveSearchTrial(
      makeTrial({
        jobId: job.id,
        iteration: 0,
        paramsHash: safeHash,
        score: 0.7,
        passed: true,
        params: SAFE_PARAMS,
        researchEvaluationIdentity: stamped.researchEvaluationIdentity,
        researchEvaluationHash: stamped.researchEvaluationHash,
        engineCostModel: ENGINE_COST_MODEL_SAFE,
        rankingCompatibilityGroup: GROUP_SAFE,
        rankingEligible: true,
        promotionEligible: true,
      }),
      store,
    );
    const created = promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 0,
      storeOptions: store,
    });
    expect(created.registrationState).toBe("registered");
    expect(created.paramsHash).toBe(computeParamsHash(SAFE_PARAMS));
    expect(strategyStore.createStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("researchEvaluationHash="),
      }),
    );

    const patternJob = createSearchJob(sampleConfig({ maxIterations: 1 }), store);
    saveJobExecutionProfile(patternJob.id, profile(), store);
    const patternStamp = stampResearchEvaluation(
      stampInput({
        params: PATTERN_PARAMS,
        paramsHash: "pattern_new",
        symbols: patternJob.config.symbols,
        timeframe: patternJob.config.timeframe,
        windows: patternJob.config.evaluationWindows,
        dataVersion: patternJob.config.dataVersion,
      }),
    );
    saveSearchTrial(
      makeTrial({
        jobId: patternJob.id,
        iteration: 0,
        paramsHash: "pattern_new",
        score: 0.8,
        passed: true,
        params: PATTERN_PARAMS,
        researchEvaluationIdentity: patternStamp.researchEvaluationIdentity,
        researchEvaluationHash: patternStamp.researchEvaluationHash,
        engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
        rankingCompatibilityGroup: GROUP_PATTERN,
        rankingEligible: true,
        promotionEligible: true,
      }),
      store,
    );
    const patternCreated = promoteSearchCandidateToStrategy({
      jobId: patternJob.id,
      iteration: 0,
      storeOptions: store,
    });
    expect(patternCreated.registrationState).toBe("registered");
  });

  it("blocks missing evaluation hash, UNKNOWN, and incomplete historical evidence", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 1 }), store);
    saveSearchTrial(
      makeTrial({
        jobId: job.id,
        iteration: 0,
        paramsHash: computeParamsHash(SAFE_PARAMS),
        score: 0.7,
        passed: true,
        params: SAFE_PARAMS,
        engineCostModel: ENGINE_COST_MODEL_SAFE,
        rankingCompatibilityGroup: GROUP_SAFE,
      }),
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: job.id,
        iteration: 0,
        storeOptions: store,
      }),
    ).toThrow(StrategySearchApiError);

    const unknownJob = createSearchJob(sampleConfig({ maxIterations: 1 }), store);
    saveSearchTrial(
      makeTrial({
        jobId: unknownJob.id,
        iteration: 0,
        paramsHash: "invalid_0",
        score: 999,
        passed: true,
        params: {},
        rankingCompatibilityGroup: GROUP_UNKNOWN_LEGACY,
        rankingEligible: false,
        promotionEligible: false,
      }),
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: unknownJob.id,
        iteration: 0,
        storeOptions: store,
      }),
    ).toThrow(/unknown_legacy|PASS|protected/i);

    const histJob = createSearchJob(sampleConfig({ maxIterations: 1 }), store);
    saveSearchTrial(
      makeTrial({
        jobId: histJob.id,
        iteration: 0,
        paramsHash: computeParamsHash({ ...SAFE_PARAMS, ema_fast: 14 }),
        score: 0.66,
        passed: true,
        params: { ...SAFE_PARAMS, ema_fast: 14 },
      }),
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: histJob.id,
        iteration: 0,
        storeOptions: store,
      }),
    ).toThrow(/reconstructed|evidence/i);
  });

  it("allows historical reconstructed promotion when the profile exists", () => {
    vi.spyOn(strategyStore, "listStrategies").mockReturnValue([]);
    vi.spyOn(strategyStore, "createStrategy").mockImplementation((input) => ({
      id: "hist_promoted",
      name: input.name,
      paramsHash: computeParamsHash(input.params as Record<string, unknown>),
      strategyHash: "mock",
      sourceParamsHash: input.sourceParamsHash ?? null,
      locked: false,
      description: input.description,
    }) as ReturnType<typeof strategyStore.createStrategy>);
    const store = tempStore();
    const job = createSearchJob(sampleConfig({ maxIterations: 1 }), store);
    saveJobExecutionProfile(job.id, profile(), store);
    const params = { ...SAFE_PARAMS, ema_fast: 15 };
    saveSearchTrial(
      makeTrial({
        jobId: job.id,
        iteration: 0,
        paramsHash: computeParamsHash(params),
        score: 0.64,
        passed: true,
        params,
      }),
      store,
    );
    const created = promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 0,
      storeOptions: store,
    });
    expect(created.registrationState).toBe("registered");
    expect(created.alreadyExists).toBe(false);
  });
});

describe("P3-A7.2 production safety and arithmetic isolation", () => {
  it("does not rewrite production indexes or SAFE", () => {
    const hashes = productionReadonlyHashes();
    expect(hashes.safeSha256).toBe(SAFE_SHA);
    expect(hashes.paramsHash).toBe("7893ca3f0e30");
    expect(hashes.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(hashes.backtestIndexSha256).toBe(BACKTEST_INDEX_SHA);
    const runner = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobRunner.ts"),
      "utf8",
    );
    expect(runner).not.toMatch(/condition_builder_ledger_v0/);
    const identity = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/researchEvaluationIdentity.ts",
      ),
      "utf8",
    );
    expect(identity).toMatch(/research_evaluation_identity_v1/);
    expect(
      createHash("sha256")
        .update(fs.readFileSync("data/strategies/SAFE_v44_i4060.json"))
        .digest("hex"),
    ).toBe(SAFE_SHA);
  });

  it("leaves seenHashes as paramsHash uniqueness only", () => {
    const identity = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/researchEvaluationIdentity.ts",
      ),
      "utf8",
    );
    expect(identity).not.toMatch(/seenHashes\.add\(.*researchEvaluationHash/);
    const hashA = computeParamsHash(SAFE_PARAMS);
    const hashB = computeParamsHash(SAFE_PARAMS);
    expect(hashA).toBe(hashB);
    const evalA = stampResearchEvaluation(stampInput({ paramsHash: hashA }));
    const evalB = stampResearchEvaluation(
      stampInput({
        paramsHash: hashA,
        cost: { ...BASE_COST, feeRate: 0.01 },
      }),
    );
    expect(evalA.researchEvaluationHash).not.toBe(evalB.researchEvaluationHash);
  });
});
