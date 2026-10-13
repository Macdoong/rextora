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
import {
  niceDomain,
  nonNegativeDomain,
  createLinearScale,
} from "../src/lib/rextora/charts/scales";
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

  it("keeps verified nonnegative performance metrics on truthful domains", () => {
    const containsAll = (domain: [number, number], values: number[]) =>
      values.every((value) => value >= domain[0] && value <= domain[1]);
    const winRates = [0, 29, 33.3, 100];
    const winRateDomain: [number, number] = [0, 100];
    const profitFactors = [0.2, 1.1, 2.24, 21.96];
    const profitFactorDomain = nonNegativeDomain(
      Math.min(...profitFactors),
      Math.max(...profitFactors),
    );

    expect(containsAll(winRateDomain, winRates)).toBe(true);
    expect(profitFactorDomain[0]).toBe(0);
    expect(containsAll(profitFactorDomain, profitFactors)).toBe(true);

    const positive = nonNegativeDomain(2, 9);
    expect(positive[0]).toBe(0);
    expect(containsAll(positive, [2, 9])).toBe(true);

    const negativeOnly = nonNegativeDomain(-9, -4);
    expect(negativeOnly[0]).toBeLessThan(-9);
    expect(negativeOnly[1]).toBeGreaterThan(-4);

    const mixedSigned = nonNegativeDomain(-2, 4);
    expect(mixedSigned[0]).toBeLessThan(-2);
    expect(mixedSigned[1]).toBeGreaterThan(4);

    expect(nonNegativeDomain(0, 0)).toEqual([0, 1]);
    expect(nonNegativeDomain(7, 7)).toEqual([0, 7.35]);
    expect(nonNegativeDomain(Infinity, -Infinity)).toEqual([0, 1]);

    const fractional = nonNegativeDomain(0.00001, 0.00002);
    expect(fractional[0]).toBe(0);
    expect(containsAll(fractional, [0.00001, 0.00002])).toBe(true);

    const assetPriceDomain = niceDomain(60_000, 80_000);
    expect(assetPriceDomain[0]).toBeGreaterThan(0);
    expect(containsAll(assetPriceDomain, [60_000, 80_000])).toBe(true);
    expect(containsAll(niceDomain(-15, -2), [-15, -2])).toBe(true);
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
