/**
 * Final Strategy Search completion proofs (engine + wiring).
 * Isolated — does not mutate production SAFE or production research data.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  classifyPatternOverlays,
  resolveEventSequenceFamilyFromStrategy,
} from "../src/lib/rextora/backtest/patternOverlayAvailability";
import { buildTradeEventTrace } from "../src/lib/rextora/backtest/tradeEventTrace";
import {
  resolvePatternConfirmation,
  confirmationParamsForCandidate,
} from "../src/lib/rextora/strategySearch/patternConfirmation";
import {
  applyPatternOperatorConfigToBaseParams,
  patternConfigFromPlanFields,
} from "../src/lib/rextora/strategySearch/patternSearchConfig";
import { buildPatternSearchDefinition } from "../src/lib/rextora/strategySearch/patternEventSequence";
import { runEventSequenceBacktest } from "../src/lib/rextora/strategy/eventSequenceBacktest";
import {
  applyLeverageModeToParams,
  resolveEventSequenceLeverage,
} from "../src/lib/rextora/strategySearch/leverageMode";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import type { TradeEventTrace } from "../src/lib/rextora/backtest/tradeEventTrace";
import { PATTERN_SEARCH_SUPPORT } from "../src/lib/rextora/strategySearch/patternSupportMatrix";

const ROOT = path.resolve(__dirname, "..");

function syntheticCandles(n: number): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  let px = 100;
  const t0 = Date.parse("2026-01-01T00:00:00.000Z");
  for (let i = 0; i < n; i += 1) {
    const open = px;
    // Impulse then pullback pattern-friendly path
    const drift = i % 17 === 0 ? 3.5 : i % 17 === 1 ? -2.2 : (i % 5) * 0.05 - 0.1;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + 0.4;
    const low = Math.min(open, close) - 0.4;
    out.push({
      openTime: t0 + i * 900_000,
      open,
      high,
      low,
      close,
      volume: 1000 + i,
    });
    px = close;
  }
  return out;
}

describe("pattern confirmation schema", () => {
  it("maps legacy on/off correctly", () => {
    expect(
      resolvePatternConfirmation({ patternConfirmClose: "disabled" })
        .confirmationMode,
    ).toBe("none");
    expect(
      resolvePatternConfirmation({ patternConfirmClose: "required" })
        .confirmationMode,
    ).toBe("single_close");
    expect(
      resolvePatternConfirmation({
        confirmationMode: "consecutive_closes",
        confirmationCandleCount: 3,
        confirmationWindow: 5,
      }),
    ).toMatchObject({
      confirmationMode: "consecutive_closes",
      confirmationCandleCount: 3,
      confirmationWindow: 5,
    });
  });

  it("confirmation count changes candidate identity params", () => {
    const a = confirmationParamsForCandidate(
      resolvePatternConfirmation({
        confirmationMode: "consecutive_closes",
        confirmationCandleCount: 2,
      }),
    );
    const b = confirmationParamsForCandidate(
      resolvePatternConfirmation({
        confirmationMode: "consecutive_closes",
        confirmationCandleCount: 3,
      }),
    );
    expect(a.confirmationCandleCount).toBe(2);
    expect(b.confirmationCandleCount).toBe(3);
    expect(a.confirmationCandleCount).not.toBe(b.confirmationCandleCount);
  });

  it("operator plan wires confirmation into base params", () => {
    const cfg = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternConfirmationMode: "consecutive_closes",
      patternConfirmationCandleCount: 3,
      patternConfirmationWindow: 6,
      patternConfirmClose: "required",
    });
    const next = applyPatternOperatorConfigToBaseParams(
      { penetrationPct: 0.45, maxHoldBars: 48 },
      cfg,
    );
    expect(next.confirmationMode).toBe("consecutive_closes");
    expect(next.confirmationCandleCount).toBe(3);
    expect(next.requireCloseInDirection).toBe(true);
  });
});

describe("eventSequence leverage modes", () => {
  const base = {
    lev_min: 2,
    lev_base: 3,
    lev_max: 5,
    use_dynamic_leverage: true,
  };

  it("automatic / fixed / range / disabled rewrite lev params", () => {
    const automatic = applyLeverageModeToParams(base, {
      leverageMode: "automatic",
      leverageMin: 1,
      leverageMax: 4,
      adaptiveLeverageEnabled: true,
    });
    expect(automatic.use_dynamic_leverage).toBe(true);

    const fixed = applyLeverageModeToParams(base, {
      leverageMode: "fixed",
      leverageFixed: 7,
    });
    expect(fixed.lev_min).toBe(7);
    expect(fixed.lev_base).toBe(7);
    expect(fixed.lev_max).toBe(7);

    const range = applyLeverageModeToParams(base, {
      leverageMode: "range",
      leverageMin: 2,
      leverageMax: 9,
    });
    expect(range.lev_min).toBe(2);
    expect(range.lev_max).toBe(9);

    const disabled = applyLeverageModeToParams(base, {
      leverageMode: "disabled",
    });
    expect(disabled.lev_base).toBe(1);
    expect(disabled.use_dynamic_leverage).toBe(false);
  });

  it("trade-level leverage resolves from params", () => {
    const lev = resolveEventSequenceLeverage({
      params: { lev_min: 2, lev_base: 3, lev_max: 4, use_dynamic_leverage: false },
      atr: 1,
      price: 100,
      peakEquity: 10_000,
      equity: 10_000,
    });
    expect(lev).toBeGreaterThanOrEqual(1);
  });
});

describe("pattern overlay reads persisted geometry only", () => {
  const families = [
    "order_block",
    "fvg",
    "trendline",
    "support_resistance",
  ] as const;

  for (const family of families) {
    it(`${family}: available when geometry persisted; unused for safe_params empty`, () => {
      const withGeo: TradeEventTrace = {
        version: 1,
        tradeId: "T0001",
        symbol: "BTCUSDT",
        timeframe: "15m",
        direction: "LONG",
        entry: {
          kind: "entry",
          at: "2026-01-01T00:00:00.000Z",
          price: 1,
          labelKo: "진입",
          detailKo: null,
        },
        exit: {
          kind: "exit",
          at: "2026-01-02T00:00:00.000Z",
          price: 2,
          labelKo: "청산",
          detailKo: null,
        },
        stopPrice: 0.9,
        targetPrice: 1.2,
        exitReason: "take_profit",
        grossPnl: 1,
        fee: 0,
        slippage: 0,
        netPnl: 1,
        holdingDurationMs: 1,
        assumptionsKo: [],
        events: [],
        whyEnteredKo: "",
        whyExitedKo: "",
        feeSlippageImpactKo: "",
        patternType: family,
        zoneHigh: 110,
        zoneLow: 100,
        lineAnchors:
          family === "trendline"
            ? [
                { bar: 1, price: 100 },
                { bar: 5, price: 105 },
              ]
            : undefined,
      };
      const avail = classifyPatternOverlays({
        strategyType: "condition_builder",
        eventSequenceFamily: null,
        traces: [withGeo],
      });
      const row = avail.find((a) => a.kind === family);
      expect(row?.status).toBe("available");
      expect(row?.defaultOn).toBe(true);

      const safe = classifyPatternOverlays({
        strategyType: "safe_params",
        traces: [],
      });
      expect(safe.every((r) => r.status === "strategy_unused")).toBe(true);
    });
  }

  it("resolves family from definition pattern_creation step", () => {
    const fam = resolveEventSequenceFamilyFromStrategy({
      strategyType: "condition_builder",
      definition: {
        eventSequence: {
          steps: [
            { kind: "pattern_creation", patternFamily: "fvg" },
          ],
        },
        metadata: { searchFamily: "fvg" },
      },
    });
    expect(fam).toBe("fvg");
  });

  it("workbench no longer hardcodes eventSequenceFamily null", () => {
    const wb = fs.readFileSync(
      path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
      "utf8",
    );
    expect(wb).toContain("resolveEventSequenceFamilyFromStrategy");
    expect(wb).not.toMatch(/eventSequenceFamily=\{null\}/);
  });
});

describe("pattern search plan wiring for all families", () => {
  for (const family of [
    "order_block",
    "fvg",
    "trendline",
    "support_resistance",
  ] as const) {
    it(`${family} builds eventSequence with confirmation params`, () => {
      const params: Record<string, unknown> = {
        penetrationPct: 0.4,
        stopAtrMult: 1.2,
        tpAtrMult: 2,
        maxHoldBars: 48,
        zoneLookback: 40,
        confirmationMode: "consecutive_closes",
        confirmationCandleCount: 2,
        confirmationWindow: 4,
        requireCloseInDirection: true,
        atrRelativeMult: 0.2,
        minGapPct: 0.08,
        slopeMin: 0,
        slopeMax: 2,
        tolerancePct: 0.35,
        minTouchCount: 2,
        minTouches: 2,
        zoneWidthPct: 0.25,
      };
      const def = buildPatternSearchDefinition({
        candidateId: `test_${family}`,
        strategyName: `test ${family}`,
        timeframe: "15m",
        params,
        family,
      });
      expect(def).not.toBeNull();
      expect(def?.eventSequence).toBeTruthy();
      const confirm = def!.eventSequence!.steps.find(
        (s) => s.kind === "confirmation",
      );
      expect(confirm?.params.confirmationMode).toBe("consecutive_closes");
      expect(confirm?.params.confirmationCandleCount).toBe(2);
    });
  }
});

describe("eventSequence backtest geometry + leverage persistence", () => {
  it("produces trades with leverage and geometry when detector fires", () => {
    const def = buildPatternSearchDefinition({
      candidateId: "test_ob_geo",
      strategyName: "ob geo",
      timeframe: "15m",
      family: "order_block",
      params: {
        penetrationPct: 0.2,
        stopAtrMult: 1,
        tpAtrMult: 1.5,
        maxHoldBars: 80,
        zoneLookback: 30,
        confirmationMode: "none",
        requireCloseInDirection: false,
        lev_min: 1,
        lev_base: 2,
        lev_max: 2,
        use_dynamic_leverage: false,
      },
    });
    expect(def).not.toBeNull();
    const result = runEventSequenceBacktest({
      def: def!,
      symbol: "BTCUSDT",
      candles: syntheticCandles(220),
      balance: 10_000,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      params: {
        lev_min: 1,
        lev_base: 2,
        lev_max: 2,
        use_dynamic_leverage: false,
      },
    });
    // May or may not trade depending on detector — never fabricate.
    for (const t of result.trades) {
      expect(t.leverage).toBeGreaterThanOrEqual(1);
      if (t.patternType) {
        const trace = buildTradeEventTrace(t as never, {
          symbol: "BTCUSDT",
          timeframe: "15m",
        });
        if (trace.zoneHigh != null && trace.zoneLow != null) {
          const avail = classifyPatternOverlays({
            strategyType: "condition_builder",
            eventSequenceFamily: "order_block",
            traces: [trace],
          });
          expect(
            avail.find((a) => a.kind === "order_block")?.status,
          ).toBe("available");
        }
      }
    }
  });
});

describe("no forced Results navigation + capability honesty", () => {
  it("Search workbench has no router.push to results", () => {
    const wb = fs.readFileSync(
      path.join(
        ROOT,
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(wb).not.toMatch(/router\.push\([`'"]\/results/);
    expect(wb).not.toMatch(/router\.replace\([`'"]\/results/);
  });

  it("matrix stays verification_required until browser proof", () => {
    for (const row of PATTERN_SEARCH_SUPPORT) {
      expect(row.search).toBe("verification_required");
      expect(row.backtest).toBe("verification_required");
      expect(row.searchable).toBe(true);
    }
  });

  it("retired SAFE file remains absent", () => {
    expect(
      fs.existsSync(path.join(ROOT, "data/strategies/SAFE_v44_i4060.json")),
    ).toBe(false);
  });
});
