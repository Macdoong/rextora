import { describe, expect, it } from "vitest";
import {
  allPointsInsidePlot,
  computeScatterDomain,
  projectScatterPoint,
  toScatterPoint,
} from "../src/lib/rextora/backtest/scatterDomain";
import fs from "node:fs";
import path from "node:path";

describe("return vs drawdown scatter domain", () => {
  it("uses absolute MDD magnitude and keeps all-negative returns in domain", () => {
    const points = [
      toScatterPoint({
        symbol: "BTCUSDT",
        mdd: -0.12,
        totalReturn: -0.05,
      })!,
      toScatterPoint({
        symbol: "ETHUSDT",
        mdd: -0.08,
        totalReturn: -0.02,
      })!,
      toScatterPoint({
        symbol: "SOLUSDT",
        mdd: -0.2,
        totalReturn: -0.09,
      })!,
    ];
    expect(points.every((p) => p.drawdownPct >= 0)).toBe(true);
    expect(points[0].drawdownPct).toBeCloseTo(12, 5);

    const domain = computeScatterDomain(points);
    expect(domain.minX).toBe(0);
    expect(domain.maxX).toBeGreaterThanOrEqual(20);
    expect(domain.minY).toBeLessThan(0);
    expect(domain.maxY).toBeGreaterThan(domain.minY);
    expect(domain.xLabelKo).toContain("|MDD|");

    const plot = { left: 56, top: 24, width: 420, height: 280 };
    expect(allPointsInsidePlot(points, domain, plot)).toBe(true);

    for (const p of points) {
      const proj = projectScatterPoint(p, domain, plot)!;
      expect(proj.cx).toBeGreaterThanOrEqual(plot.left - 1);
      expect(proj.cx).toBeLessThanOrEqual(plot.left + plot.width + 1);
    }
  });

  it("includes every Top-10-style symbol inside the plot domain", () => {
    const symbols = [
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
      "BNBUSDT",
      "XRPUSDT",
      "ADAUSDT",
      "DOGEUSDT",
      "AVAXUSDT",
      "LINKUSDT",
      "DOTUSDT",
    ];
    const points = symbols.map((symbol, i) =>
      toScatterPoint({
        symbol,
        mdd: -0.01 * (i + 1),
        totalReturn: i % 2 === 0 ? -0.002 * (i + 1) : 0.001 * (i + 1),
      })!,
    );
    const domain = computeScatterDomain(points);
    const plot = { left: 56, top: 24, width: 420, height: 280 };
    expect(points).toHaveLength(10);
    expect(allPointsInsidePlot(points, domain, plot)).toBe(true);
  });

  it("rejects null metrics", () => {
    expect(
      toScatterPoint({ symbol: "X", mdd: null, totalReturn: 0.1 }),
    ).toBeNull();
  });
});

describe("contrast tokens and reading-order removal", () => {
  it("defines semantic text contrast tokens", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "app/globals.css"),
      "utf8",
    );
    expect(css).toContain("--text-primary");
    expect(css).toContain("--text-secondary");
    expect(css).toContain("--text-muted");
    expect(css).toContain(".rx-text-primary");
    expect(css).toContain(".rx-text-muted");
    // muted must be stronger than previous #8b9bb0
    expect(css).toMatch(/--text-muted:\s*#b4c0d2/);
  });

  it("removes reading-order card from analysis view", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/BacktestAnalysisView.tsx",
      ),
      "utf8",
    );
    expect(src).not.toContain("백테스트 결과 읽는 순서");
    expect(src).not.toContain("backtest-reading-guide");
  });

  it("chart theme axis labels are higher contrast", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/charts/theme.ts"),
      "utf8",
    );
    expect(src).toContain('axisLabel: "#d4deeb"');
  });
});

describe("candlestick crosshair contracts", () => {
  it("has full-plot hit area and axis crosshair labels", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/charts/CandlestickChart.tsx"),
      "utf8",
    );
    expect(src).toContain("candle-plot-hit");
    expect(src).toContain("crosshair-price-label");
    expect(src).toContain("crosshair-time-label");
    expect(src).toContain("preferRecentWindow");
    expect(src).toContain("marker-group-toggles");
    expect(src).toContain("triangle-up");
    expect(src).toContain("triangle-down");
  });

  it("trade drawer includes mini chart and waterfall", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/BacktestAnalysisView.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("trade-mini-chart");
    expect(src).toContain("trade-pnl-waterfall");
    expect(src).toContain("trade-lifecycle");
    expect(src).toContain("기록 없음");
  });
});
