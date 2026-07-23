import { describe, expect, it, vi, afterEach, afterAll } from "vitest";
import {
  runConfiguredBacktest,
  type SymbolBacktestResult,
} from "../src/lib/rextora/backtest/backtestRunner";
import { generateSyntheticCandlesForRange } from "../src/lib/rextora/data/ohlcvTypes";
import { HistoricalCandleLoadError } from "../src/lib/rextora/data/historicalCandleLoader";
import {
  statusChips,
  SAMPLE_MIN_TRADES,
  MDD_LOW,
  COST_LOW,
} from "../src/lib/rextora/backtest/statusThresholds";
import {
  buildVisualAnalysisModel,
  exitCategoryBuckets,
  holdingBuckets,
} from "../src/lib/rextora/backtest/visualAnalysis";
import { ensureStrategyStore } from "../src/lib/rextora/strategy/strategyStore";
import * as loader from "../src/lib/rextora/data/historicalCandleLoader";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";

const isolatedStrategies = installIsolatedStrategyStore();
ensureStrategyStore();
afterAll(() => {
  isolatedStrategies.cleanup();
});

const FROM = Date.UTC(2024, 0, 1);
const TO = Date.UTC(2024, 0, 20);
const INTERVAL = 900_000;

function synthCandles(seed: number) {
  return generateSyntheticCandlesForRange(
    FROM,
    TO,
    INTERVAL,
    80 + seed,
    0.00015,
  );
}

function failLoad(symbol: string) {
  return new HistoricalCandleLoadError({
    code: "BINANCE_EMPTY",
    userMessage: `${symbol} 실패`,
    technicalReason: "forced",
    symbol,
    timeframe: "15m",
    requestedFrom: new Date(FROM).toISOString(),
    requestedTo: new Date(TO).toISOString(),
    candlesReceived: 0,
  });
}

function mockOkLoad(seedBySymbol: Record<string, number>) {
  return vi.spyOn(loader, "loadHistoricalCandles").mockImplementation(
    async ({ symbol }) => {
      if (!(symbol in seedBySymbol) && seedBySymbol["*"] == null) {
        throw failLoad(symbol);
      }
      const seed = seedBySymbol[symbol] ?? seedBySymbol["*"] ?? 1;
      const candles = synthCandles(seed);
      return {
        candles,
        intervalMs: INTERVAL,
        dataSource: "binance" as const,
        requestedFrom: new Date(FROM).toISOString(),
        requestedTo: new Date(TO).toISOString(),
        actualFirstCandleTime: new Date(candles[0].openTime).toISOString(),
        actualLastCandleTime: new Date(
          candles[candles.length - 1].openTime,
        ).toISOString(),
      };
    },
  );
}

const baseConfig = {
  strategyId: "SAFE_v44_i4060",
  timeframe: "15m",
  fromOpenTime: FROM,
  toOpenTime: TO,
  balance: 10_000,
  feeRate: 0.0004,
  slippageRate: 0.0002,
  fundingRate: 0,
  applyFunding: false,
  applySpread: false,
  spreadRate: 0.0001,
  costStressMultipliers: [1] as number[],
  costGuardK: 3,
  dataMode: "binance" as const,
};

describe("multi-symbol backtest preservation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1–3. multi-symbol request preserves every symbol result independently", async () => {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    mockOkLoad({ BTCUSDT: 1, ETHUSDT: 2, SOLUSDT: 3 });

    const result = await runConfiguredBacktest({
      ...baseConfig,
      symbols,
    });

    expect(result.requestedSymbols).toEqual(symbols);
    expect(result.symbolResults).toHaveLength(3);
    expect(result.symbolResults.map((r) => r.symbol)).toEqual(symbols);

    const candleRefs = result.symbolResults.map((r) => r.candles);
    expect(candleRefs[0]).not.toBe(candleRefs[1]);
    expect(candleRefs[1]).not.toBe(candleRefs[2]);

    for (const r of result.symbolResults) {
      expect(r.report).not.toBeNull();
      expect(r.report!.symbol).toBe(r.symbol);
      expect(r.processedCandleCount).toBeGreaterThan(0);
    }

    expect(result.report.symbol).toBe(symbols[0]);
    expect(result.symbolResults[1].report!.symbol).toBe(symbols[1]);
    expect(result.symbolResults[2].report!.symbol).toBe(symbols[2]);
  });

  it("5. one symbol failure does not suppress successful symbols", async () => {
    vi.spyOn(loader, "loadHistoricalCandles").mockImplementation(
      async ({ symbol }) => {
        if (symbol === "ETHUSDT") {
          throw failLoad(symbol);
        }
        const candles = synthCandles(symbol.length);
        return {
          candles,
          intervalMs: INTERVAL,
          dataSource: "binance" as const,
          requestedFrom: new Date(FROM).toISOString(),
          requestedTo: new Date(TO).toISOString(),
          actualFirstCandleTime: new Date(candles[0].openTime).toISOString(),
          actualLastCandleTime: new Date(
            candles[candles.length - 1].openTime,
          ).toISOString(),
        };
      },
    );

    const result = await runConfiguredBacktest({
      ...baseConfig,
      symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
      balance: 9_000,
    });

    expect(result.symbolResults).toHaveLength(3);
    expect(result.failedSymbols).toContain("ETHUSDT");
    expect(result.successSymbols).toEqual(
      expect.arrayContaining(["BTCUSDT", "SOLUSDT"]),
    );
    expect(
      result.symbolResults.find((r) => r.symbol === "ETHUSDT")?.status,
    ).toBe("failed");
    expect(
      result.symbolResults.find((r) => r.symbol === "BTCUSDT")?.report,
    ).not.toBeNull();
    expect(
      result.symbolResults.find((r) => r.symbol === "SOLUSDT")?.report,
    ).not.toBeNull();
  });

  it("6. combined metrics are capital-split sums, not averaged percentages", async () => {
    mockOkLoad({ BTCUSDT: 1, ETHUSDT: 2 });

    const result = await runConfiguredBacktest({
      ...baseConfig,
      symbols: ["BTCUSDT", "ETHUSDT"],
    });

    expect(result.combinedReport).not.toBeNull();
    const ends = result.symbolResults.map((r) => r.report!.endingBalance);
    const sumEnds = ends.reduce((a, b) => a + b, 0);
    expect(result.combinedReport!.endingBalance).toBeCloseTo(sumEnds, 4);
    expect(result.combinedReport!.startingBalance).toBe(10_000);

    const combinedPct = result.combinedReport!.totalReturn;
    const fromEquity = (sumEnds - 10_000) / 10_000;
    expect(combinedPct).toBeCloseTo(fromEquity, 5);
  });

  it("API returns symbolResults array for multi-symbol", async () => {
    mockOkLoad({ BTCUSDT: 1, ETHUSDT: 2 });
    const { POST } = await import("../app/api/rextora/backtest/run/route");
    const req = new Request("http://localhost/api/rextora/backtest/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategyId: "SAFE_v44_i4060",
        symbols: ["BTCUSDT", "ETHUSDT"],
        timeframe: "15m",
        fromOpenTime: FROM,
        toOpenTime: TO,
        balance: 10_000,
      }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.symbolResults).toHaveLength(2);
    expect(json.data.symbolResults[0].symbol).toBe("BTCUSDT");
    expect(json.data.symbolResults[1].symbol).toBe("ETHUSDT");
    expect(json.data.requestedSymbols).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(json.data.combinedReport).toBeTruthy();
  });
});

describe("status thresholds module", () => {
  it("declares deterministic chips", () => {
    const chips = statusChips({
      totalReturn: 0.05,
      mdd: MDD_LOW / 2,
      totalCostPctOfInitial: COST_LOW / 2,
      tradeCount: SAMPLE_MIN_TRADES,
    });
    expect(chips.find((c) => c.id === "profit")?.labelKo).toBe("수익");
    expect(chips.find((c) => c.id === "mdd")?.labelKo).toBe("낮은 낙폭");
    expect(chips.find((c) => c.id === "sample")?.labelKo).toBe("표본 충분");

    const poor = statusChips({
      totalReturn: -0.1,
      mdd: 0.4,
      totalCostPctOfInitial: 0.1,
      tradeCount: 5,
    });
    expect(poor.find((c) => c.id === "profit")?.labelKo).toBe("손실");
    expect(poor.find((c) => c.id === "sample")?.labelKo).toBe("표본 부족");
  });
});

describe("distribution and holding reconciliation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("16–18. distribution / holding / cost reconcile with trade list", async () => {
    mockOkLoad({ BTCUSDT: 5 });

    const result = await runConfiguredBacktest({
      ...baseConfig,
      symbols: ["BTCUSDT"],
      applySpread: true,
      costStressMultipliers: [1, 1.5, 2],
    });

    const model = buildVisualAnalysisModel({
      report: result.report,
      trades: result.trades,
      equityCurve: result.equityCurve,
      candles: result.candles,
    });

    const { wins, losses, flats } = model.winLossSummary;
    expect(wins + losses + flats).toBe(model.trades.length);

    const holdSum = holdingBuckets(model.trades).reduce(
      (s, b) => s + b.count,
      0,
    );
    expect(holdSum).toBe(model.trades.length);

    const cats = exitCategoryBuckets(model.trades);
    expect(cats.find((c) => c.id === "win")?.count).toBe(wins);

    const costSum =
      model.costs.feeCostUsdt +
      model.costs.slippageCostUsdt +
      model.costs.spreadCostUsdt +
      model.costs.fundingCostUsdt;
    expect(costSum).toBeCloseTo(model.costs.totalCostUsdt, 4);

    const stress = result.report.costStress ?? [];
    const base = stress.find((s) => s.multiplier === 1);
    expect(base).toBeTruthy();
    for (const row of stress) {
      expect(Number.isFinite(row.totalReturn - (base?.totalReturn ?? 0))).toBe(
        true,
      );
    }

    for (const seg of [
      ...model.tradeTimelineGroups.long,
      ...model.tradeTimelineGroups.short,
    ]) {
      expect(seg.exitTime).toBeGreaterThanOrEqual(seg.entryTime);
      const trade = model.trades.find((t) => t.id === seg.tradeId);
      expect(trade?.entryTime).toBe(seg.entryTime);
      expect(trade?.exitTime).toBe(seg.exitTime);
    }

    expect(result.report.strategyHash.startsWith("7893ca3f0e30")).toBe(true);
  });
});

describe("chart interaction source contracts", () => {
  it("7–11. wheel / explore / fullscreen contracts in ChartShell", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/charts/ChartShell.tsx"),
      "utf8",
    );
    expect(src).toMatch(/if \(!\(e\.ctrlKey \|\| e\.metaKey\)\) return/);
    expect(src).toContain("if (!interactive || !explore) return");
    expect(src).toContain("Escape");
    expect(src).toContain("chart-fullscreen");
    expect(src).toContain("document.body.style.overflow");
  });

  it("12. marker hit targets present in CandlestickChart", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/charts/CandlestickChart.tsx"),
      "utf8",
    );
    expect(src).toContain("marker-hit-target");
    expect(src).toContain("hitR");
  });

  it("Top 10 button includes all ten symbols in panel", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/backtest/SafeBacktestPanel.tsx",
      ),
      "utf8",
    );
    const top =
      "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,AVAXUSDT,LINKUSDT,DOTUSDT";
    expect(src).toContain(top);
    expect(src).toContain("symbolResults");
    expect(src).toContain("MultiSymbolWorkspace");
  });

  it("symbol result type supports independent payloads", () => {
    const sample: SymbolBacktestResult = {
      symbol: "BTCUSDT",
      status: "ok",
      report: null,
      trades: [],
      equityCurve: [],
      candles: [],
      chartCandles: [],
      chartSamplingApplied: false,
      processedCandleCount: 0,
    };
    expect(sample.symbol).toBe("BTCUSDT");
  });
});
