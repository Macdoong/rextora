import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as backtestEngine from "../src/lib/rextora/backtest/backtestEngine";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import * as costStress from "../src/lib/rextora/strategySearch/costStress";
import {
  StrategySearchJitterError,
  calculateScoreDropRatio,
  createSeededRandom,
  evaluateCandidateAcrossWindows,
  evaluateCandidateJitter,
  generateJitterCandidate,
  validateJitterConfig,
  type StrategySearchBacktestCostConfig,
  type StrategySearchCandidate,
  type StrategySearchEvaluationWindowPlan,
  type StrategySearchJitterConfig,
  type StrategySearchParameterRange,
  type StrategySearchPassPolicy,
  type StrategySearchScoreResult,
  type StrategySearchScoreWeights,
} from "../src/lib/rextora/strategySearch";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);
const INTERVAL_MS = 15 * 60 * 1000;
const FROM = Date.UTC(2024, 0, 1);
const COUNT = 300;
const TO = FROM + (COUNT - 1) * INTERVAL_MS;
const JOB_ID = "search_11111111-2222-3333-4444-555555555555";

function candles() {
  return generateSyntheticCandles(COUNT, 100, 0.0003, {
    startOpenTime: FROM,
    intervalMs: INTERVAL_MS,
  });
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
    {
      key: "sl_atr_mult",
      min: 1.2,
      max: 2.4,
      step: 0.01,
      valueType: "float",
    },
  ];
}

function parentCandidate(): StrategySearchCandidate {
  const params = {
    ...CONTEXT_FALLBACK_PARAMS,
    ema_fast: 18,
    sl_atr_mult: 1.9,
  };
  return {
    candidateId: `${JOB_ID}_candidate_00000001`,
    jobId: JOB_ID,
    iteration: 1,
    generatorType: "random",
    parentCandidateIds: [],
    params,
    paramsHash: computeParamsHash(params),
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function windowPlan(): StrategySearchEvaluationWindowPlan {
  return {
    id: "full",
    label: "full",
    requestedFrom: FROM,
    requestedTo: TO,
    requiredForPass: true,
  };
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

function jitterConfig(
  overrides?: Partial<StrategySearchJitterConfig>,
): StrategySearchJitterConfig {
  return {
    enabled: true,
    sampleCount: 3,
    mutationScale: 0.35,
    seed: 42,
    minimumPassRate: 0,
    maximumScoreDropRatio: 100,
    parameterRanges: ranges(),
    ...overrides,
  };
}

async function baseBundle(parent: StrategySearchCandidate) {
  const evaluation = await evaluateCandidateAcrossWindows({
    candidate: parent,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: [windowPlan()],
    balance: 10_000,
    costConfig: cost(),
    preloadedCandlesByKey: { "BTCUSDT|full": candles() },
  });
  const { calculateCandidateScore } = await import(
    "../src/lib/rextora/strategySearch"
  );
  const baseScore = calculateCandidateScore({
    evaluation,
    weights: weights(),
  });
  return { evaluation, baseScore };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("strategySearch jitterEvaluator", () => {
  it("rejects invalid sample count and mutation scale; disabled yields no samples", async () => {
    expect(() =>
      validateJitterConfig(jitterConfig({ sampleCount: 0 })),
    ).toThrow(StrategySearchJitterError);
    expect(() =>
      validateJitterConfig(jitterConfig({ mutationScale: 0 })),
    ).toThrow(StrategySearchJitterError);
    expect(() =>
      validateJitterConfig(jitterConfig({ mutationScale: 1.1 })),
    ).toThrow(StrategySearchJitterError);

    const parent = parentCandidate();
    const { evaluation, baseScore } = await baseBundle(parent);
    const disabled = await evaluateCandidateJitter({
      parentCandidate: parent,
      baseEvaluation: evaluation,
      baseScore,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [windowPlan()],
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      config: jitterConfig({ enabled: false }),
      preloadedCandlesByKey: { "BTCUSDT|full": candles() },
    });
    expect(disabled.enabled).toBe(false);
    expect(disabled.samples).toHaveLength(0);
    expect(disabled.jitterPassed).toBe(true);
  });

  it("same seed reproduces hashes; different seed changes at least one", async () => {
    const parent = parentCandidate();
    const { evaluation, baseScore } = await baseBundle(parent);
    const c = candles();
    const common = {
      parentCandidate: parent,
      baseEvaluation: evaluation,
      baseScore,
      symbols: ["BTCUSDT"] as string[],
      timeframe: "15m",
      windows: [windowPlan()],
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      preloadedCandlesByKey: { "BTCUSDT|full": c },
    };
    const a = await evaluateCandidateJitter({
      ...common,
      config: jitterConfig({ seed: 7, sampleCount: 3 }),
    });
    const b = await evaluateCandidateJitter({
      ...common,
      config: jitterConfig({ seed: 7, sampleCount: 3 }),
    });
    const d = await evaluateCandidateJitter({
      ...common,
      config: jitterConfig({ seed: 99, sampleCount: 3 }),
    });
    expect(a.samples.map((s) => s.paramsHash)).toEqual(
      b.samples.map((s) => s.paramsHash),
    );
    expect(a.averageScore).toBe(b.averageScore);
    expect(a.samples.map((s) => s.paramsHash)).not.toEqual(
      d.samples.map((s) => s.paramsHash),
    );
  });

  it("generates exactly sampleCount unique samples within ranges; parent unchanged", async () => {
    const parent = parentCandidate();
    const parentSnap = structuredClone(parent);
    const { evaluation, baseScore } = await baseBundle(parent);
    const result = await evaluateCandidateJitter({
      parentCandidate: parent,
      baseEvaluation: evaluation,
      baseScore,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [windowPlan()],
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      config: jitterConfig({ sampleCount: 4, seed: 11 }),
      preloadedCandlesByKey: { "BTCUSDT|full": candles() },
    });
    expect(result.sampleCount).toBe(4);
    const hashes = new Set(result.samples.map((s) => s.paramsHash));
    expect(hashes.size).toBe(4);
    for (const sample of result.samples) {
      expect(sample.paramsHash).not.toBe("7893ca3f0e30");
      expect(sample.candidateId).not.toMatch(/SAFE_v44_i4060/i);
    }

    const random = createSeededRandom(11);
    const existing = new Set<string>([parent.paramsHash]);
    for (let i = 0; i < 4; i += 1) {
      const generated = generateJitterCandidate({
        parentCandidate: parent,
        config: jitterConfig({ sampleCount: 4, seed: 11 }),
        sampleIndex: i,
        random,
        existingHashes: existing,
        maxUniqueAttempts: 64,
      });
      existing.add(generated.paramsHash);
      const ema = generated.params.ema_fast as number;
      const sl = generated.params.sl_atr_mult as number;
      expect(ema).toBeGreaterThanOrEqual(12);
      expect(ema).toBeLessThanOrEqual(28);
      expect(sl).toBeGreaterThanOrEqual(1.2);
      expect(sl).toBeLessThanOrEqual(2.4);
    }
    expect(parent).toEqual(parentSnap);
  });

  it("throws on duplicate exhaustion", () => {
    const parent = parentCandidate();
    const degenerate: StrategySearchParameterRange[] = [
      {
        key: "ema_fast",
        min: 18,
        max: 18,
        step: 1,
        valueType: "integer",
      },
    ];
    const random = createSeededRandom(1);
    const existing = new Set<string>([parent.paramsHash]);
    // First generation will produce same ema_fast=18 → same hash as parent.
    expect(() =>
      generateJitterCandidate({
        parentCandidate: parent,
        config: jitterConfig({
          parameterRanges: degenerate,
          mutationScale: 0.5,
          sampleCount: 1,
        }),
        sampleIndex: 0,
        random,
        existingHashes: existing,
        maxUniqueAttempts: 3,
      }),
    ).toThrow(StrategySearchJitterError);

    try {
      generateJitterCandidate({
        parentCandidate: parent,
        config: jitterConfig({
          parameterRanges: degenerate,
          mutationScale: 0.5,
          sampleCount: 1,
        }),
        sampleIndex: 0,
        random: createSeededRandom(1),
        existingHashes: new Set([parent.paramsHash]),
        maxUniqueAttempts: 2,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(StrategySearchJitterError);
      expect((err as StrategySearchJitterError).code).toBe(
        "JITTER_DUPLICATE_EXHAUSTED",
      );
    }
  });

  it("calculates pass rate, average score, drop ratios, and thresholds", async () => {
    expect(calculateScoreDropRatio(0, 1)).toBe(0);
    expect(calculateScoreDropRatio(0, -1)).toBe(1);
    expect(calculateScoreDropRatio(10, 5)).toBe(0.5);

    const parent = parentCandidate();
    const { evaluation, baseScore } = await baseBundle(parent);
    const pass = await evaluateCandidateJitter({
      parentCandidate: parent,
      baseEvaluation: evaluation,
      baseScore,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [windowPlan()],
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      config: jitterConfig({
        sampleCount: 3,
        minimumPassRate: 0,
        maximumScoreDropRatio: 100,
      }),
      preloadedCandlesByKey: { "BTCUSDT|full": candles() },
    });
    expect(pass.passRate).toBe(
      pass.passedSampleCount / pass.sampleCount,
    );
    expect(pass.averageScore).toBe(
      pass.samples.reduce((s, x) => s + x.score.finalScore, 0) /
        pass.samples.length,
    );
    expect(pass.maximumObservedScoreDropRatio).toBe(
      Math.max(...pass.samples.map((s) => s.scoreDropRatio)),
    );
    expect(pass.jitterPassed).toBe(true);

    const fail = await evaluateCandidateJitter({
      parentCandidate: parent,
      baseEvaluation: evaluation,
      baseScore,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [windowPlan()],
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: {
        thresholds: { minTradeCount: 1_000_000 },
      },
      scoreWeights: weights(),
      config: jitterConfig({
        sampleCount: 2,
        minimumPassRate: 1,
        maximumScoreDropRatio: 0,
      }),
      preloadedCandlesByKey: { "BTCUSDT|full": candles() },
    });
    expect(fail.jitterPassed).toBe(false);
  });

  it("does not nest cost stress, uses candidate cost_guard_k, keeps SAFE intact", async () => {
    const stressSpy = vi.spyOn(costStress, "evaluateCostStress");
    const engineSpy = vi.spyOn(backtestEngine, "runSafeV44Backtest");
    const before = fs.readFileSync(SAFE_PATH);
    const parent = parentCandidate();
    const guard = parent.params.cost_guard_k as number;
    const { evaluation, baseScore } = await baseBundle(parent);

    // Fixture compiles without costGuardK on base cost config.
    type BaseKeys = keyof StrategySearchBacktestCostConfig;
    type HasLegacy = "costGuardK" extends BaseKeys ? true : false;
    const _noLegacy: HasLegacy = false;
    expect(_noLegacy).toBe(false);

    engineSpy.mockClear();
    await evaluateCandidateJitter({
      parentCandidate: parent,
      baseEvaluation: evaluation,
      baseScore,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [windowPlan()],
      balance: 10_000,
      baseCostConfig: cost(),
      passPolicy: loosePolicy(),
      scoreWeights: weights(),
      config: jitterConfig({ sampleCount: 2 }),
      preloadedCandlesByKey: { "BTCUSDT|full": candles() },
    });
    expect(stressSpy).not.toHaveBeenCalled();
    expect(engineSpy.mock.calls.length).toBeGreaterThan(0);
    for (const call of engineSpy.mock.calls) {
      expect(call[0].costGuardK).toBeUndefined();
      expect(call[0].params?.cost_guard_k).toBeDefined();
    }
    // Parent candidate ownership remains candidate.params.cost_guard_k.
    expect(parent.params.cost_guard_k).toBe(guard);
    const after = fs.readFileSync(SAFE_PATH);
    expect(Buffer.compare(before, after)).toBe(0);
    expect(
      (JSON.parse(after.toString("utf8")) as { params_hash: string })
        .params_hash,
    ).toBe("7893ca3f0e30");
    void null as unknown as StrategySearchScoreResult;
  });
});
