import { describe, expect, it } from "vitest";
import {
  EntryTriggerValidationError,
  ENGINE_SUPPORTED_TRIGGER_MODE,
  LEGACY_ENTRY_TRIGGER,
  NEW_STRATEGY_ENTRY_TRIGGER_DEFAULTS,
  entryTriggerToStepParams,
  resolveEntryTrigger,
  validateEntryTriggerParams,
  validateEntryZoneAtExecution,
} from "../src/lib/rextora/strategy/definition/entryTrigger";
import {
  buildOrderBlockLongSequence,
  validateEventSequence,
} from "../src/lib/rextora/strategy/definition/eventSequence";
import { validateCanonicalDefinition, defaultDefinition } from "../src/lib/rextora/strategy/definition/validator";
import { runEventSequenceBacktest } from "../src/lib/rextora/strategy/eventSequenceBacktest";
import { generateSyntheticCandles } from "../src/lib/rextora/data/ohlcvTypes";
import { formatRejectionReasonKo } from "../src/lib/rextora/backtest/patternExplainability";
import fs from "node:fs";
import path from "node:path";

const SAFE = path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json");

describe("entryTrigger resolve + spatial revalidation", () => {
  it("missing schema resolves to legacy (no revalidation)", () => {
    const { trigger, legacy } = resolveEntryTrigger({ rule: "confirmation_close" });
    expect(legacy).toBe(true);
    expect(trigger.revalidateAtEntry).toBe(false);
    expect(trigger.maxBarsAfterTouch).toBeNull();
  });

  it("new builder embeds entryTrigger schema v1", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.25,
      stopAtrMult: 1.2,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    });
    const entry = seq.steps.find((s) => s.kind === "entry");
    expect(entry?.params.entryTriggerSchemaVersion).toBe(1);
    expect(entry?.params.revalidateAtEntry).toBe(true);
    const { legacy } = resolveEntryTrigger(entry?.params as Record<string, unknown>);
    expect(legacy).toBe(false);
  });

  it("legacyEntry builder preserves confirmation_close only", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 1,
      tpAtrMult: 2,
      maxHoldBars: 24,
      zoneLookback: 40,
      legacyEntry: true,
    });
    const entry = seq.steps.find((s) => s.kind === "entry");
    expect(entry?.params).toEqual({ rule: "confirmation_close" });
  });

  it("rejects distant SHORT entry outside tolerance (T0010-like)", () => {
    const zoneHigh = 62546.6;
    const zoneLow = 62433;
    const entryPrice = 63342.3;
    const candle = {
      open: 63499.9,
      high: 63516.3,
      low: 63290.3,
      close: entryPrice,
    };
    const check = validateEntryZoneAtExecution({
      side: "SHORT",
      candle,
      zoneHigh,
      zoneLow,
      entryPrice,
      trigger: {
        ...NEW_STRATEGY_ENTRY_TRIGGER_DEFAULTS,
        revalidateAtEntry: true,
        entryPriceTolerancePct: 0.5,
        touchBasis: "WICK",
      },
    });
    expect(check.ok).toBe(false);
    expect(check.reasonCode).toBe("entry_price_outside_tolerance");
    expect(check.distanceZoneMult).toBeGreaterThan(6);
    expect(formatRejectionReasonKo("entry_price_outside_tolerance")).toBe(
      "진입가 허용 범위 초과",
    );
  });

  it("accepts entry when wick still touches zone", () => {
    const check = validateEntryZoneAtExecution({
      side: "SHORT",
      candle: { open: 62580, high: 62600, low: 62500, close: 62520 },
      zoneHigh: 62546.6,
      zoneLow: 62433,
      entryPrice: 62520,
      trigger: {
        ...NEW_STRATEGY_ENTRY_TRIGGER_DEFAULTS,
        revalidateAtEntry: true,
        touchBasis: "WICK",
        entryPriceTolerancePct: 0.5,
      },
    });
    expect(check.ok).toBe(true);
    expect(check.touchOk).toBe(true);
  });

  it("legacy trigger never rejects distant spatial check", () => {
    const check = validateEntryZoneAtExecution({
      side: "SHORT",
      candle: { open: 63499.9, high: 63516.3, low: 63290.3, close: 63342.3 },
      zoneHigh: 62546.6,
      zoneLow: 62433,
      entryPrice: 63342.3,
      trigger: LEGACY_ENTRY_TRIGGER,
    });
    expect(check.ok).toBe(true);
  });

  it("flattens trigger params for identity hashing", () => {
    const flat = entryTriggerToStepParams(NEW_STRATEGY_ENTRY_TRIGGER_DEFAULTS);
    expect(flat.entryTriggerSchemaVersion).toBe(1);
    expect(flat.revalidateAtEntry).toBe(true);
    expect(typeof flat.maxBarsAfterTouch).toBe("number");
    expect(flat.triggerMode).toBe(ENGINE_SUPPORTED_TRIGGER_MODE);
  });
});

describe("triggerMode commercial contract", () => {
  it("supported triggerMode parses for schema v1", () => {
    const result = validateEntryTriggerParams({
      entryTriggerSchemaVersion: 1,
      triggerMode: ENGINE_SUPPORTED_TRIGGER_MODE,
    });
    expect(result.ok).toBe(true);
    const { trigger, legacy } = resolveEntryTrigger({
      entryTriggerSchemaVersion: 1,
      triggerMode: ENGINE_SUPPORTED_TRIGGER_MODE,
    });
    expect(legacy).toBe(false);
    expect(trigger.triggerMode).toBe(ENGINE_SUPPORTED_TRIGGER_MODE);
  });

  it("unsupported triggerMode fails typed validation", () => {
    const result = validateEntryTriggerParams({
      entryTriggerSchemaVersion: 1,
      triggerMode: "BREAK_AND_RETEST",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNSUPPORTED_TRIGGER_MODE");
      expect(result.triggerMode).toBe("BREAK_AND_RETEST");
    }
    expect(() =>
      resolveEntryTrigger({
        entryTriggerSchemaVersion: 1,
        triggerMode: "BREAK_AND_RETEST",
      }),
    ).toThrow(EntryTriggerValidationError);
  });

  it("validateEventSequence rejects unsupported triggerMode on entry step", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.25,
      stopAtrMult: 1.2,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    });
    const entry = seq.steps.find((step) => step.kind === "entry");
    if (entry?.params && typeof entry.params === "object") {
      (entry.params as Record<string, unknown>).triggerMode = "BREAK_AND_RETEST";
    }
    const validation = validateEventSequence(seq);
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((error) => error.includes("triggerMode"))).toBe(
      true,
    );
  });

  it("imported unsupported strategy fails canonical validation", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.25,
      stopAtrMult: 1.2,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    });
    const entry = seq.steps.find((step) => step.kind === "entry");
    if (entry?.params && typeof entry.params === "object") {
      (entry.params as Record<string, unknown>).triggerMode = "TOUCH";
    }
    const def = defaultDefinition({
      strategyId: "trigger_mode_import_test",
      strategyName: "Trigger Mode Import Test",
      eventSequence: seq,
    });
    const validation = validateCanonicalDefinition(def);
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((error) => error.includes("triggerMode"))).toBe(
      true,
    );
  });

  it("backtest refuses unsupported triggerMode without silent execution", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.25,
      stopAtrMult: 1.2,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    });
    const entry = seq.steps.find((step) => step.kind === "entry");
    if (entry?.params && typeof entry.params === "object") {
      (entry.params as Record<string, unknown>).triggerMode = "REJECTION_CANDLE";
    }
    const def = defaultDefinition({
      strategyId: "trigger_mode_bt_test",
      strategyName: "Trigger Mode Backtest Test",
      eventSequence: seq,
    });
    const candles = generateSyntheticCandles(120, 100, 0.0015, {
      startOpenTime: Date.UTC(2024, 0, 1),
      intervalMs: 900_000,
    });
    const result = runEventSequenceBacktest({
      def,
      symbol: "BTCUSDT",
      candles,
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
    });
    expect(result.trades).toHaveLength(0);
    expect(result.rejectedSetups[0]?.reasonCode).toBe("unsupported_trigger_mode");
  });

  it("legacy schema without entryTriggerSchemaVersion remains executable", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 1,
      tpAtrMult: 2,
      maxHoldBars: 24,
      zoneLookback: 40,
      legacyEntry: true,
    });
    const validation = validateEventSequence(seq);
    expect(validation.ok).toBe(true);
    const def = defaultDefinition({
      strategyId: "legacy_trigger_mode",
      strategyName: "Legacy Trigger Mode",
      eventSequence: seq,
    });
    expect(validateCanonicalDefinition(def).ok).toBe(true);
  });

  it("retired SAFE file remains absent", () => {
    expect(fs.existsSync(SAFE)).toBe(false);
  });
});

describe("Pattern Summary compact default wiring", () => {
  it("BacktestAnalysisView defaults summary collapsed", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/BacktestAnalysisView.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("pattern-summary-compact");
    expect(src).toContain("pattern-summary-toggle");
    expect(src).toContain("자세히 보기");
    expect(src).toContain("rextora.backtest.patternSummaryExpanded");
  });
});

describe("historical T0010 evidence preserved on disk", () => {
  it("does not rewrite persisted T0010 geometry", () => {
    const runPath = path.join(
      process.cwd(),
      "data/rextora/backtests/bt_ms40phpl_aca368.json",
    );
    if (!fs.existsSync(runPath)) return;
    const run = JSON.parse(fs.readFileSync(runPath, "utf8")) as {
      report: {
        tradeEventTraces: Array<{
          tradeId: string;
          zoneHigh: number;
          zoneLow: number;
          entry: { price: number };
        }>;
      };
    };
    const t = run.report.tradeEventTraces.find((x) => x.tradeId === "T0010");
    expect(t?.zoneHigh).toBe(62546.6);
    expect(t?.zoneLow).toBe(62433);
    expect(t?.entry.price).toBe(63342.3);
  });
});
