import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as backtestEngine from "../src/lib/rextora/backtest/backtestEngine";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import {
  StrategySearchCostStressError,
  buildCostStressConfig,
  evaluateCostStress,
  validateCostStressScenarios,
  type StrategySearchBacktestCostConfig,
  type StrategySearchCandidate,
  type StrategySearchCostStressScenario,
  type StrategySearchEvaluationWindowPlan,
  type StrategySearchPassPolicy,
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
const COUNT = 320;
const TO = FROM + (COUNT - 1) * INTERVAL_MS;

function candles() {
  return generateSyntheticCandles(COUNT, 100, 0.00025, {
    startOpenTime: FROM,
    intervalMs: INTERVAL_MS,
  });
}

function candidate(): StrategySearchCandidate {
  const params = {
    ...CONTEXT_FALLBACK_PARAMS,
    ema_fast: CONTEXT_FALLBACK_PARAMS.ema_fast + 2,
  };
  return {
    candidateId: "search_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee_candidate_00000001",
    jobId: "search_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
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

function baseCost(): StrategySearchBacktestCostConfig {
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

function scoreWeights(): StrategySearchScoreWeights {
  return {
    returnWeight: 1,
    mddWeight: 0.5,
    profitFactorWeight: 0.5,
    winRateWeight: 0.5,
    tradeAdequacyWeight: 0.25,
    negativeMonthWeight: 0.25,
    consistencyWeight: 0.25,
  };
}

function scenario(
  overrides?: Partial<StrategySearchCostStressScenario>,
): StrategySearchCostStressScenario {
  return {
    id: "x1",
    label: "x1",
    requiredForPass: true,
    feeMultiplier: 1,
    slippageMultiplier: 1,
    fundingMultiplier: 1,
    spreadMultiplier: 1,
    costGuardKMultiplier: 1,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("strategySearch costStress", () => {
  it("validates scenarios and rejects duplicates / negative / zero costGuardK multipliers", () => {
    expect(() => validateCostStressScenarios([scenario()])).not.toThrow();
    expect(() =>
      validateCostStressScenarios([
        scenario({ id: "a" }),
        scenario({ id: "a" }),
      ]),
    ).toThrow(StrategySearchCostStressError);
    expect(() =>
      validateCostStressScenarios([scenario({ feeMultiplier: -1 })]),
    ).toThrow(/feeMultiplier/);
    expect(() =>
      validateCostStressScenarios([scenario({ costGuardKMultiplier: 0 })]),
    ).toThrow(/costGuardKMultiplier/);
    expect(() =>
      validateCostStressScenarios([scenario({ costGuardKMultiplier: -1 })]),
    ).toThrow(/costGuardKMultiplier/);
    expect(() =>
      validateCostStressScenarios([
        scenario({ costGuardKMultiplier: Number.NaN }),
      ]),
    ).toThrow(/costGuardKMultiplier/);
    expect(() =>
      validateCostStressScenarios([
        scenario({ costGuardKMultiplier: Number.POSITIVE_INFINITY }),
      ]),
    ).toThrow(/costGuardKMultiplier/);
  });

  it("builds stressed costs from candidate cost_guard_k without mutating base", () => {
    const base = baseCost();
    const snap = structuredClone(base);
    const candGuard = 3.0;
    const s1 = buildCostStressConfig(
      base,
      scenario({ id: "s1", feeMultiplier: 2, slippageMultiplier: 3 }),
      candGuard,
    );
    expect(base).toEqual(snap);
    expect(s1.feeRate).toBeCloseTo(0.0008);
    expect(s1.slippageRate).toBeCloseTo(0.0006);
    expect(s1.applyFunding).toBe(false);
    expect(s1.applySpread).toBe(true);
    expect(s1.costGuardKOverride).toBe(3.0);

    const s2 = buildCostStressConfig(
      base,
      scenario({ id: "s2", feeMultiplier: 4, costGuardKMultiplier: 2 }),
      candGuard,
    );
    expect(s2.feeRate).toBeCloseTo(0.0016);
    expect(s2.costGuardKOverride).toBe(6.0);
    expect(base.feeRate).toBe(0.0004);
  });

  it("preserves scenario order and reaches engine with multiplied costs", async () => {
    const spy = vi.spyOn(backtestEngine, "runSafeV44Backtest");
    const c = candles();
    const base = baseCost();
    const cand = candidate();
    const results = await evaluateCostStress({
      candidate: cand,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [windowPlan()],
      balance: 10_000,
      baseCostConfig: base,
      scenarios: [
        scenario({ id: "low", feeMultiplier: 1 }),
        scenario({ id: "high", feeMultiplier: 2, slippageMultiplier: 2 }),
      ],
      passPolicy: loosePolicy(),
      scoreWeights: scoreWeights(),
      preloadedCandlesByKey: { "BTCUSDT|full": c },
    });

    expect(results.map((r) => r.scenario.id)).toEqual(["low", "high"]);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    const fees = spy.mock.calls.map((call) => call[0].feeRate);
    expect(fees).toContain(0.0004);
    expect(fees).toContain(0.0008);
    expect(base.feeRate).toBe(0.0004);
  });

  it("uses candidate.params.cost_guard_k for stress overrides independently", async () => {
    const spy = vi.spyOn(backtestEngine, "runSafeV44Backtest");
    const cand = candidate();
    const guard = cand.params.cost_guard_k as number;
    const paramsSnap = structuredClone(cand.params);
    const hashSnap = cand.paramsHash;
    const base = baseCost();
    const baseSnap = structuredClone(base);

    const results = await evaluateCostStress({
      candidate: cand,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [windowPlan()],
      balance: 10_000,
      baseCostConfig: base,
      scenarios: [
        scenario({ id: "m1", costGuardKMultiplier: 1 }),
        scenario({ id: "m2", costGuardKMultiplier: 2 }),
      ],
      passPolicy: loosePolicy(),
      scoreWeights: scoreWeights(),
      preloadedCandlesByKey: { "BTCUSDT|full": candles() },
    });

    expect(results[0].costConfig.costGuardKOverride).toBe(guard * 1);
    expect(results[1].costConfig.costGuardKOverride).toBe(guard * 2);
    const engineGuards = spy.mock.calls.map((call) => call[0].costGuardK);
    expect(engineGuards).toContain(guard * 1);
    expect(engineGuards).toContain(guard * 2);
    // No cumulative multiply: second scenario is still 2x candidate, not 2x prior.
    expect(results[1].costConfig.costGuardKOverride).toBe(guard * 2);
    expect(cand.params).toEqual(paramsSnap);
    expect(cand.paramsHash).toBe(hashSnap);
    expect(base).toEqual(baseSnap);
    // Stress path owns override; base config type has no override/legacy fields.
    type BaseKeys = keyof StrategySearchBacktestCostConfig;
    type HasOverride = "costGuardKOverride" extends BaseKeys ? true : false;
    type HasLegacy = "costGuardK" extends BaseKeys ? true : false;
    const _noOverrideOnBase: HasOverride = false;
    const _noLegacyOnBase: HasLegacy = false;
    expect(_noOverrideOnBase).toBe(false);
    expect(_noLegacyOnBase).toBe(false);

    // Stress-only helper is module-private to costStress (not public index).
    const publicApi = await import("../src/lib/rextora/strategySearch");
    expect(
      "evaluateCandidateAcrossWindowsForStress" in publicApi,
    ).toBe(false);
    expect("StrategySearchStressRuntimeCostConfig" in publicApi).toBe(false);
  });

  it("identifies required vs optional stress failures", async () => {
    const c = candles();
    const results = await evaluateCostStress({
      candidate: candidate(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [windowPlan()],
      balance: 10_000,
      baseCostConfig: baseCost(),
      scenarios: [
        scenario({
          id: "req_hard",
          requiredForPass: true,
          feeMultiplier: 50,
          slippageMultiplier: 50,
        }),
        scenario({
          id: "opt_hard",
          requiredForPass: false,
          feeMultiplier: 50,
          slippageMultiplier: 50,
        }),
      ],
      passPolicy: {
        thresholds: {
          minTotalReturn: 10,
          minTradeCount: 1_000_000,
        },
      },
      scoreWeights: scoreWeights(),
      preloadedCandlesByKey: { "BTCUSDT|full": c },
    });

    const req = results.find((r) => r.scenario.id === "req_hard")!;
    const opt = results.find((r) => r.scenario.id === "opt_hard")!;
    expect(req.passed).toBe(false);
    expect(req.scenario.requiredForPass).toBe(true);
    expect(opt.passed).toBe(false);
    expect(opt.scenario.requiredForPass).toBe(false);
  });

  it("does not persist and keeps SAFE bytes identical", async () => {
    const before = fs.readFileSync(SAFE_PATH);
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    await evaluateCostStress({
      candidate: candidate(),
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      windows: [windowPlan()],
      balance: 10_000,
      baseCostConfig: baseCost(),
      scenarios: [scenario({ id: "only" })],
      passPolicy: loosePolicy(),
      scoreWeights: scoreWeights(),
      preloadedCandlesByKey: { "BTCUSDT|full": candles() },
    });
    const strategyWrites = writeSpy.mock.calls.filter((call) =>
      String(call[0]).includes(`${path.sep}strategies${path.sep}`),
    );
    expect(strategyWrites).toHaveLength(0);
    const after = fs.readFileSync(SAFE_PATH);
    expect(Buffer.compare(before, after)).toBe(0);
    expect(
      (JSON.parse(after.toString("utf8")) as { params_hash: string })
        .params_hash,
    ).toBe("7893ca3f0e30");
  });
});
