import { describe, expect, it } from "vitest";
import {
  drawdownFromEquity,
  equityCurveToSeries,
  winLossDistribution,
  rollingWinRate,
  coinMeters,
  strategyScatter,
  marketStructureLevels
} from "../src/lib/rextora/charts/adapters";
import { niceDomain, createLinearScale } from "../src/lib/rextora/charts/scales";
import { CHART_THEME } from "../src/lib/rextora/charts/theme";

describe("unified chart engine", () => {
  it("shares theme tokens", () => {
    expect(CHART_THEME.up).toBeTruthy();
    expect(CHART_THEME.equity).toBeTruthy();
  });

  it("builds equity and drawdown series", () => {
    const eq = equityCurveToSeries([100, 110, 105, 120]);
    expect(eq.data).toHaveLength(4);
    const dd = drawdownFromEquity([100, 110, 105, 120]);
    expect(dd.data.some((p) => p.y <= 0)).toBe(true);
  });

  it("scales domains", () => {
    const [a, b] = niceDomain(10, 20);
    expect(a).toBeLessThan(10);
    expect(b).toBeGreaterThan(20);
    const s = createLinearScale([0, 10], [0, 100]);
    expect(s(5)).toBe(50);
  });

  it("builds distributions and meters from real fields", () => {
    const dist = winLossDistribution([{ pnlPct: 1 }, { pnlPct: -0.5 }, { pnlPct: 0 }]);
    expect(dist.find((d) => d.label === "이익")?.value).toBe(1);
    const meters = coinMeters({ change24hPct: 2, volumeChangePct: 0, volatility: 3, aiScore: 80, quoteVolume: 5_000_000 });
    expect(meters).toHaveLength(6);
    expect(rollingWinRate([{ pnlPct: 1 }, { pnlPct: -1 }, { pnlPct: 1 }]).data).toHaveLength(3);
    expect(strategyScatter([{ name: "A", totalReturn: 0.2, mdd: -0.1, trades: 10 }])).toHaveLength(1);
  });

  it("derives market structure from candles without fabricating signals", () => {
    const candles = Array.from({ length: 40 }, (_, i) => ({
      time: i,
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 101 + i,
      volume: 1000
    }));
    const levels = marketStructureLevels(candles);
    expect(levels.some((l) => l.label === "지지")).toBe(true);
    expect(levels.some((l) => l.label === "저항")).toBe(true);
    expect(levels.some((l) => l.label === "추세선")).toBe(true);
  });
});
