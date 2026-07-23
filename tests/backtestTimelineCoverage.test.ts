import { describe, expect, it } from "vitest";
import {
  MAY_2026_END_UTC,
  buildMonthlyCoverage,
  countTradesAfter,
  firstTradeEntryMs,
  lastTradeExitMs,
} from "../src/lib/rextora/backtest/monthlyCoverage";
import {
  analyzeCandleSpacing,
  defaultVisibleCandleTarget,
  MIN_CANDLE_BODY_PX,
} from "../src/lib/rextora/backtest/candleSpacing";
import fs from "node:fs";
import path from "node:path";

describe("monthly coverage + ledger range", () => {
  it("reconciles monthly trade counts with the ledger", () => {
    const trades = [
      {
        entryTime: Date.UTC(2026, 3, 10),
        exitTime: Date.UTC(2026, 3, 11),
        side: "LONG" as const,
        netPnlUsdt: 10,
      },
      {
        entryTime: Date.UTC(2026, 4, 20),
        exitTime: Date.UTC(2026, 4, 21),
        side: "SHORT" as const,
        netPnlUsdt: -5,
      },
      {
        entryTime: Date.UTC(2026, 4, 28),
        exitTime: Date.UTC(2026, 4, 29),
        side: "LONG" as const,
        netPnlUsdt: 2,
      },
    ];
    const candles = [];
    for (
      let t = Date.UTC(2026, 3, 1);
      t <= Date.UTC(2026, 6, 15);
      t += 86_400_000
    ) {
      candles.push({ openTime: t });
    }
    const rows = buildMonthlyCoverage({
      candles,
      trades,
      startingBalance: 10_000,
      rangeStartMs: Date.UTC(2026, 3, 1),
      rangeEndMs: Date.UTC(2026, 6, 15),
    });
    expect(rows.map((r) => r.monthKey)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
    expect(rows.find((r) => r.monthKey === "2026-04")?.tradeCount).toBe(1);
    expect(rows.find((r) => r.monthKey === "2026-05")?.tradeCount).toBe(2);
    expect(rows.find((r) => r.monthKey === "2026-06")?.status).toBe(
      "no_trades",
    );
    expect(rows.find((r) => r.monthKey === "2026-07")?.status).toBe(
      "no_trades",
    );
    expect(rows.reduce((s, r) => s + r.tradeCount, 0)).toBe(trades.length);
  });

  it("reports last trade exit and trades after May", () => {
    const trades = [
      { entryTime: Date.UTC(2026, 4, 10), exitTime: Date.UTC(2026, 4, 29) },
      {
        entryTime: Date.UTC(2026, 5, 5),
        exitTime: Date.UTC(2026, 5, 6),
      },
    ];
    expect(lastTradeExitMs(trades)).toBe(Date.UTC(2026, 5, 6));
    expect(firstTradeEntryMs(trades)).toBe(Date.UTC(2026, 4, 10));
    expect(countTradesAfter(trades, MAY_2026_END_UTC)).toBe(1);
  });

  it("does not drop later trades from coverage when present", () => {
    const trades = [
      {
        entryTime: Date.UTC(2026, 5, 15),
        exitTime: Date.UTC(2026, 5, 16),
        side: "LONG" as const,
        netPnlUsdt: 1,
      },
      {
        entryTime: Date.UTC(2026, 6, 2),
        exitTime: Date.UTC(2026, 6, 3),
        side: "SHORT" as const,
        netPnlUsdt: -1,
      },
    ];
    const candles = [
      { openTime: Date.UTC(2026, 5, 1) },
      { openTime: Date.UTC(2026, 6, 1) },
      { openTime: Date.UTC(2026, 6, 20) },
    ];
    const rows = buildMonthlyCoverage({
      candles,
      trades,
      startingBalance: 1000,
    });
    expect(rows.find((r) => r.monthKey === "2026-06")?.tradeCount).toBe(1);
    expect(rows.find((r) => r.monthKey === "2026-07")?.tradeCount).toBe(1);
  });
});

describe("candle spacing + default density", () => {
  it("detects sorted unique candles and missing intervals", () => {
    const interval = 15 * 60_000;
    const candles = [
      { openTime: 1_000 },
      { openTime: 1_000 + interval },
      { openTime: 1_000 + interval * 3 }, // skip one
      { openTime: 1_000 + interval * 3 }, // duplicate
    ];
    const report = analyzeCandleSpacing(candles, interval);
    expect(report.sorted).toBe(true);
    expect(report.duplicateCount).toBe(1);
    expect(report.missingIntervalCount).toBeGreaterThanOrEqual(1);
    expect(report.firstTimestamp).toBe(1_000);
    expect(report.lastTimestamp).toBe(1_000 + interval * 3);
  });

  it("default visible range targets 55–75 candles on desktop-width plots", () => {
    expect(defaultVisibleCandleTarget(1100, 400)).toBeGreaterThanOrEqual(55);
    expect(defaultVisibleCandleTarget(1100, 400)).toBeLessThanOrEqual(75);
    expect(defaultVisibleCandleTarget(720, 400)).toBeGreaterThanOrEqual(40);
    expect(defaultVisibleCandleTarget(720, 400)).toBeLessThanOrEqual(55);
    expect(defaultVisibleCandleTarget(720, 20)).toBe(20);
    expect(MIN_CANDLE_BODY_PX).toBeGreaterThanOrEqual(10);
  });
});

describe("chart toolbar and timeline readability contracts", () => {
  it("전체 보기 button uses lucide Expand and clean Korean label", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/charts/ChartShell.tsx"),
      "utf8",
    );
    expect(src).toContain("전체 보기");
    expect(src).toContain('aria-label="전체 기간 차트 보기"');
    expect(src).toContain("data-testid=\"chart-fit-all\"");
    expect(src).toContain("Expand");
    expect(src).not.toMatch(/\?�체 보기/);
    expect(src).not.toMatch(/초기\?\?/);
    expect(src).toContain('from "lucide-react"');
  });

  it("timeline does not permanently render multiline bucket statistics", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/BacktestAnalysisView.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("timeline-bucket-label");
    expect(src).toContain("timeline-hover-tooltip");
    expect(src).toContain("주별 집계");
    expect(src).toContain("일별 집계");
    expect(src).toContain("개별 거래");
    // No permanent L/S/win-rate SVG text stack inside density buckets
    expect(src).not.toMatch(/승률 \{\(winRate \* 100\)\.toFixed\(0\)\}%/);
    expect(src).not.toMatch(/L\{b\.long\}\/S\{b\.short\}/);
  });

  it("candlestick uses minimum readable body width", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/charts/CandlestickChart.tsx"),
      "utf8",
    );
    expect(src).toContain("MIN_CANDLE_BODY_PX");
    expect(src).toContain("Price domain from OHLC only");
  });
});

describe("API no longer truncates first 300 trades", () => {
  it("run route returns full trades array", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/api/rextora/backtest/run/route.ts"),
      "utf8",
    );
    expect(src).not.toContain("trades.slice(0, 300)");
    expect(src).toContain("tradesReturned");
  });
});

describe("marker labels and contrast tokens", () => {
  it("does not permanently render trade IDs on every marker", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/CandlestickChart.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("showLabels || selected");
    expect(src).not.toMatch(/zoomedIn[\s\S]{0,40}showLabels/);
  });

  it("applies semantic muted token stronger than slate-500", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "app/globals.css"),
      "utf8",
    );
    expect(css).toMatch(/--text-muted:\s*#b4c0d2/);
    const theme = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/charts/theme.ts"),
      "utf8",
    );
    expect(theme).toMatch(/axisLabel:\s*"#d4deeb"/);
  });
});
