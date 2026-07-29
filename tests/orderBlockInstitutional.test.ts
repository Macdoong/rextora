import { describe, expect, it } from "vitest";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import { detectOrderBlocks } from "../src/lib/rextora/strategy/conditions/orderBlock";
import { formatRejectionReasonKo } from "../src/lib/rextora/backtest/patternExplainability";

function c(
  i: number,
  o: number,
  h: number,
  l: number,
  cl: number,
  volume = 1000,
): OhlcvCandle {
  const t = Date.UTC(2024, 0, 1) + i * 900_000;
  return {
    openTime: t,
    open: o,
    high: h,
    low: l,
    close: cl,
    volume,
    closeTime: t + 899_999,
  };
}

/** Flat warm-up so ATR/volume averages are stable. */
function warm(n = 30): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < n; i += 1) {
    const px = 100 + (i % 3) * 0.05;
    out.push(c(i, px, px + 0.2, px - 0.2, px + 0.05, 1000));
  }
  return out;
}

const BASE = {
  bodyOnly: true,
  zoneBasis: "BODY" as const,
  minImpulseAtrMult: 0.1,
  minImpulsePct: 0.01,
  minVolumeMult: 0.1,
  maxAgeBars: 40,
  mitigationPct: 50,
  firstTouchOnly: false,
  retestAllowed: true,
  entryInsideBlock: false,
  invalidateOnCloseBeyond: false,
};

describe("institutional Order Block quality gates", () => {
  it("legacy mode still accepts tiny source body (no institutionalQuality)", () => {
    const candles = [
      ...warm(30),
      c(30, 100, 100.3, 99.7, 99.95, 1200), // tiny bearish source body 0.05
      c(31, 99.95, 105, 99.9, 104.5, 8000), // large bullish impulse
      c(32, 104.5, 105, 104, 104.8, 2000),
    ];
    const det = detectOrderBlocks(candles, 32, 1, "bullish", BASE);
    expect(det.zone).not.toBeNull();
    expect(det.zone!.high - det.zone!.low).toBeCloseTo(0.05, 5);
    expect(det.rejectReason).toBeNull();
  });

  it("rejects source_body_too_small under institutionalQuality", () => {
    const candles = [
      ...warm(30),
      c(30, 100, 100.3, 99.7, 99.95, 1200),
      c(31, 99.95, 105, 99.9, 104.5, 8000),
      c(32, 104.5, 105, 104, 104.8, 2000),
    ];
    const det = detectOrderBlocks(candles, 32, 1, "bullish", {
      ...BASE,
      institutionalQuality: true,
      minSourceBodyPct: 0.2,
      minSourceBodyAtrMult: 0.5,
      minDisplacementBodyMult: 1,
      requireBodyEngulf: true,
      minBodyEngulfPct: 0,
      minSourceBodyRangeRatio: 0,
      maxSourceUpperWickPct: 100,
      maxSourceLowerWickPct: 100,
      minImpulseBodyRangeRatio: 0,
      minZoneHeightPct: 0,
      minZoneHeightAtrMult: 0,
    });
    expect(det.zone).toBeNull();
    expect(det.rejectReason).toBe("source_body_too_small");
    expect(formatRejectionReasonKo("source_body_too_small")).toBe(
      "기준 몸통 부족",
    );
  });

  it("rejects body_engulf_failed when impulse does not clear source body", () => {
    const candles = [
      ...warm(30),
      // meaningful bearish source body [98, 100]
      c(30, 100, 100.5, 97.5, 98, 2000),
      // bullish impulse that does NOT close above source body high 100
      c(31, 98.1, 99.8, 97.9, 99.5, 8000),
      c(32, 99.5, 100, 99, 99.7, 2000),
    ];
    const det = detectOrderBlocks(candles, 32, 1, "bullish", {
      ...BASE,
      institutionalQuality: true,
      minSourceBodyPct: 0.01,
      minSourceBodyAtrMult: 0.01,
      // Isolate engulf: allow small displacement body so close-clear fails first.
      minDisplacementBodyMult: 0.01,
      requireBodyEngulf: true,
      minBodyEngulfPct: 0,
      minSourceBodyRangeRatio: 0.2,
      maxSourceUpperWickPct: 100,
      maxSourceLowerWickPct: 100,
      minImpulseBodyRangeRatio: 0.2,
      minZoneHeightPct: 0.01,
      minZoneHeightAtrMult: 0.01,
    });
    expect(det.rejectReason).toBe("body_engulf_failed");
    expect(formatRejectionReasonKo("body_engulf_failed")).toBe("몸통 장악 실패");
  });

  it("accepts institutional BODY zone when engulf and size pass", () => {
    const candles = [
      ...warm(30),
      c(30, 100, 100.4, 97.8, 98, 2000), // source body height 2
      c(31, 98.1, 106, 97.9, 105, 9000), // impulse clears 100, body ~7
      c(32, 105, 106, 104.5, 105.5, 2000),
    ];
    const det = detectOrderBlocks(candles, 32, 1, "bullish", {
      ...BASE,
      institutionalQuality: true,
      zoneBasis: "BODY",
      minSourceBodyPct: 0.05,
      minSourceBodyAtrMult: 0.1,
      minDisplacementBodyMult: 2,
      requireBodyEngulf: true,
      minBodyEngulfPct: 0,
      minSourceBodyRangeRatio: 0.3,
      maxSourceUpperWickPct: 80,
      maxSourceLowerWickPct: 80,
      minImpulseBodyRangeRatio: 0.4,
      minZoneHeightPct: 0.05,
      minZoneHeightAtrMult: 0.1,
      maxZoneHeightAtrMult: 10,
    });
    expect(det.rejectReason).toBeNull();
    expect(det.zone).not.toBeNull();
    expect(det.zone!.high).toBe(100);
    expect(det.zone!.low).toBe(98);
    expect(det.measuredValues.displacementBodyMult).toBeGreaterThanOrEqual(2);
    expect(Number(det.measuredValues.bodyEngulfPct)).toBeGreaterThan(0);
  });

  it("maps zone_height_too_small rejection to Korean", () => {
    expect(formatRejectionReasonKo("zone_height_too_small")).toBe("존 높이 부족");
    expect(formatRejectionReasonKo("displacement_body_too_small")).toBe(
      "충격 몸통 부족",
    );
  });
});
