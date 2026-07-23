import { describe, expect, it } from "vitest";
import {
  StrategySearchEvaluationPolicyError,
  calculateCandidateScore,
  evaluateCandidatePass,
  validatePassPolicy,
  type StrategySearchCandidateEvaluation,
  type StrategySearchPassPolicy,
  type StrategySearchScoreWeights,
  type StrategySearchWindowEvaluation,
  type StrategySearchWindowMetrics,
} from "../src/lib/rextora/strategySearch";

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
      { month: "2024-02", returnPct: 0.06, trades: 10, mdd: -0.04, fees: 0.01 },
    ],
    negativeMonths: 0,
    feeTotal: 0.02,
    slippageTotal: 0.01,
    ...overrides,
  };
}

function windowEval(
  overrides: Partial<StrategySearchWindowEvaluation> & {
    windowId?: string;
    requiredForPass?: boolean;
    symbol?: string;
    metrics?: StrategySearchWindowMetrics;
  },
): StrategySearchWindowEvaluation {
  const id = overrides.windowId ?? "req";
  return {
    window: {
      id,
      label: id,
      requestedFrom: 1,
      requestedTo: 2,
      requiredForPass: overrides.requiredForPass ?? true,
    },
    symbol: overrides.symbol ?? "BTCUSDT",
    timeframe: "15m",
    candidateId: "search_x_candidate_00000001",
    paramsHash: "abcdef123456",
    metrics: overrides.metrics ?? metrics(),
    tradeCount: overrides.metrics?.trades ?? 20,
    processedCandleCount: 100,
    firstProcessedOpenTime: 1,
    lastProcessedOpenTime: 2,
    durationMs: 1,
    ...overrides,
  };
}

function evaluation(
  windows: StrategySearchWindowEvaluation[],
): StrategySearchCandidateEvaluation {
  return {
    candidateId: "search_x_candidate_00000001",
    paramsHash: "abcdef123456",
    symbols: [...new Set(windows.map((w) => w.symbol))],
    timeframe: "15m",
    windows,
    costConfig: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0.0001,
      applyFunding: false,
      applySpread: true,
      spreadRate: 0.0001,
    },
    startedAt: "2024-01-01T00:00:00.000Z",
    completedAt: "2024-01-01T00:00:01.000Z",
    durationMs: 1,
  };
}

function policy(
  thresholds: StrategySearchPassPolicy["thresholds"] = {},
): StrategySearchPassPolicy {
  return { thresholds };
}

function weights(
  overrides?: Partial<StrategySearchScoreWeights>,
): StrategySearchScoreWeights {
  return {
    returnWeight: 1,
    mddWeight: 1,
    profitFactorWeight: 1,
    winRateWeight: 1,
    tradeAdequacyWeight: 1,
    negativeMonthWeight: 1,
    consistencyWeight: 1,
    tradeAdequacyReference: 20,
    ...overrides,
  };
}

describe("strategySearch evaluationPolicy", () => {
  it("accepts a valid policy and rejects NaN/Infinity thresholds", () => {
    expect(() =>
      validatePassPolicy(policy({ minTotalReturn: 0, maxMdd: -0.3 })),
    ).not.toThrow();
    expect(() => validatePassPolicy(policy({ minWinRate: Number.NaN }))).toThrow(
      StrategySearchEvaluationPolicyError,
    );
    expect(() =>
      validatePassPolicy(policy({ minProfitFactor: Number.POSITIVE_INFINITY })),
    ).toThrow(StrategySearchEvaluationPolicyError);
  });

  it("passes when all required windows pass", () => {
    const result = evaluateCandidatePass({
      evaluation: evaluation([
        windowEval({ windowId: "a" }),
        windowEval({ windowId: "b", symbol: "ETHUSDT" }),
      ]),
      policy: policy({
        minTotalReturn: 0,
        maxMdd: -0.5,
        minTradeCount: 5,
        minWinRate: 0.5,
        minProfitFactor: 1,
        maxNegativeMonths: 2,
        minEndingBalance: 10_000,
      }),
    });
    expect(result.passed).toBe(true);
    expect(result.requiredWindowCount).toBe(2);
    expect(result.passedRequiredWindowCount).toBe(2);
    expect(result.failedRequiredWindowCount).toBe(0);
  });

  it("fails when one required window fails", () => {
    const result = evaluateCandidatePass({
      evaluation: evaluation([
        windowEval({ windowId: "ok" }),
        windowEval({
          windowId: "bad",
          metrics: metrics({ totalReturn: -0.2 }),
        }),
      ]),
      policy: policy({ minTotalReturn: 0 }),
    });
    expect(result.passed).toBe(false);
    expect(result.failedRequiredWindowCount).toBe(1);
    expect(result.issues[0]?.windowId).toBe("bad");
    expect(result.issues[0]?.metric).toBe("totalReturn");
  });

  it("does not fail final PASS when only an optional window fails", () => {
    const result = evaluateCandidatePass({
      evaluation: evaluation([
        windowEval({ windowId: "req", requiredForPass: true }),
        windowEval({
          windowId: "opt",
          requiredForPass: false,
          metrics: metrics({ totalReturn: -0.9, trades: 0 }),
        }),
      ]),
      policy: policy({ minTotalReturn: 0, minTradeCount: 10 }),
    });
    expect(result.passed).toBe(true);
    expect(result.requiredWindowCount).toBe(1);
  });

  it("fails explicitly when a required metric is missing", () => {
    const broken = windowEval({});
    // Force a missing metric without TypeScript help.
    (broken.metrics as { totalReturn?: number }).totalReturn = undefined;
    expect(() =>
      evaluateCandidatePass({
        evaluation: evaluation([broken]),
        policy: policy({ minTotalReturn: 0 }),
      }),
    ).toThrowError(/missing required metric: totalReturn/);
  });

  it("handles verified negative MDD engine convention", () => {
    const pass = evaluateCandidatePass({
      evaluation: evaluation([
        windowEval({ metrics: metrics({ mdd: -0.2 }) }),
      ]),
      policy: policy({ maxMdd: -0.25 }),
    });
    expect(pass.passed).toBe(true);

    const fail = evaluateCandidatePass({
      evaluation: evaluation([
        windowEval({ metrics: metrics({ mdd: -0.4 }) }),
      ]),
      policy: policy({ maxMdd: -0.25 }),
    });
    expect(fail.passed).toBe(false);
    expect(fail.issues[0]?.code).toBe("MAX_MDD");
  });

  it("enforces trade, profit factor, negative months, and monthly return rules", () => {
    expect(
      evaluateCandidatePass({
        evaluation: evaluation([
          windowEval({ metrics: metrics({ trades: 2 }) }),
        ]),
        policy: policy({ minTradeCount: 5 }),
      }).passed,
    ).toBe(false);

    expect(
      evaluateCandidatePass({
        evaluation: evaluation([
          windowEval({ metrics: metrics({ profitFactor: 0.8 }) }),
        ]),
        policy: policy({ minProfitFactor: 1.1 }),
      }).passed,
    ).toBe(false);

    expect(
      evaluateCandidatePass({
        evaluation: evaluation([
          windowEval({ metrics: metrics({ negativeMonths: 4 }) }),
        ]),
        policy: policy({ maxNegativeMonths: 2 }),
      }).passed,
    ).toBe(false);

    expect(
      evaluateCandidatePass({
        evaluation: evaluation([
          windowEval({
            metrics: metrics({
              monthlyReturns: [
                {
                  month: "2024-01",
                  returnPct: -0.05,
                  trades: 1,
                  mdd: -0.01,
                  fees: 0,
                },
              ],
            }),
          }),
        ]),
        policy: policy({ minMonthlyReturn: 0 }),
      }).passed,
    ).toBe(false);
  });

  it("produces identical scores for identical inputs", () => {
    const evalInput = evaluation([
      windowEval({ windowId: "a", metrics: metrics({ totalReturn: 0.12 }) }),
      windowEval({
        windowId: "b",
        symbol: "ETHUSDT",
        metrics: metrics({ totalReturn: 0.08, mdd: -0.15 }),
      }),
    ]);
    const w = weights();
    const a = calculateCandidateScore({ evaluation: evalInput, weights: w });
    const b = calculateCandidateScore({ evaluation: evalInput, weights: w });
    expect(a).toEqual(b);
  });

  it("improves return component when return increases", () => {
    const low = calculateCandidateScore({
      evaluation: evaluation([
        windowEval({ metrics: metrics({ totalReturn: 0.05 }) }),
      ]),
      weights: weights({
        mddWeight: 0,
        profitFactorWeight: 0,
        winRateWeight: 0,
        tradeAdequacyWeight: 0,
        negativeMonthWeight: 0,
        consistencyWeight: 0,
      }),
    });
    const high = calculateCandidateScore({
      evaluation: evaluation([
        windowEval({ metrics: metrics({ totalReturn: 0.2 }) }),
      ]),
      weights: weights({
        mddWeight: 0,
        profitFactorWeight: 0,
        winRateWeight: 0,
        tradeAdequacyWeight: 0,
        negativeMonthWeight: 0,
        consistencyWeight: 0,
      }),
    });
    expect(high.breakdown.returnReward).toBeGreaterThan(
      low.breakdown.returnReward,
    );
    expect(high.finalScore).toBeGreaterThan(low.finalScore);
  });

  it("increases MDD and negative-month penalties when worse", () => {
    const mild = calculateCandidateScore({
      evaluation: evaluation([
        windowEval({ metrics: metrics({ mdd: -0.05, negativeMonths: 0 }) }),
      ]),
      weights: weights({
        returnWeight: 0,
        profitFactorWeight: 0,
        winRateWeight: 0,
        tradeAdequacyWeight: 0,
        consistencyWeight: 0,
      }),
    });
    const severe = calculateCandidateScore({
      evaluation: evaluation([
        windowEval({ metrics: metrics({ mdd: -0.4, negativeMonths: 6 }) }),
      ]),
      weights: weights({
        returnWeight: 0,
        profitFactorWeight: 0,
        winRateWeight: 0,
        tradeAdequacyWeight: 0,
        consistencyWeight: 0,
      }),
    });
    expect(severe.breakdown.mddPenalty).toBeGreaterThan(
      mild.breakdown.mddPenalty,
    );
    expect(severe.breakdown.negativeMonthPenalty).toBeGreaterThan(
      mild.breakdown.negativeMonthPenalty,
    );
    expect(severe.finalScore).toBeLessThan(mild.finalScore);
  });

  it("worsens consistency when required-window dispersion rises; ignores optional", () => {
    const tight = calculateCandidateScore({
      evaluation: evaluation([
        windowEval({
          windowId: "a",
          metrics: metrics({ totalReturn: 0.1 }),
        }),
        windowEval({
          windowId: "b",
          metrics: metrics({ totalReturn: 0.11 }),
        }),
      ]),
      weights: weights({
        returnWeight: 0,
        mddWeight: 0,
        profitFactorWeight: 0,
        winRateWeight: 0,
        tradeAdequacyWeight: 0,
        negativeMonthWeight: 0,
        consistencyWeight: 1,
      }),
    });
    const wide = calculateCandidateScore({
      evaluation: evaluation([
        windowEval({
          windowId: "a",
          metrics: metrics({ totalReturn: 0.0 }),
        }),
        windowEval({
          windowId: "b",
          metrics: metrics({ totalReturn: 0.4 }),
        }),
      ]),
      weights: weights({
        returnWeight: 0,
        mddWeight: 0,
        profitFactorWeight: 0,
        winRateWeight: 0,
        tradeAdequacyWeight: 0,
        negativeMonthWeight: 0,
        consistencyWeight: 1,
      }),
    });
    expect(wide.breakdown.consistency).toBeGreaterThan(
      tight.breakdown.consistency,
    );

    const withOptional = calculateCandidateScore({
      evaluation: evaluation([
        windowEval({
          windowId: "a",
          metrics: metrics({ totalReturn: 0.1 }),
        }),
        windowEval({
          windowId: "b",
          metrics: metrics({ totalReturn: 0.11 }),
        }),
        windowEval({
          windowId: "opt",
          requiredForPass: false,
          metrics: metrics({ totalReturn: 5 }),
        }),
      ]),
      weights: weights({
        returnWeight: 0,
        mddWeight: 0,
        profitFactorWeight: 0,
        winRateWeight: 0,
        tradeAdequacyWeight: 0,
        negativeMonthWeight: 0,
        consistencyWeight: 1,
      }),
    });
    expect(withOptional.breakdown.consistency).toBe(tight.breakdown.consistency);
  });

  it("rejects zero required windows for PASS and score (INVALID_PASS_POLICY)", () => {
    const onlyOptional = evaluation([
      windowEval({
        windowId: "opt",
        requiredForPass: false,
        metrics: metrics({ totalReturn: 0.5 }),
      }),
    ]);
    const emptyRequired = evaluation([]);
    const pol = policy({ minTotalReturn: 0 });
    const polSnap = structuredClone(pol);
    const evalSnap = structuredClone(onlyOptional);
    const w = weights();

    expect(() =>
      evaluateCandidatePass({ evaluation: onlyOptional, policy: pol }),
    ).toThrowError(/no required evaluation window exists/);
    expect(() =>
      evaluateCandidatePass({ evaluation: emptyRequired, policy: pol }),
    ).toThrow(StrategySearchEvaluationPolicyError);

    try {
      evaluateCandidatePass({ evaluation: onlyOptional, policy: pol });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(StrategySearchEvaluationPolicyError);
      expect((err as StrategySearchEvaluationPolicyError).code).toBe(
        "INVALID_PASS_POLICY",
      );
    }

    expect(() =>
      calculateCandidateScore({ evaluation: onlyOptional, weights: w }),
    ).toThrowError(/no required evaluation window exists/);
    expect(() =>
      calculateCandidateScore({ evaluation: emptyRequired, weights: w }),
    ).toThrow(StrategySearchEvaluationPolicyError);

    // Deterministic: same failure twice
    const failTwice = () => {
      try {
        evaluateCandidatePass({ evaluation: onlyOptional, policy: pol });
        return null;
      } catch (e) {
        return (e as StrategySearchEvaluationPolicyError).message;
      }
    };
    expect(failTwice()).toBe(failTwice());

    expect(pol).toEqual(polSnap);
    expect(onlyOptional).toEqual(evalSnap);

    // One required window still allows normal PASS
    const ok = evaluateCandidatePass({
      evaluation: evaluation([
        windowEval({ windowId: "req", requiredForPass: true }),
      ]),
      policy: pol,
    });
    expect(ok.passed).toBe(true);
    expect(ok.requiredWindowCount).toBe(1);
  });

  it("handles zero denominators safely and does not mutate inputs", () => {
    const evalInput = evaluation([
      windowEval({ metrics: metrics({ trades: 0 }) }),
    ]);
    const w = weights({ tradeAdequacyReference: 20 });
    const snapEval = structuredClone(evalInput);
    const snapW = structuredClone(w);
    const score = calculateCandidateScore({ evaluation: evalInput, weights: w });
    expect(Number.isFinite(score.finalScore)).toBe(true);
    expect(evalInput).toEqual(snapEval);
    expect(w).toEqual(snapW);

    const pol = policy({ minTotalReturn: 0 });
    const snapPol = structuredClone(pol);
    evaluateCandidatePass({ evaluation: evalInput, policy: pol });
    expect(pol).toEqual(snapPol);
  });
});
