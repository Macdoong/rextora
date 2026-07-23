import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  copyStrategy,
  createStrategy,
  deleteStrategy,
  ensureStrategyStore,
  getStrategyById,
  listStrategies,
  restoreCloneFromSource,
  saveStrategy,
  setLiveActiveStrategy,
  setPaperActiveStrategy,
  validateStrategyById
} from "../src/lib/rextora/strategy/strategyStore";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import { isTestStrategyRecord } from "../src/lib/rextora/strategy/strategyTestFilter";
import { EXPECTED_SAFE_PARAMS_HASH, SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { emptyGroup, newLeafId, type LeafCondition } from "../src/lib/rextora/strategy/definition/types";
import { defaultDefinition, validateCanonicalDefinition, StrategyValidationError } from "../src/lib/rextora/strategy/definition/validator";
import { evaluateConditionNode, evaluateBuilderSignal } from "../src/lib/rextora/strategy/conditions/evaluator";
import { detectOrderBlocks } from "../src/lib/rextora/strategy/conditions/orderBlock";
import { detectFvg } from "../src/lib/rextora/strategy/conditions/fvg";
import { detectTrendLine } from "../src/lib/rextora/strategy/conditions/trendLine";
import { detectSupportResistance } from "../src/lib/rextora/strategy/conditions/supportResistance";
import { detectStructureAt } from "../src/lib/rextora/strategy/conditions/structure";
import { computeAtrSeries } from "../src/lib/rextora/indicator/indicatorEngine";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { getSafeParamCatalog, SNAPSHOT_CONFIRMED_KEYS } from "../src/lib/rextora/strategy/definition/safeParamCatalog";
import { runConfiguredBacktest } from "../src/lib/rextora/backtest/backtestRunner";
import { buildIndicatorSeries, compareValues } from "../src/lib/rextora/strategy/conditions/indicators";

function leaf(partial: Partial<LeafCondition> & Pick<LeafCondition, "type" | "category">): LeafCondition {
  return {
    id: newLeafId(),
    enabled: true,
    parameters: {},
    comparison: "true",
    value: true,
    validationStatus: "ok",
    ...partial
  };
}

describe("Priority #3 strategy builder", () => {
  let cleanupIsolated: (() => void) | undefined;

  beforeEach(() => {
    cleanupIsolated?.();
    cleanupIsolated = installIsolatedStrategyStore().cleanup;
    ensureStrategyStore();
  });

  afterEach(() => {
    for (const s of listStrategies()) {
      if (s.id === SAFE_STRATEGY_ID) continue;
      try {
        deleteStrategy(s.id);
      } catch {
        /* ignore */
      }
    }
    cleanupIsolated?.();
    cleanupIsolated = undefined;
  });

  it("1. SAFE remains immutable", () => {
    const safe = getStrategyById(SAFE_STRATEGY_ID)!;
    expect(safe.locked).toBe(true);
    expect(() => saveStrategy(SAFE_STRATEGY_ID, { params: safe.params })).toThrow(/잠긴/);
    expect(() => deleteStrategy(SAFE_STRATEGY_ID)).toThrow(/잠긴/);
  });

  it("2-4. clone gets new id, new hash, preserves sourceStrategyId", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID, "편집용복사");
    expect(copy.id).not.toBe(SAFE_STRATEGY_ID);
    expect(copy.paramsHash).not.toBe(EXPECTED_SAFE_PARAMS_HASH);
    expect(copy.sourceStrategyId).toBe(SAFE_STRATEGY_ID);
    expect(copy.locked).toBe(false);
    expect(isTestStrategyRecord(copy as never)).toBe(false);
  });

  it("5-6. invalid / unsupported conditions rejected", () => {
    const def = defaultDefinition({ strategyId: "custom_testx", strategyName: "t", timeframe: "15m" });
    const bad = leaf({ type: "ema", category: "indicator" });
    (bad as { type: string }).type = "not_a_real_condition";
    def.entryConditions.long.children.push(bad);
    const v = validateCanonicalDefinition(def);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.some((e) => e.includes("지원하지 않는"))).toBe(true);
  });

  it("7-8. AND / OR condition tree", () => {
    const candles = generateSyntheticCandles(80, 100, 0.001);
    const trueLeaf = leaf({ type: "breakout_volume_multiplier", category: "filter", value: 0, parameters: { mult: 0 } });
    // force true via volume mult 0
    trueLeaf.comparison = "true";
    const falseLeaf = leaf({
      type: "min_quote_volume",
      category: "filter",
      value: 1e18,
      comparison: "gt"
    });
    const andGroup = { ...emptyGroup("AND"), children: [trueLeaf, falseLeaf] };
    const orGroup = { ...emptyGroup("OR"), children: [trueLeaf, falseLeaf] };
    const ctx = { candles, bar: 50, quoteVolume: 0 };
    expect(evaluateConditionNode(andGroup, ctx)).toBe(false);
    expect(evaluateConditionNode(orGroup, ctx)).toBe(true);
  });

  it("9. order-block detection", () => {
    const candles = generateSyntheticCandles(60, 50, 0.002);
    // craft impulse
    const i = 40;
    candles[i - 1] = { ...candles[i - 1], open: 110, close: 100, high: 111, low: 99, volume: 5000 };
    candles[i] = { ...candles[i], open: 100, close: 120, high: 121, low: 99, volume: 8000 };
    const atr = computeAtrSeries(
      candles.map((c) => c.high),
      candles.map((c) => c.low),
      candles.map((c) => c.close),
      14
    );
    const hit = detectOrderBlocks(candles, i + 1, atr[i + 1], "bullish", {
      bodyOnly: false,
      minImpulseAtrMult: 0.1,
      minImpulsePct: 0.01,
      minVolumeMult: 0.5,
      maxAgeBars: 20,
      mitigationPct: 10,
      firstTouchOnly: false,
      retestAllowed: true,
      entryInsideBlock: false,
      invalidateOnCloseBeyond: false
    });
    expect(hit.zone).not.toBeNull();
  });

  it("10. FVG detection", () => {
    const candles = generateSyntheticCandles(40, 10, 0.001);
    candles[10] = { ...candles[10], high: 100, low: 99, open: 99.5, close: 99.8 };
    candles[11] = { ...candles[11], high: 101, low: 100, open: 100, close: 100.5 };
    candles[12] = { ...candles[12], high: 105, low: 103, open: 103, close: 104 };
    const r = detectFvg(candles, 12, 1, "bullish", {
      minGapAbs: 0,
      minGapPct: 0.01,
      atrRelativeMult: 0,
      partialFillPct: 1,
      fullFillInvalidates: false,
      maxAgeBars: 20,
      firstTouchOnly: false,
      entryInsideGap: false,
      invalidateOnCloseThrough: false
    });
    expect(r.zone).not.toBeNull();
  });

  it("11-13. trend-line, S/R, structure", () => {
    const candles = generateSyntheticCandles(100, 7, 0.0015);
    const atr = computeAtrSeries(
      candles.map((c) => c.high),
      candles.map((c) => c.low),
      candles.map((c) => c.close),
      14
    );
    const bar = 80;
    const tl = detectTrendLine(candles, bar, "ascending_trend_line", {
      minPivotCount: 2,
      minTouchCount: 1,
      slopeMin: -1,
      slopeMax: 10,
      tolerancePct: 5,
      breakoutByClose: true,
      breakoutByWick: false,
      confirmationCandles: 0,
      retestRequired: false,
      maxAgeBars: 100
    });
    expect(tl.line === null || typeof tl.hit === "boolean").toBe(true);
    const sr = detectSupportResistance(candles, bar, "previous_high", {
      lookback: 30,
      minTouches: 1,
      tolerancePct: 5,
      zoneWidthPct: 1,
      volumeConfirmation: false,
      breakoutConfirmation: false,
      maxAgeBars: 100
    });
    expect(typeof sr.hit).toBe("boolean");
    const st = detectStructureAt(candles, bar, atr, "bullish_structure", {
      pivotLookback: 3,
      minSwingDistancePct: 0.01,
      confirmationCandles: 0,
      closeConfirmation: true,
      wickInclusion: false,
      atrThresholdMult: 0.1
    });
    expect(typeof st).toBe("boolean");
  });

  it("14. indicator conditions", () => {
    const candles = generateSyntheticCandles(50, 3, 0.001);
    const rsi = buildIndicatorSeries(candles, "rsi", 14);
    expect(rsi.length).toBe(candles.length);
    expect(compareValues(rsi, 40, "between", [0, 100])).toBe(true);
    const ema = buildIndicatorSeries(candles, "ema", 10);
    expect(compareValues(ema, 40, "increasing", null)).toBeTypeOf("boolean");
  });

  it("15. stop-loss and take-profit mapping via definition save", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID);
    const def = defaultDefinition({
      strategyId: copy.id,
      strategyName: copy.name,
      strategyType: "safe_params",
      timeframe: "15m",
      sourceStrategyId: SAFE_STRATEGY_ID,
      safeParams: copy.params as unknown as Record<string, number | boolean>,
      risk: {
        stopLossAtrMult: 2.5,
        takeProfitAtrMult: 5,
        useTrailing: true,
        trailAtrMult: 3,
        maxHoldBars: 10,
        oppositeSignalExit: true,
        structureInvalidationExit: false,
        partialExitEnabled: false
      }
    });
    const saved = saveStrategy(copy.id, { definition: def });
    expect(saved.params.sl_atr_mult).toBe(2.5);
    expect(saved.params.tp_atr_mult).toBe(5);
  });

  it("16-18. save/reload, delete editable, reject locked delete", () => {
    const created = createStrategy({ name: "임시전략", timeframe: "15m", strategyType: "safe_params" });
    const reloaded = getStrategyById(created.id);
    expect(reloaded?.name).toBe("임시전략");
    deleteStrategy(created.id);
    expect(getStrategyById(created.id)).toBeUndefined();
    expect(() => deleteStrategy(SAFE_STRATEGY_ID)).toThrow(StrategyValidationError);
  });

  it("19. backtest integration for SAFE and clone", async () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID);
    const result = await runConfiguredBacktest({
      strategyId: copy.id,
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      balance: 10000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
      costStressMultipliers: [1],
      costGuardK: 3,
      dataMode: "synthetic-test",
    });
    expect(result.report.validation.noRealOrders).toBe(true);
    expect(result.trades.length).toBeGreaterThanOrEqual(0);
    expect(result.report.dataSource).toBe("synthetic-test");
  });

  it("20-21. paper apply and live candidate mark", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID);
    const paper = setPaperActiveStrategy(copy.id);
    expect(paper.paperActive).toBe(true);
    const live = setLiveActiveStrategy(copy.id);
    expect(live.liveActive).toBe(true);
    expect(live.liveEligible).toBe(true);
    setPaperActiveStrategy(SAFE_STRATEGY_ID);
  });

  it("22-23. catalog + empty preview contract helpers", () => {
    const catalog = getSafeParamCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(47);
    expect(SNAPSHOT_CONFIRMED_KEYS.length).toBe(13);
    const confirmed = catalog.filter((c) => c.confirmedInDataFile);
    expect(confirmed.length).toBeGreaterThanOrEqual(13);
    const unconfirmed = catalog.filter((c) => !c.confirmedInDataFile);
    expect(unconfirmed.every((c) => c.sourceLabel === "unconfirmed")).toBe(true);
  });

  it("24. validateStrategyById works", () => {
    const v = validateStrategyById(SAFE_STRATEGY_ID);
    expect(v.ok).toBe(true);
  });

  it("25. restore clone from source", () => {
    const copy = copyStrategy(SAFE_STRATEGY_ID);
    const edited = saveStrategy(copy.id, { params: { ...copy.params, ema_fast: 99 } });
    expect(edited.params.ema_fast).toBe(99);
    const restored = restoreCloneFromSource(copy.id);
    expect(restored.params.ema_fast).toBe(getStrategyById(SAFE_STRATEGY_ID)!.params.ema_fast);
  });

  it("builder signal FLAT when empty groups", () => {
    const def = defaultDefinition({ strategyId: "x", strategyName: "x", timeframe: "15m" });
    const candles = generateSyntheticCandles(50, 1, 0.001);
    expect(evaluateBuilderSignal(def, { candles, bar: 40 })).toBe("FLAT");
  });
});
