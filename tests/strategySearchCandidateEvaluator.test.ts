import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as backtestEngine from "../src/lib/rextora/backtest/backtestEngine";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import * as strategyStore from "../src/lib/rextora/strategy/strategyStore";
import * as adapter from "../src/lib/rextora/strategySearch/backtestAdapter";
import * as costStress from "../src/lib/rextora/strategySearch/costStress";
import * as policy from "../src/lib/rextora/strategySearch/evaluationPolicy";
import * as jitter from "../src/lib/rextora/strategySearch/jitterEvaluator";
import {
  evaluateCompleteCandidate,
  type StrategySearchBacktestCostConfig,
  type StrategySearchCandidate,
  type StrategySearchCostStressScenario,
  type StrategySearchEvaluationWindowPlan,
  type StrategySearchJitterConfig,
  type StrategySearchParameterRange,
  type StrategySearchPassPolicy,
  type StrategySearchScoreWeights,
} from "../src/lib/rextora/strategySearch";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);
const STRATEGIES_DIR = path.join(process.cwd(), "data", "strategies");
const INTERVAL_MS = 15 * 60 * 1000;
const FROM = Date.UTC(2024, 0, 1);
const COUNT = 300;
const TO = FROM + (COUNT - 1) * INTERVAL_MS;
const JOB_ID = "search_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function candles() {
  return generateSyntheticCandles(COUNT, 100, 0.00028, {
    startOpenTime: FROM,
    intervalMs: INTERVAL_MS,
  });
}

function candidate(): StrategySearchCandidate {
  const params = {
    ...CONTEXT_FALLBACK_PARAMS,
    ema_fast: 17,
    sl_atr_mult: 1.85,
  };
  return {
    candidateId: `${JOB_ID}_candidate_00000002`,
    jobId: JOB_ID,
    iteration: 2,
    generatorType: "random",
    parentCandidateIds: [],
    params,
    paramsHash: computeParamsHash(params),
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function windows(): StrategySearchEvaluationWindowPlan[] {
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

function cost(): StrategySearchBacktestCostConfig {
  return {
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    applySpread: true,
    spreadRate: 0.0001,
  };
}

function loosePolicy(): StrategySearchPassPolicy {
  return {
    thresholds: {
      minTotalReturn: -10,
      maxMdd: -1,
      minTradeCount: 0,
    },
  };
}

function hardPolicy(): StrategySearchPassPolicy {
  return {
    thresholds: {
      minTradeCount: 1_000_000,
    },
  };
}

function weights(): StrategySearchScoreWeights {
  return {
    returnWeight: 1,
    mddWeight: 0.5,
    profitFactorWeight: 0.25,
    winRateWeight: 0.25,
    tradeAdequacyWeight: 0.25,
    negativeMonthWeight: 0.1,
    consistencyWeight: 0.1,
  };
}

function ranges(): StrategySearchParameterRange[] {
  return [
    {
      key: "ema_fast",
      min: 12,
      max: 28,
      step: 1,
      valueType: "integer",
    },
  ];
}

function jitterOff(): StrategySearchJitterConfig {
  return {
    enabled: false,
    sampleCount: 1,
    mutationScale: 0.2,
    seed: 1,
    minimumPassRate: 0,
    maximumScoreDropRatio: 1,
    parameterRanges: ranges(),
  };
}

function jitterOn(
  overrides?: Partial<StrategySearchJitterConfig>,
): StrategySearchJitterConfig {
  return {
    enabled: true,
    sampleCount: 2,
    mutationScale: 0.4,
    seed: 5,
    minimumPassRate: 0,
    maximumScoreDropRatio: 100,
    parameterRanges: ranges(),
    ...overrides,
  };
}

function stress(
  overrides?: Partial<StrategySearchCostStressScenario>,
): StrategySearchCostStressScenario {
  return {
    id: "s1",
    label: "s1",
    requiredForPass: true,
    feeMultiplier: 1,
    slippageMultiplier: 1,
    fundingMultiplier: 1,
    spreadMultiplier: 1,
    costGuardKMultiplier: 1,
    ...overrides,
  };
}

function preload() {
  return { "BTCUSDT|full": candles() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("strategySearch candidateEvaluator", () => {
  it("runs phases in order: base → pass → score → stress → jitter", async () => {
    const calls: string[] = [];
    const origAcross = adapter.evaluateCandidateAcrossWindows;
    vi.spyOn(adapter, "evaluateCandidateAcrossWindows").mockImplementation(
      async (input) => {
        calls.push("across");
        return origAcross(input);
      },
    );
    const origPass = policy.evaluateCandidatePass;
    vi.spyOn(policy, "evaluateCandidatePass").mockImplementation((input) => {
      calls.push("pass");
      return origPass(input);
    });
    const origScore = policy.calculateCandidateScore;
    vi.spyOn(policy, "calculateCandidateScore").mockImplementation((input) => {
      calls.push("score");
      return origScore(input);
    });
    const origStress = costStress.evaluateCostStress;
    vi.spyOn(costStress, "evaluateCostStress").mockImplementation(
      async (input) => {
        calls.push("stress");
        return origStress(input);
      },
    );
    const origJitter = jitter.evaluateCandidateJitter;
    vi.spyOn(jitter, "evaluateCandidateJitter").mockImplementation(
      async (input) => {
        calls.push("jitter");
        return origJitter(input);
      },
    );

    await evaluateCompleteCandidate({
      candidate: candidate(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: windows(),
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      costStressScenarios: [stress()],
      jitterConfig: jitterOn(),
      preloadedCandlesByKey: preload(),
    });

    // First occurrences must be base across → pass → score → stress → jitter.
    // Stress/jitter may call across/pass/score again afterward.
    const first = (name: string) => calls.indexOf(name);
    expect(first("across")).toBeGreaterThanOrEqual(0);
    expect(first("across")).toBeLessThan(first("pass"));
    expect(first("pass")).toBeLessThan(first("score"));
    expect(first("score")).toBeLessThan(first("stress"));
    expect(first("stress")).toBeLessThan(first("jitter"));
  });

  it("base failure causes finalPassed false", async () => {
    const result = await evaluateCompleteCandidate({
      candidate: candidate(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: windows(),
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: hardPolicy(),
      scoreWeights: weights(),
      costStressScenarios: [],
      jitterConfig: jitterOff(),
      preloadedCandlesByKey: preload(),
    });
    expect(result.basePass.passed).toBe(false);
    expect(result.finalPassed).toBe(false);
  });

  it("required cost stress failure fails final; optional does not alone", async () => {
    const requiredFail = await evaluateCompleteCandidate({
      candidate: candidate(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: windows(),
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      costStressScenarios: [
        stress({
          id: "req",
          requiredForPass: true,
          feeMultiplier: 1,
        }),
      ],
      jitterConfig: jitterOff(),
      preloadedCandlesByKey: preload(),
    });
    // Force required stress fail via hard policy on stress only by making base pass but stress impossible.
    const requiredHard = await evaluateCompleteCandidate({
      candidate: candidate(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: windows(),
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: {
        thresholds: { minTradeCount: 1_000_000 },
      },
      scoreWeights: weights(),
      costStressScenarios: [stress({ id: "req", requiredForPass: true })],
      jitterConfig: jitterOff(),
      preloadedCandlesByKey: preload(),
    });
    expect(requiredHard.basePass.passed).toBe(false);
    expect(requiredHard.costStressPassed).toBe(false);
    expect(requiredHard.finalPassed).toBe(false);

    // Optional stress fail with loose base: mock stress result optional fail, base pass.
    vi.spyOn(costStress, "evaluateCostStress").mockResolvedValue([
      {
        scenario: stress({ id: "opt", requiredForPass: false }),
        costConfig: {
          ...cost(),
          costGuardKOverride: 3,
        },
        evaluation: requiredFail.baseEvaluation,
        pass: {
          passed: false,
          requiredWindowCount: 1,
          passedRequiredWindowCount: 0,
          failedRequiredWindowCount: 1,
          issues: [],
        },
        score: requiredFail.baseScore,
        passed: false,
      },
    ]);
    vi.spyOn(adapter, "evaluateCandidateAcrossWindows").mockResolvedValue(
      requiredFail.baseEvaluation,
    );
    vi.spyOn(policy, "evaluateCandidatePass").mockReturnValue({
      passed: true,
      requiredWindowCount: 1,
      passedRequiredWindowCount: 1,
      failedRequiredWindowCount: 0,
      issues: [],
    });
    vi.spyOn(policy, "calculateCandidateScore").mockReturnValue(
      requiredFail.baseScore,
    );

    const optionalOnly = await evaluateCompleteCandidate({
      candidate: candidate(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: windows(),
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      costStressScenarios: [stress({ id: "opt", requiredForPass: false })],
      jitterConfig: jitterOff(),
      preloadedCandlesByKey: preload(),
    });
    expect(optionalOnly.costStressPassed).toBe(true);
    expect(optionalOnly.finalPassed).toBe(true);
  });

  it("enabled jitter failure can fail final; disabled jitter does not", async () => {
    const disabled = await evaluateCompleteCandidate({
      candidate: candidate(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: windows(),
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      costStressScenarios: [],
      jitterConfig: jitterOff(),
      preloadedCandlesByKey: preload(),
    });
    expect(disabled.jitterResult.enabled).toBe(false);
    expect(disabled.finalPassed).toBe(true);

    vi.spyOn(jitter, "evaluateCandidateJitter").mockResolvedValue({
      enabled: true,
      jitterPassed: false,
      sampleCount: 2,
      passedSampleCount: 0,
      failedSampleCount: 2,
      passRate: 0,
      averageScore: 0,
      minimumScore: 0,
      maximumScore: 0,
      averageScoreDropRatio: 1,
      maximumObservedScoreDropRatio: 1,
      baseScore: 1,
      samples: [],
    });

    const enabledFail = await evaluateCompleteCandidate({
      candidate: candidate(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: windows(),
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      costStressScenarios: [],
      jitterConfig: jitterOn({ minimumPassRate: 1 }),
      preloadedCandlesByKey: preload(),
    });
    expect(enabledFail.finalPassed).toBe(false);
  });

  it("all gates passing yields finalPassed true and deterministic decisions", async () => {
    const input = {
      candidate: candidate(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: windows(),
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      costStressScenarios: [stress({ id: "ok", requiredForPass: true })],
      jitterConfig: jitterOn({
        sampleCount: 2,
        seed: 3,
        minimumPassRate: 0,
        maximumScoreDropRatio: 100,
      }),
      preloadedCandlesByKey: preload(),
    };
    const a = await evaluateCompleteCandidate(input);
    const b = await evaluateCompleteCandidate(input);
    expect(a.finalPassed).toBe(true);
    expect(b.finalPassed).toBe(true);
    expect(a.baseScore.finalScore).toBe(b.baseScore.finalScore);
    expect(a.basePass).toEqual(b.basePass);
    expect(a.costStressPassed).toBe(b.costStressPassed);
    expect(a.jitterResult.samples.map((s) => s.paramsHash)).toEqual(
      b.jitterResult.samples.map((s) => s.paramsHash),
    );
    // Operational timestamps may differ.
    expect(a.startedAt).not.toBe("");
    expect(b.completedAt).not.toBe("");
  });

  it("zero required windows short-circuit before stress and jitter", async () => {
    const stressSpy = vi.spyOn(costStress, "evaluateCostStress");
    const jitterSpy = vi.spyOn(jitter, "evaluateCandidateJitter");
    const before = fs.readFileSync(SAFE_PATH);
    const cand = candidate();
    const candSnap = structuredClone(cand);
    const optionalOnly: StrategySearchEvaluationWindowPlan[] = [
      {
        id: "opt",
        label: "opt",
        requestedFrom: FROM,
        requestedTo: TO,
        requiredForPass: false,
      },
    ];
    const winSnap = structuredClone(optionalOnly);

    await expect(
      evaluateCompleteCandidate({
        candidate: cand,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        windows: optionalOnly,
        balance: 10_000,
        baseCostConfig: cost(),
        passPolicy: loosePolicy(),
        scoreWeights: weights(),
        costStressScenarios: [stress()],
        jitterConfig: jitterOn(),
        preloadedCandlesByKey: { "BTCUSDT|opt": candles() },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_PASS_POLICY",
      message: expect.stringMatching(/no required evaluation window exists/),
    });

    expect(stressSpy).not.toHaveBeenCalled();
    expect(jitterSpy).not.toHaveBeenCalled();
    expect(cand).toEqual(candSnap);
    expect(optionalOnly).toEqual(winSnap);
    expect(Buffer.compare(before, fs.readFileSync(SAFE_PATH))).toBe(0);
    expect(
      (JSON.parse(fs.readFileSync(SAFE_PATH, "utf8")) as { params_hash: string })
        .params_hash,
    ).toBe("7893ca3f0e30");
  });

  it("public complete path cannot inject a runtime cost_guard_k override", async () => {
    await expect(
      evaluateCompleteCandidate({
        candidate: candidate(),
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        windows: windows(),
        balance: 10_000,
        baseCostConfig: {
          ...cost(),
          ...({ costGuardKOverride: 9.9 } as object),
        } as StrategySearchBacktestCostConfig,
        passPolicy: loosePolicy(),
        scoreWeights: weights(),
        costStressScenarios: [],
        jitterConfig: jitterOff(),
        preloadedCandlesByKey: preload(),
      }),
    ).rejects.toThrow(/costGuardKOverride is not allowed/);

    type BaseKeys = keyof StrategySearchBacktestCostConfig;
    type HasLegacy = "costGuardK" extends BaseKeys ? true : false;
    type HasOverride = "costGuardKOverride" extends BaseKeys ? true : false;
    const _noLegacy: HasLegacy = false;
    const _noOverride: HasOverride = false;
    expect(_noLegacy).toBe(false);
    expect(_noOverride).toBe(false);
  });

  it("two candidates differing only in cost_guard_k reach the engine differently", async () => {
    const spy = vi.spyOn(backtestEngine, "runSafeV44Backtest");
    const baseParams = {
      ...CONTEXT_FALLBACK_PARAMS,
      ema_fast: 17,
      sl_atr_mult: 1.85,
    };
    const aParams = { ...baseParams, cost_guard_k: 2.25 };
    const bParams = { ...baseParams, cost_guard_k: 4.5 };
    const candA: StrategySearchCandidate = {
      candidateId: `${JOB_ID}_candidate_00000010`,
      jobId: JOB_ID,
      iteration: 10,
      generatorType: "random",
      parentCandidateIds: [],
      params: aParams,
      paramsHash: computeParamsHash(aParams),
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const candB: StrategySearchCandidate = {
      candidateId: `${JOB_ID}_candidate_00000011`,
      jobId: JOB_ID,
      iteration: 11,
      generatorType: "random",
      parentCandidateIds: [],
      params: bParams,
      paramsHash: computeParamsHash(bParams),
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    expect(candA.paramsHash).not.toBe(candB.paramsHash);

    const shared = {
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: windows(),
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      costStressScenarios: [] as StrategySearchCostStressScenario[],
      jitterConfig: jitterOff(),
      preloadedCandlesByKey: preload(),
    };

    await evaluateCompleteCandidate({ ...shared, candidate: candA });
    await evaluateCompleteCandidate({ ...shared, candidate: candB });

    const guards = spy.mock.calls.map((call) => ({
      engineCostGuardK: call[0].costGuardK,
      paramCostGuardK: call[0].params?.cost_guard_k,
    }));
    expect(guards.length).toBeGreaterThanOrEqual(2);
    // Base path omits engine costGuardK; candidate params carry ownership.
    expect(guards.every((g) => g.engineCostGuardK === undefined)).toBe(true);
    expect(guards.some((g) => g.paramCostGuardK === 2.25)).toBe(true);
    expect(guards.some((g) => g.paramCostGuardK === 4.5)).toBe(true);
  });

  it("does not mutate inputs, write files, or alter SAFE", async () => {
    const cand = candidate();
    const wins = windows();
    const pol = loosePolicy();
    const w = weights();
    const c = cost();
    const jc = jitterOff();
    const preloadMap = preload();
    const candSnap = structuredClone(cand);
    const winSnap = structuredClone(wins);
    const polSnap = structuredClone(pol);
    const wSnap = structuredClone(w);
    const cSnap = structuredClone(c);
    const jcSnap = structuredClone(jc);
    const candleSnap = structuredClone(preloadMap);
    const before = fs.readFileSync(SAFE_PATH);
    const beforeNames = new Set(fs.readdirSync(STRATEGIES_DIR));
    const saveSpy = vi.spyOn(strategyStore, "saveStrategy");
    const updateSpy = vi.spyOn(strategyStore, "updateStrategyLastBacktest");
    const writeSpy = vi.spyOn(fs, "writeFileSync");

    await evaluateCompleteCandidate({
      candidate: cand,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: wins,
      balance: 10_000,
      baseCostConfig: c,
      passPolicy: pol,
      scoreWeights: w,
      costStressScenarios: [],
      jitterConfig: jc,
      preloadedCandlesByKey: preloadMap,
    });

    expect(cand).toEqual(candSnap);
    expect(wins).toEqual(winSnap);
    expect(pol).toEqual(polSnap);
    expect(w).toEqual(wSnap);
    expect(c).toEqual(cSnap);
    expect(jc).toEqual(jcSnap);
    expect(preloadMap).toEqual(candleSnap);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(
      writeSpy.mock.calls.filter((call) =>
        String(call[0]).includes(`${path.sep}strategies${path.sep}`),
      ),
    ).toHaveLength(0);
    const after = fs.readFileSync(SAFE_PATH);
    expect(Buffer.compare(before, after)).toBe(0);
    expect(
      (JSON.parse(after.toString("utf8")) as { params_hash: string })
        .params_hash,
    ).toBe("7893ca3f0e30");
    expect(new Set(fs.readdirSync(STRATEGIES_DIR))).toEqual(beforeNames);
  });
});
