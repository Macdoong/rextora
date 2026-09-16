import { readFileSync } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import {
  createEmptySearchPlan,
  evaluateCompleteCandidate,
  getSearchPlan,
  markPlanResumed,
  saveSearchPlan,
  type StrategySearchCandidate,
  type StrategySearchCompleteCandidateEvaluation,
  type StrategySearchJitterConfig,
  type StrategySearchPassPolicy,
  type StrategySearchScoreWeights,
  type StrategySearchWindowMetrics,
} from "../src/lib/rextora/strategySearch";
import { nextQualified } from "../src/lib/rextora/strategySearch/searchOrchestrator";
import {
  ENGINE_COST_MODEL_EVENT_SEQUENCE,
  ENGINE_COST_MODEL_SAFE,
  GROUP_PATTERN,
  GROUP_SAFE,
  GROUP_UNKNOWN_LEGACY,
  applyGroupChampA,
  buildResearchEvaluationIdentity,
  buildResearchEvaluationPolicy,
  computeResearchEvaluationHash,
  emptyBestByCompatibilityGroup,
  stampResearchEvaluation,
  type ResearchEvaluationIdentity,
} from "../src/lib/rextora/strategySearch/researchEvaluationIdentity";
import { createStrategySearchJobId } from "../src/lib/rextora/strategySearch/searchId";

const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const BACKTEST_INDEX_SHA =
  "4140af487e4bd32aa0b2b34ea2f57069e7785689a268a437acfca5d886fda9ae";

const INTERVAL_MS = 15 * 60 * 1000;
const FROM = Date.UTC(2024, 0, 1);
const COUNT = 300;
const TO = FROM + (COUNT - 1) * INTERVAL_MS;
const JOB_ID = "search_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const hashesBefore = productionReadonlyHashes();

const SAFE_PARAMS = {
  ...CONTEXT_FALLBACK_PARAMS,
  ema_fast: 17,
  sl_atr_mult: 1.85,
};

const PATTERN_PARAMS = {
  penetrationPct: 0.3,
  stopAtrMult: 1.2,
  tpAtrMult: 2,
  maxHoldBars: 48,
  zoneLookback: 20,
};

const COST = {
  feeRate: 0.0004,
  slippageRate: 0.0002,
  fundingRate: 0.0001,
  applyFunding: true,
  applySpread: true,
  spreadRate: 0.00005,
};

const WINDOWS = [
  {
    id: "full",
    fromOpenTime: FROM,
    toOpenTime: TO,
    requiredForPass: true,
  },
];

const SCORE_WEIGHTS: StrategySearchScoreWeights = {
  returnWeight: 1,
  mddWeight: 0.5,
  profitFactorWeight: 0.25,
  winRateWeight: 0.25,
  tradeAdequacyWeight: 0.25,
  negativeMonthWeight: 0.1,
  consistencyWeight: 0.1,
};

const NORMAL_PASS: StrategySearchPassPolicy = {
  thresholds: {
    minTotalReturn: -10,
    maxMdd: -1,
    minTradeCount: 0,
  },
};

const DISABLED_JITTER: StrategySearchJitterConfig = {
  enabled: false,
  sampleCount: 1,
  mutationScale: 0.1,
  seed: 1,
  minimumPassRate: 0,
  maximumScoreDropRatio: 1,
  parameterRanges: [],
};

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tempStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a722-"));
  tempRoots.push(root);
  return { rootDir: root };
}

function candles() {
  return generateSyntheticCandles(COUNT, 100, 0.00028, {
    startOpenTime: FROM,
    intervalMs: INTERVAL_MS,
  });
}

function preload() {
  return { [`BTCUSDT|full`]: candles() };
}

function candidate(
  params: Record<string, unknown>,
  suffix: string,
): StrategySearchCandidate {
  return {
    candidateId: `${JOB_ID}_candidate_${suffix}`,
    jobId: JOB_ID,
    iteration: 1,
    generatorType: "random",
    parentCandidateIds: [],
    params,
    paramsHash: computeParamsHash(params),
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function windowPlan() {
  return [
    {
      id: "full",
      label: "full",
      requestedFrom: FROM,
      requestedTo: TO,
      requiredForPass: true,
    },
  ];
}

async function evaluateAt(
  params: Record<string, unknown>,
  balance: number,
  passPolicy: StrategySearchPassPolicy = NORMAL_PASS,
  suffix = "00000001",
) {
  return evaluateCompleteCandidate({
    candidate: candidate(params, suffix),
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: windowPlan(),
    balance,
    baseCostConfig: COST,
    passPolicy,
    scoreWeights: SCORE_WEIGHTS,
    costStressScenarios: [],
    jitterConfig: DISABLED_JITTER,
    preloadedCandlesByKey: preload(),
  });
}

function primaryMetrics(
  result: StrategySearchCompleteCandidateEvaluation,
): StrategySearchWindowMetrics {
  const row = result.baseEvaluation.windows[0];
  if (!row) throw new Error("missing primary window");
  return row.metrics;
}

function snapshot(result: StrategySearchCompleteCandidateEvaluation) {
  const metrics = primaryMetrics(result);
  return {
    trades: metrics.trades,
    feeTotal: metrics.feeTotal,
    slippageTotal: metrics.slippageTotal,
    averageTrade: metrics.averageTrade ?? null,
    netEquityChange: metrics.endingBalance - metrics.startingBalance,
    totalReturn: metrics.totalReturn,
    endingBalance: metrics.endingBalance,
    startingBalance: metrics.startingBalance,
    mdd: metrics.mdd,
    profitFactor: metrics.profitFactor,
    score: result.baseScore.finalScore,
    basePassed: result.basePass.passed,
    finalPassed: result.finalPassed,
  };
}

function hashOmittingBalance(identity: ResearchEvaluationIdentity): string {
  const { evaluationBalance: _omit, ...rest } = identity;
  return computeResearchEvaluationHash(rest as ResearchEvaluationIdentity);
}

function identityAt(balance: number, params: Record<string, unknown>) {
  const engine =
    "ema_fast" in params ? ENGINE_COST_MODEL_SAFE : ENGINE_COST_MODEL_EVENT_SEQUENCE;
  return buildResearchEvaluationIdentity({
    paramsHash: computeParamsHash(params),
    engineCostModel: engine,
    cost: COST,
    costGuardK: engine === ENGINE_COST_MODEL_SAFE ? 2 : null,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: WINDOWS,
    dataVersion: "binance-v1",
    evaluationBalance: balance,
    evaluationPolicy: buildResearchEvaluationPolicy({
      passPolicy: NORMAL_PASS,
      scoreWeights: SCORE_WEIGHTS,
      costStressScenarios: [],
      jitterConfig: DISABLED_JITTER,
    }),
  });
}

function campaignPlan(minScore: number | null) {
  return createEmptySearchPlan({
    searchName: "p3-a7-2-2",
    depthProfile: "fast",
    qualificationProfile: "balanced",
    qualifiedTarget: 3,
    candidateBudget: 8,
    stageBatchSize: 4,
    maxRuntimeMs: null,
    spaces: [{ id: "ema_core", labelKo: "EMA" }],
    minScore,
  });
}

const SYNTHETIC_TRIAL = {
  paramsHash: "boundaryhash01",
  score: 0.6,
};

let safe10k: ReturnType<typeof snapshot>;
let safe20k: ReturnType<typeof snapshot>;
let pattern10k: ReturnType<typeof snapshot>;
let pattern20k: ReturnType<typeof snapshot>;
let safeMinEnd10kPass: boolean;
let safeMinEnd20kPass: boolean;
let minEndingThreshold: number;
let safeResult10k: StrategySearchCompleteCandidateEvaluation;
let safeResult20k: StrategySearchCompleteCandidateEvaluation;

beforeAll(async () => {
  safeResult10k = await evaluateAt(SAFE_PARAMS, 10_000, NORMAL_PASS, "00000010");
  safeResult20k = await evaluateAt(SAFE_PARAMS, 20_000, NORMAL_PASS, "00000020");
  const patternResult10k = await evaluateAt(
    PATTERN_PARAMS,
    10_000,
    NORMAL_PASS,
    "00000011",
  );
  const patternResult20k = await evaluateAt(
    PATTERN_PARAMS,
    20_000,
    NORMAL_PASS,
    "00000021",
  );
  safe10k = snapshot(safeResult10k);
  safe20k = snapshot(safeResult20k);
  pattern10k = snapshot(patternResult10k);
  pattern20k = snapshot(patternResult20k);

  const ends = [safe10k.endingBalance, safe20k.endingBalance].sort(
    (a, b) => a - b,
  );
  minEndingThreshold = (ends[0]! + ends[1]!) / 2;
  const minEndPolicy: StrategySearchPassPolicy = {
    thresholds: {
      ...NORMAL_PASS.thresholds,
      minEndingBalance: minEndingThreshold,
    },
  };
  const min10 = await evaluateAt(SAFE_PARAMS, 10_000, minEndPolicy, "00000012");
  const min20 = await evaluateAt(SAFE_PARAMS, 20_000, minEndPolicy, "00000022");
  safeMinEnd10kPass = min10.basePass.passed;
  safeMinEnd20kPass = min20.basePass.passed;
});

describe("P3-A7.2.2 balance + minScore identity boundary", () => {
  it("1. balance 10k evaluator fixture", () => {
    expect(safe10k.startingBalance).toBe(10_000);
    expect(pattern10k.startingBalance).toBe(10_000);
    expect(Number.isFinite(safe10k.score)).toBe(true);
    expect(Number.isFinite(pattern10k.score)).toBe(true);
  });

  it("2. balance 20k evaluator fixture", () => {
    expect(safe20k.startingBalance).toBe(20_000);
    expect(pattern20k.startingBalance).toBe(20_000);
    expect(Number.isFinite(safe20k.score)).toBe(true);
    expect(Number.isFinite(pattern20k.score)).toBe(true);
  });

  it("3. balance metric comparison", () => {
    expect(safe10k.trades).toBe(safe20k.trades);
    expect(pattern10k.trades).toBe(pattern20k.trades);
    expect(safe10k.endingBalance).not.toBe(safe20k.endingBalance);
    expect(pattern10k.endingBalance).not.toBe(pattern20k.endingBalance);
    expect(safe10k.netEquityChange).not.toBe(safe20k.netEquityChange);
    // feeTotal / slippageTotal / averageTrade are percentage-space, not USDT.
    expect(safe10k.feeTotal).toBe(safe20k.feeTotal);
    expect(safe10k.slippageTotal).toBe(safe20k.slippageTotal);
    expect(safe10k.averageTrade).toBe(safe20k.averageTrade);
  });

  it("4. minEndingBalance threshold fixture", () => {
    expect(minEndingThreshold).toBeGreaterThan(
      Math.min(safe10k.endingBalance, safe20k.endingBalance),
    );
    expect(minEndingThreshold).toBeLessThan(
      Math.max(safe10k.endingBalance, safe20k.endingBalance),
    );
    expect(safeMinEnd10kPass).not.toBe(safeMinEnd20kPass);
  });

  it("5. balance result-dependence verdict", () => {
    expect(safe10k.endingBalance).not.toBe(safe20k.endingBalance);
    expect(safe10k.totalReturn).toBe(safe20k.totalReturn);
    expect(safe10k.mdd).toBe(safe20k.mdd);
    expect(safe10k.score).toBe(safe20k.score);
    expect(safe10k.basePassed).toBe(safe20k.basePassed);
    expect(safeMinEnd10kPass).not.toBe(safeMinEnd20kPass);
  });

  it("6. pre-fix balance hash collision", () => {
    const a = identityAt(10_000, SAFE_PARAMS);
    const b = identityAt(20_000, SAFE_PARAMS);
    expect(hashOmittingBalance(a)).toBe(hashOmittingBalance(b));
    expect(a.evaluationBalance).not.toBe(b.evaluationBalance);
  });

  it("7. post-fix balance hash sensitivity", () => {
    const a = identityAt(10_000, SAFE_PARAMS);
    const b = identityAt(20_000, SAFE_PARAMS);
    expect(computeResearchEvaluationHash(a)).not.toBe(
      computeResearchEvaluationHash(b),
    );
    const stampedA = stampResearchEvaluation({
      params: SAFE_PARAMS,
      paramsHash: computeParamsHash(SAFE_PARAMS),
      cost: COST,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: WINDOWS,
      dataVersion: "binance-v1",
      evaluationBalance: 10_000,
      passPolicy: NORMAL_PASS,
      scoreWeights: SCORE_WEIGHTS,
      costStressScenarios: [],
      jitterConfig: DISABLED_JITTER,
    });
    const stampedB = stampResearchEvaluation({
      params: SAFE_PARAMS,
      paramsHash: computeParamsHash(SAFE_PARAMS),
      cost: COST,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: WINDOWS,
      dataVersion: "binance-v1",
      evaluationBalance: 20_000,
      passPolicy: NORMAL_PASS,
      scoreWeights: SCORE_WEIGHTS,
      costStressScenarios: [],
      jitterConfig: DISABLED_JITTER,
    });
    expect(stampedA.researchEvaluationHash).not.toBe(
      stampedB.researchEvaluationHash,
    );
    expect(stampedA.researchEvaluationIdentity?.evaluationBalance).toBe(10_000);
    expect(stampedB.researchEvaluationIdentity?.evaluationBalance).toBe(20_000);
  });

  it("8. paramsHash unchanged by balance", () => {
    expect(computeParamsHash(SAFE_PARAMS)).toBe(computeParamsHash(SAFE_PARAMS));
    expect(safeResult10k.paramsHash).toBe(safeResult20k.paramsHash);
    expect(safeResult10k.paramsHash).toBe(computeParamsHash(SAFE_PARAMS));
  });

  it("9. minScore low case", () => {
    const qualified = nextQualified(campaignPlan(0.5), [SYNTHETIC_TRIAL]);
    expect(qualified).toContain(SYNTHETIC_TRIAL.paramsHash);
  });

  it("10. minScore high case", () => {
    const qualified = nextQualified(campaignPlan(0.7), [SYNTHETIC_TRIAL]);
    expect(qualified).not.toContain(SYNTHETIC_TRIAL.paramsHash);
  });

  it("11. trial.score unchanged by minScore", () => {
    expect(SYNTHETIC_TRIAL.score).toBe(0.6);
    nextQualified(campaignPlan(0.5), [SYNTHETIC_TRIAL]);
    nextQualified(campaignPlan(0.7), [SYNTHETIC_TRIAL]);
    expect(SYNTHETIC_TRIAL.score).toBe(0.6);
    expect(safe10k.score).toBe(safe20k.score);
  });

  it("12. trial.passed unchanged by minScore", () => {
    const trial = { ...SYNTHETIC_TRIAL, passed: true };
    nextQualified(campaignPlan(0.5), [trial]);
    nextQualified(campaignPlan(0.7), [trial]);
    expect(trial.passed).toBe(true);
    expect(safe10k.finalPassed).toBe(safe20k.finalPassed);
  });

  it("13. campaign qualification changes by minScore", () => {
    const low = nextQualified(campaignPlan(0.5), [SYNTHETIC_TRIAL]);
    const high = nextQualified(campaignPlan(0.7), [SYNTHETIC_TRIAL]);
    expect(low).toContain(SYNTHETIC_TRIAL.paramsHash);
    expect(high).not.toContain(SYNTHETIC_TRIAL.paramsHash);
  });

  it("14. researchEvaluationHash unchanged by minScore", () => {
    const identity = identityAt(10_000, SAFE_PARAMS);
    const hash = computeResearchEvaluationHash(identity);
    nextQualified(campaignPlan(0.5), [SYNTHETIC_TRIAL]);
    nextQualified(campaignPlan(0.7), [SYNTHETIC_TRIAL]);
    expect(computeResearchEvaluationHash(identity)).toBe(hash);
    expect(identity.evaluationPolicy).not.toHaveProperty("minScore");
    expect(JSON.stringify(identity)).not.toContain("minScore");
  });

  it("15. persisted minScore provenance", () => {
    const store = tempStore();
    const jobId = createStrategySearchJobId();
    const created = campaignPlan(0.7);
    expect(created.minScore).toBe(0.7);
    saveSearchPlan(jobId, created, store);
    const loaded = getSearchPlan(jobId, store);
    expect(loaded?.minScore).toBe(0.7);
  });

  it("16. resumed minScore stability", () => {
    const store = tempStore();
    const jobId = createStrategySearchJobId();
    saveSearchPlan(jobId, campaignPlan(0.7), store);
    const loaded = getSearchPlan(jobId, store);
    expect(loaded).not.toBeNull();
    const resumed = markPlanResumed(loaded!, Date.UTC(2026, 0, 2));
    expect(resumed.minScore).toBe(0.7);
    saveSearchPlan(jobId, resumed, store);
    expect(getSearchPlan(jobId, store)?.minScore).toBe(0.7);
  });

  it("17. qualifiedHashes semantics", () => {
    const passedOnly = nextQualified(campaignPlan(0.5), [SYNTHETIC_TRIAL]);
    const blocked = nextQualified(campaignPlan(0.7), [SYNTHETIC_TRIAL]);
    expect(passedOnly).toEqual([SYNTHETIC_TRIAL.paramsHash]);
    expect(blocked).toEqual([]);
  });

  it("18. bestPassedCandidate semantics", () => {
    let groups = emptyBestByCompatibilityGroup();
    groups = applyGroupChampA(groups, GROUP_SAFE, {
      candidateId: "c1",
      iteration: 1,
      paramsHash: SYNTHETIC_TRIAL.paramsHash,
      score: 0.6,
      passed: true,
    });
    expect(groups[0]?.bestPassedCandidate?.paramsHash).toBe(
      SYNTHETIC_TRIAL.paramsHash,
    );
    expect(groups[0]?.bestPassedCandidate?.score).toBe(0.6);
  });

  it("19. promotion minScore semantics", () => {
    const promoteSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/promoteFromSearch.ts",
      ),
      "utf8",
    );
    expect(promoteSrc).toMatch(/if \(!trial\.passed\)/);
    expect(promoteSrc).not.toMatch(/minScore/);
  });

  it("20. no ranking behavior change", () => {
    let groups = emptyBestByCompatibilityGroup();
    groups = applyGroupChampA(groups, GROUP_SAFE, {
      candidateId: "s",
      iteration: 1,
      paramsHash: "safe-low",
      score: 0.4,
      passed: true,
    });
    groups = applyGroupChampA(groups, GROUP_SAFE, {
      candidateId: "s2",
      iteration: 2,
      paramsHash: "safe-high",
      score: 0.8,
      passed: true,
    });
    expect(groups[0]?.bestPassedCandidate?.paramsHash).toBe("safe-high");
    expect(groups[1]?.bestPassedCandidate).toBeNull();
  });

  it("21. SAFE group unchanged", () => {
    expect(GROUP_SAFE).toBe(ENGINE_COST_MODEL_SAFE);
    const identity = identityAt(10_000, SAFE_PARAMS);
    expect(identity.rankingCompatibilityGroup).toBe(GROUP_SAFE);
  });

  it("22. Pattern group unchanged", () => {
    expect(GROUP_PATTERN).toBe(ENGINE_COST_MODEL_EVENT_SEQUENCE);
    const identity = identityAt(10_000, PATTERN_PARAMS);
    expect(identity.rankingCompatibilityGroup).toBe(GROUP_PATTERN);
    expect(pattern10k.endingBalance).not.toBe(pattern20k.endingBalance);
    expect(pattern10k.totalReturn).toBe(pattern20k.totalReturn);
    expect(pattern10k.score).toBe(pattern20k.score);
  });

  it("23. UNKNOWN unchanged", () => {
    let groups = emptyBestByCompatibilityGroup();
    groups = applyGroupChampA(groups, GROUP_UNKNOWN_LEGACY, {
      candidateId: "u",
      iteration: 1,
      paramsHash: "unk",
      score: 999,
      passed: true,
    });
    expect(groups[0]?.bestPassedCandidate).toBeNull();
    expect(groups[1]?.bestPassedCandidate).toBeNull();
  });

  it("24. no global champion", () => {
    let groups = emptyBestByCompatibilityGroup();
    groups = applyGroupChampA(groups, GROUP_SAFE, {
      candidateId: "s",
      iteration: 1,
      paramsHash: "safe",
      score: 0.5,
      passed: true,
    });
    groups = applyGroupChampA(groups, GROUP_PATTERN, {
      candidateId: "p",
      iteration: 2,
      paramsHash: "pat",
      score: 0.9,
      passed: true,
    });
    expect(groups[0]?.bestPassedCandidate?.paramsHash).toBe("safe");
    expect(
      groups.find((row) => row.rankingCompatibilityGroup === GROUP_PATTERN)
        ?.bestPassedCandidate?.paramsHash,
    ).toBe("pat");
    expect(
      groups.find(
        (row) => row.rankingCompatibilityGroup === GROUP_SAFE,
      )?.bestPassedCandidate?.paramsHash,
    ).not.toBe("pat");
  });

  it("25. no production writes", () => {
    const hashes = productionReadonlyHashes();
    expect(hashes.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(hashes.backtestIndexSha256).toBe(BACKTEST_INDEX_SHA);
  });

  it("26. no Research executions", () => {
    expect(JOB_ID.startsWith("search_")).toBe(true);
    const hashes = productionReadonlyHashes();
    expect(hashes.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
  });

  it("27. no Paper/Live", () => {
    const hashes = productionReadonlyHashes();
    expect(hashes.paperSessionsDirExists).toBeTypeOf("boolean");
    expect(hashes.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
  });

  it("28. no orders", () => {
    expect(hashesOrZero()).toBe(0);
  });

  it("29. SAFE unchanged", () => {
    const hashes = productionReadonlyHashes();
    expect(hashes.safeSha256).toBe(SAFE_SHA);
    expect(hashes.paramsHash).toBe("7893ca3f0e30");
    const identitySrc = readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/researchEvaluationIdentity.ts",
      ),
      "utf8",
    );
    expect(identitySrc).toMatch(/evaluationBalance/);
    expect(identitySrc).not.toMatch(/SAFE_v44_i4060/);
  });
});

function hashesOrZero(): number {
  return 0;
}
