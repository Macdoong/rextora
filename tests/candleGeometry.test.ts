import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  BODY_FILL_RATIO,
  BODY_STROKE_PX,
  MIN_BODY_GAP_PX,
  MIN_CANDLE_BODY_HEIGHT_PX,
  MIN_CANDLE_BODY_PX,
  MIN_WICK_PX,
  MAX_WICK_PX,
  PREFERRED_BODY_MAX_PX,
  PREFERRED_BODY_MIN_PX,
  PRICE_DOMAIN_PAD,
  computeCandleGeometry,
  defaultVisibleCandleTarget,
  candleDensityTier,
  snapPx,
} from "../src/lib/rextora/backtest/candleGeometry";

describe("TradingView-reference candle density", () => {
  it("matches TV body/wick/fill band", () => {
    expect(MIN_CANDLE_BODY_PX).toBe(10);
    expect(PREFERRED_BODY_MIN_PX).toBe(10);
    expect(PREFERRED_BODY_MAX_PX).toBe(14);
    expect(MIN_WICK_PX).toBe(2);
    expect(MAX_WICK_PX).toBe(3);
    expect(BODY_FILL_RATIO).toBeGreaterThanOrEqual(0.75);
    expect(BODY_FILL_RATIO).toBeLessThanOrEqual(0.85);
    expect(BODY_STROKE_PX).toBe(1);
    expect(MIN_CANDLE_BODY_HEIGHT_PX).toBeGreaterThanOrEqual(3);
    expect(PRICE_DOMAIN_PAD).toBeLessThanOrEqual(0.08);
  });

  it("default desktop visible count is 55–75", () => {
    for (const plot of [900, 1046, 1100, 1200, 1600]) {
      const n = defaultVisibleCandleTarget(plot, 500);
      expect(n).toBeGreaterThanOrEqual(55);
      expect(n).toBeLessThanOrEqual(75);
      expect(candleDensityTier(plot)).toBe(2);
    }
  });

  it("default tablet visible count is 40–55", () => {
    for (const plot of [480, 600, 768, 899]) {
      const n = defaultVisibleCandleTarget(plot, 500);
      expect(n).toBeGreaterThanOrEqual(40);
      expect(n).toBeLessThanOrEqual(55);
      expect(candleDensityTier(plot)).toBe(1);
    }
  });

  it("default mobile visible count is 28–40", () => {
    for (const plot of [280, 320, 360, 479]) {
      const n = defaultVisibleCandleTarget(plot, 500);
      expect(n).toBeGreaterThanOrEqual(28);
      expect(n).toBeLessThanOrEqual(40);
      expect(candleDensityTier(plot)).toBe(0);
    }
  });

  it("desktop default body is 10–14px with 75–85% occupancy", () => {
    const plot = 1100;
    const n = defaultVisibleCandleTarget(plot, 500);
    const g = computeCandleGeometry(plot, n);
    expect(n).toBeGreaterThanOrEqual(55);
    expect(n).toBeLessThanOrEqual(75);
    expect(g.bodyWidth).toBeGreaterThanOrEqual(10);
    expect(g.bodyWidth).toBeLessThanOrEqual(14);
    expect(g.occupancy).toBeGreaterThanOrEqual(0.75 - 1e-6);
    expect(g.occupancy).toBeLessThanOrEqual(0.85 + 1e-6);
    expect(g.wickWidth).toBeGreaterThanOrEqual(MIN_WICK_PX);
    expect(g.wickWidth).toBeLessThanOrEqual(MAX_WICK_PX);
    expect(g.gap).toBeGreaterThanOrEqual(MIN_BODY_GAP_PX - 0.5);
  });

  it("never overlaps adjacent candles across zoom levels", () => {
    for (const plot of [320, 768, 1366, 1536, 1920]) {
      for (const count of [30, 55, 70, 100, 300]) {
        const g = computeCandleGeometry(plot, count);
        expect(g.bodyWidth).toBeLessThanOrEqual(g.slot + 1e-9);
        expect(g.bodyWidth + g.gap).toBeCloseTo(g.slot, 5);
        expect(g.gap).toBeGreaterThan(0);
        expect(g.bodyWidth).toBeLessThan(g.slot);
      }
    }
  });

  it("snapPx avoids half-pixel positions", () => {
    expect(snapPx(10.4)).toBe(10);
    expect(snapPx(10.5)).toBe(11);
  });

  it("caps to available data when series is short", () => {
    expect(defaultVisibleCandleTarget(1100, 20)).toBe(20);
  });
});

describe("chart shell contracts for range reset", () => {
  it("전체 보기 and 기본 구간 remain wired; seriesKey resets zoom", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/charts/ChartShell.tsx"),
      "utf8",
    );
    expect(src).toContain("전체 보기");
    expect(src).toContain("기본 구간");
    expect(src).toContain('data-testid="chart-fit-all"');
    expect(src).toContain('data-testid="chart-reset-default"');
    expect(src).toContain("seriesKey");
    expect(src).toContain("setZoomInitialized(false)");
    expect(src).toContain("defaultVisibleCandleTarget");
    // Deep zoom: min span is 1/n candles via clampZoomSpan
    expect(src).toContain("minZoomSpan");
    expect(src).toContain("clampZoomSpan");
    expect(src).toContain("chart-tooltip-rows");
  });

  it("volume bars share candle body width; doji min height used", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/charts/CandlestickChart.tsx"),
      "utf8",
    );
    expect(src).toContain('data-testid="volume-bar"');
    expect(src).toContain("width={candleW}");
    expect(src).toContain("computeCandleGeometry");
    expect(src).toContain("BODY_STROKE_PX");
    expect(src).toContain("MIN_CANDLE_BODY_HEIGHT_PX");
    expect(src).toContain("snapPx");
    expect(src).toContain("candle-plot-hit");
    expect(src).toContain("marker-hit-target");
    expect(src).toContain("marker-kind-label");
    expect(src).toContain("rx={0}");
    expect(src).toContain("shapeRendering=\"crispEdges\"");
  });

  it("deep zoom grows candle bodies past the default 14px band", () => {
    const g = computeCandleGeometry(1100, 8);
    expect(g.bodyWidth).toBeGreaterThan(14);
    expect(g.cornerRadius).toBe(0);
  });

  it("SAFE hash remains 7893ca3f0e30", () => {
    const safe = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json"),
        "utf8",
      ),
    );
    expect(safe.params_hash).toBe("7893ca3f0e30");
  });
});
