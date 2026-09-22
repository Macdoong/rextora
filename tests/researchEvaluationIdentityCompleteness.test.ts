import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import {
  calculateCandidateScore,
  evaluateCandidatePass,
  evaluateCostStress,
  type StrategySearchCandidate,
  type StrategySearchCandidateEvaluation,
  type StrategySearchCostStressScenario,
  type StrategySearchJitterConfig,
  type StrategySearchPassPolicy,
  type StrategySearchScoreWeights,
  type StrategySearchWindowEvaluation,
  type StrategySearchWindowMetrics,
} from "../src/lib/rextora/strategySearch";
import {
  ENGINE_COST_MODEL_SAFE,
  GROUP_PATTERN,
  GROUP_SAFE,
  GROUP_UNKNOWN_LEGACY,
  RESEARCH_EVALUATION_IDENTITY_VERSION,
  RESEARCH_EVALUATION_POLICY_VERSION,
  applyGroupChampA,
  buildResearchEvaluationIdentity,
  buildResearchEvaluationPolicy,
  computeResearchEvaluationHash,
  emptyBestByCompatibilityGroup,
  stampResearchEvaluation,
} from "../src/lib/rextora/strategySearch/researchEvaluationIdentity";

const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const BACKTEST_INDEX_SHA =
  "4140af487e4bd32aa0b2b34ea2f57069e7785689a268a437acfca5d886fda9ae";

const SAFE_PARAMS = {
  ...CONTEXT_FALLBACK_PARAMS,
  ema_fast: 12,
  sl_atr_mult: 1.5,
  cost_guard_k: 2,
};

const BASE_COST = {
  feeRate: 0.0004,
  slippageRate: 0.0002,
  fundingRate: 0.0001,
  applyFunding: true,
  applySpread: true,
  spreadRate: 0.00005,
};

const hashesBefore = productionReadonlyHashes();

const WINDOWS = [
  {
    id: "w1",
    fromOpenTime: 1_700_000_000_000,
    toOpenTime: 1_700_100_000_000,
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

const PASS_POLICY: StrategySearchPassPolicy = {
  thresholds: { minTradeCount: 10, minTotalReturn: 0 },
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

const STRESS_A: StrategySearchCostStressScenario = {
  id: "fee_x2",
  label: "fee x2",
  requiredForPass: true,
  feeMultiplier: 2,
  slippageMultiplier: 1,
  fundingMultiplier: 1,
  spreadMultiplier: 1,
  costGuardKMultiplier: 1,
};

function policy(overrides: {
  passPolicy?: StrategySearchPassPolicy;
  scoreWeights?: StrategySearchScoreWeights;
  costStressScenarios?: StrategySearchCostStressScenario[];
  jitterConfig?: StrategySearchJitterConfig;
} = {}) {
  return buildResearchEvaluationPolicy({
    passPolicy: overrides.passPolicy ?? PASS_POLICY,
    scoreWeights: overrides.scoreWeights ?? SCORE_WEIGHTS,
    costStressScenarios: overrides.costStressScenarios ?? [STRESS_A],
    jitterConfig: overrides.jitterConfig ?? DISABLED_JITTER,
  });
}

function identity(
  overrides: Partial<Parameters<typeof buildResearchEvaluationIdentity>[0]> = {},
) {
  return buildResearchEvaluationIdentity({
    paramsHash: computeParamsHash(SAFE_PARAMS),
    engineCostModel: ENGINE_COST_MODEL_SAFE,
    cost: BASE_COST,
    costGuardK: 2,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: WINDOWS,
    dataVersion: "binance-v1",
    evaluationBalance: 10_000,
    evaluationPolicy: policy(),
    ...overrides,
  });
}

function stamp(
  overrides: Partial<Parameters<typeof stampResearchEvaluation>[0]> = {},
) {
  return stampResearchEvaluation({
    params: SAFE_PARAMS,
    paramsHash: computeParamsHash(SAFE_PARAMS),
    cost: BASE_COST,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: WINDOWS,
    dataVersion: "binance-v1",
    evaluationBalance: 10_000,
    passPolicy: PASS_POLICY,
    scoreWeights: SCORE_WEIGHTS,
    costStressScenarios: [STRESS_A],
    jitterConfig: DISABLED_JITTER,
    ...overrides,
  });
}

/** Pre-A7.2.1 identity: same fields except evaluation policy / requiredForPass. */
function preFixHash(
  input: ReturnType<typeof identity>,
): string {
  const { evaluationPolicy: _policy, windows, ...rest } = input;
  const legacyWindows = windows.map(({ requiredForPass: _req, ...window }) => window);
  const legacy = { ...rest, windows: legacyWindows };
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(legacy).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    )
    .digest("hex");
}

function metrics(
  overrides?: Partial<StrategySearchWindowMetrics>,
): StrategySearchWindowMetrics {
  return {
    startingBalance: 10_000,
    endingBalance: 11_000,
    totalReturn: 0.1,
    mdd: -0.1,
    trades: 20,
    winRate: 0.55,
    profitFactor: 1.4,
    monthlyReturns: [
      { month: "2024-01", returnPct: 0.04, trades: 10, mdd: -0.05, fees: 0.01 },
    ],
    negativeMonths: 0,
    feeTotal: 0.02,
    slippageTotal: 0.01,
    ...overrides,
  };
}

function windowEval(
  requiredForPass = true,
  metricOverrides?: Partial<StrategySearchWindowMetrics>,
): StrategySearchWindowEvaluation {
  return {
    window: {
      id: "w1",
      label: "w1",
      requestedFrom: 1,
      requestedTo: 2,
      requiredForPass,
    },
    symbol: "BTCUSDT",
    timeframe: "15m",
    candidateId: "c1",
    paramsHash: "abc",
    metrics: metrics(metricOverrides),
    tradeCount: metricOverrides?.trades ?? 20,
    processedCandleCount: 100,
    firstProcessedOpenTime: 1,
    lastProcessedOpenTime: 2,
    durationMs: 1,
  };
}

function evaluation(
  windows: StrategySearchWindowEvaluation[],
): StrategySearchCandidateEvaluation {
  return {
    candidateId: "c1",
    paramsHash: "abc",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows,
    costConfig: BASE_COST,
    startedAt: "2024-01-01T00:00:00.000Z",
    completedAt: "2024-01-01T00:00:01.000Z",
    durationMs: 1,
  };
}

describe("P3-A7.2.1 evaluation identity completeness", () => {
  it("keeps a stable hash for the same complete context", () => {
    const a = computeResearchEvaluationHash(identity());
    const b = computeResearchEvaluationHash(identity());
    expect(identity().version).toBe(RESEARCH_EVALUATION_IDENTITY_VERSION);
    expect(identity().evaluationPolicy.version).toBe(
      RESEARCH_EVALUATION_POLICY_VERSION,
    );
    expect(a).toBe(b);
  });

  it("does not change paramsHash when evaluation policy changes", () => {
    const base = computeParamsHash(SAFE_PARAMS);
    expect(computeParamsHash(SAFE_PARAMS)).toBe(base);
    const hashA = stamp({
      passPolicy: { thresholds: { minTradeCount: 1 } },
    }).researchEvaluationHash;
    const hashB = stamp({
      passPolicy: { thresholds: { minTradeCount: 50 } },
    }).researchEvaluationHash;
    expect(hashA).not.toBe(hashB);
    expect(computeParamsHash(SAFE_PARAMS)).toBe(base);
  });

  it("closes proven same-hash / different-result collisions", () => {
    const ev = evaluation([windowEval(true)]);
    const passLoose = evaluateCandidatePass({
      evaluation: ev,
      policy: { thresholds: { minTradeCount: 1 } },
    });
    const passStrict = evaluateCandidatePass({
      evaluation: ev,
      policy: { thresholds: { minTradeCount: 50 } },
    });
    expect(passLoose.passed).toBe(true);
    expect(passStrict.passed).toBe(false);

    const scoreBase = calculateCandidateScore({
      evaluation: ev,
      weights: SCORE_WEIGHTS,
    });
    const scoreHeavy = calculateCandidateScore({
      evaluation: ev,
      weights: { ...SCORE_WEIGHTS, returnWeight: 8 },
    });
    expect(scoreBase.finalScore).not.toBe(scoreHeavy.finalScore);

    const identityLoose = identity({
      evaluationPolicy: policy({
        passPolicy: { thresholds: { minTradeCount: 1 } },
      }),
    });
    const identityStrict = identity({
      evaluationPolicy: policy({
        passPolicy: { thresholds: { minTradeCount: 50 } },
      }),
    });
    const identityScore = identity({
      evaluationPolicy: policy({
        scoreWeights: { ...SCORE_WEIGHTS, returnWeight: 8 },
      }),
    });
    const identityStress = identity({
      evaluationPolicy: policy({
        costStressScenarios: [{ ...STRESS_A, feeMultiplier: 8 }],
      }),
    });
    const identityJitter = identity({
      evaluationPolicy: policy({
        jitterConfig: {
          ...DISABLED_JITTER,
          enabled: true,
          sampleCount: 3,
          seed: 99,
          minimumPassRate: 0.8,
          parameterRanges: [
            { key: "ema_fast", min: 8, max: 20, step: 1, valueType: "integer" },
          ],
        },
      }),
    });

    expect(preFixHash(identityLoose)).toBe(preFixHash(identityStrict));
    expect(preFixHash(identityLoose)).toBe(preFixHash(identityScore));
    expect(preFixHash(identityLoose)).toBe(preFixHash(identityStress));
    expect(preFixHash(identityLoose)).toBe(preFixHash(identityJitter));

    expect(computeResearchEvaluationHash(identityLoose)).not.toBe(
      computeResearchEvaluationHash(identityStrict),
    );
    expect(computeResearchEvaluationHash(identityLoose)).not.toBe(
      computeResearchEvaluationHash(identityScore),
    );
    expect(computeResearchEvaluationHash(identityLoose)).not.toBe(
      computeResearchEvaluationHash(identityStress),
    );
    expect(computeResearchEvaluationHash(identityLoose)).not.toBe(
      computeResearchEvaluationHash(identityJitter),
    );
  });

  it("changes hash for fee, window, dataVersion, stress, jitter, pass, and score policy", () => {
    const base = computeResearchEvaluationHash(identity());
    expect(
      computeResearchEvaluationHash(
        identity({ cost: { ...BASE_COST, feeRate: 0.002 } }),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        identity({
          windows: [
            {
              id: "w1",
              fromOpenTime: 1,
              toOpenTime: 2,
              requiredForPass: true,
            },
          ],
        }),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(identity({ dataVersion: "v2" })),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        identity({
          evaluationPolicy: policy({
            costStressScenarios: [{ ...STRESS_A, fundingMultiplier: 4 }],
          }),
        }),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        identity({
          evaluationPolicy: policy({
            costStressScenarios: [{ ...STRESS_A, costGuardKMultiplier: 3 }],
          }),
        }),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        identity({
          evaluationPolicy: policy({
            jitterConfig: {
              ...DISABLED_JITTER,
              enabled: true,
              sampleCount: 2,
              seed: 7,
              parameterRanges: [
                {
                  key: "ema_fast",
                  min: 8,
                  max: 20,
                  step: 1,
                  valueType: "integer",
                },
              ],
            },
          }),
        }),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        identity({
          evaluationPolicy: policy({
            passPolicy: { thresholds: { maxMdd: -0.2 } },
          }),
        }),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        identity({
          evaluationPolicy: policy({
            scoreWeights: { ...SCORE_WEIGHTS, mddWeight: 9 },
          }),
        }),
      ),
    ).not.toBe(base);
    expect(
      computeResearchEvaluationHash(
        identity({
          windows: [{ ...WINDOWS[0]!, requiredForPass: false }],
        }),
      ),
    ).not.toBe(base);
  });

  it("does not hash outputs, iteration, jobId, or timestamps", () => {
    const hashed = computeResearchEvaluationHash(identity());
    const raw = JSON.stringify(identity());
    expect(raw).not.toMatch(/"finalScore"|"trial.score"|"finalPassed"/);
    expect(raw).not.toMatch(/candidateId|iteration|jobId|createdAt/);
    expect(
      computeResearchEvaluationHash({
        ...identity(),
        evaluationPolicy: {
          ...identity().evaluationPolicy,
        },
      }),
    ).toBe(hashed);
    expect(identity().evaluationPolicy.passPolicy.thresholds.minTradeCount).toBe(
      10,
    );
  });

  it("proves cost-stress requiredForPass and multipliers change pass/hash", async () => {
    const intervalMs = 15 * 60 * 1000;
    const from = Date.UTC(2024, 0, 1);
    const count = 160;
    const candles = generateSyntheticCandles(count, 100, 0.00025, {
      startOpenTime: from,
      intervalMs,
    });
    const candidate: StrategySearchCandidate = {
      candidateId: "search_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee_candidate_00000001",
      jobId: "search_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      iteration: 1,
      generatorType: "random",
      parentCandidateIds: [],
      params: SAFE_PARAMS,
      paramsHash: computeParamsHash(SAFE_PARAMS),
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const windows = [
      {
        id: "full",
        label: "full",
        requestedFrom: from,
        requestedTo: from + (count - 1) * intervalMs,
        requiredForPass: true,
      },
    ];
    const impossible: StrategySearchPassPolicy = {
      thresholds: { minTradeCount: 1_000_000 },
    };
    const required = await evaluateCostStress({
      candidate,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows,
      balance: 10_000,
      baseCostConfig: { ...BASE_COST, applyFunding: false },
      scenarios: [{ ...STRESS_A, requiredForPass: true }],
      passPolicy: impossible,
      scoreWeights: SCORE_WEIGHTS,
      preloadedCandlesByKey: { "BTCUSDT|full": candles },
    });
    const optional = await evaluateCostStress({
      candidate,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows,
      balance: 10_000,
      baseCostConfig: { ...BASE_COST, applyFunding: false },
      scenarios: [{ ...STRESS_A, requiredForPass: false }],
      passPolicy: impossible,
      scoreWeights: SCORE_WEIGHTS,
      preloadedCandlesByKey: { "BTCUSDT|full": candles },
    });
    const requiredPassed = required.every(
      (row) => !row.scenario.requiredForPass || row.passed,
    );
    const optionalPassed = optional.every(
      (row) => !row.scenario.requiredForPass || row.passed,
    );
    expect(required[0]?.passed).toBe(false);
    expect(requiredPassed).toBe(false);
    expect(optionalPassed).toBe(true);
    expect(required[0]?.costConfig.feeRate).toBe(BASE_COST.feeRate * 2);
    const hashRequired = computeResearchEvaluationHash(
      identity({
        evaluationPolicy: policy({
          costStressScenarios: [{ ...STRESS_A, requiredForPass: true }],
        }),
      }),
    );
    const hashOptional = computeResearchEvaluationHash(
      identity({
        evaluationPolicy: policy({
          costStressScenarios: [{ ...STRESS_A, requiredForPass: false }],
        }),
      }),
    );
    const hashFee = computeResearchEvaluationHash(
      identity({
        evaluationPolicy: policy({
          costStressScenarios: [{ ...STRESS_A, feeMultiplier: 9 }],
        }),
      }),
    );
    expect(hashRequired).not.toBe(hashOptional);
    expect(hashRequired).not.toBe(hashFee);
  });

  it("keeps score/pass/ranking arithmetic unchanged", () => {
    const ev = evaluation([windowEval(true)]);
    const pass = evaluateCandidatePass({
      evaluation: ev,
      policy: { thresholds: { minTradeCount: 10 } },
    });
    const score = calculateCandidateScore({
      evaluation: ev,
      weights: SCORE_WEIGHTS,
    });
    expect(pass.passed).toBe(true);
    expect(Number.isFinite(score.finalScore)).toBe(true);
    let groups = emptyBestByCompatibilityGroup();
    groups = applyGroupChampA(groups, GROUP_SAFE, {
      candidateId: "s",
      iteration: 1,
      paramsHash: "safe",
      score: 0.7,
      passed: true,
    });
    groups = applyGroupChampA(groups, GROUP_PATTERN, {
      candidateId: "p",
      iteration: 2,
      paramsHash: "pat",
      score: 0.9,
      passed: true,
    });
    groups = applyGroupChampA(groups, GROUP_UNKNOWN_LEGACY, {
      candidateId: "u",
      iteration: 3,
      paramsHash: "unk",
      score: 999,
      passed: true,
    });
    expect(groups[0]?.bestPassedCandidate?.paramsHash).toBe("safe");
    expect(
      groups.find((row) => row.rankingCompatibilityGroup === GROUP_PATTERN)
        ?.bestPassedCandidate?.paramsHash,
    ).toBe("pat");
    expect(groups.some((row) => row.bestScore === 999)).toBe(false);
  });

  it("does not modify computeParamsHash or production records", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/rextora/strategy/strategyHash.ts"),
      "utf8",
    );
    expect(src).toMatch(/export function computeParamsHash/);
    expect(src).toMatch(/digest\("hex"\)\.slice\(0, 12\)/);
    const hashes = productionReadonlyHashes();
    expect(hashes.safeSha256).toBeNull();
    expect(hashes.paramsHash).toBe("7893ca3f0e30");
    expect(hashes.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(hashes.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
  });
});
