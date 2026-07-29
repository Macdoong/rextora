import type { OhlcvCandle } from "../../data/ohlcvTypes";
import {
  computeOrderBlockZoneBounds,
  resolveOrderBlockZoneBasis,
  type OrderBlockZoneBasis,
} from "./orderBlockZoneBasis";

export type OrderBlockRejectCode =
  | "source_body_too_small"
  | "source_body_quality_low"
  | "displacement_body_too_small"
  | "body_engulf_failed"
  | "zone_height_too_small"
  | "zone_height_too_large"
  | "structure_break_failed"
  | "volume_expansion_failed";

export interface OrderBlockParams {
  bodyOnly: boolean;
  zoneBasis?: OrderBlockZoneBasis;
  wickExtensionPct?: number;
  minImpulseAtrMult: number;
  minImpulsePct: number;
  minVolumeMult: number;
  maxAgeBars: number;
  mitigationPct: number;
  firstTouchOnly: boolean;
  retestAllowed: boolean;
  entryInsideBlock: boolean;
  invalidateOnCloseBeyond: boolean;
  /**
   * When true (new strategies), apply institutional quality / engulf / zone-size
   * guards. Legacy strategies omit this and keep historical behavior.
   */
  institutionalQuality?: boolean;
  requireBodyEngulf?: boolean;
  minBodyEngulfPct?: number;
  minDisplacementBodyMult?: number;
  minSourceBodyPct?: number;
  minSourceBodyAtrMult?: number;
  minSourceBodyRangeRatio?: number;
  maxSourceUpperWickPct?: number;
  maxSourceLowerWickPct?: number;
  minImpulseBodyRangeRatio?: number;
  minZoneHeightPct?: number;
  minZoneHeightAtrMult?: number;
  maxZoneHeightAtrMult?: number;
  requireStructureBreak?: boolean;
  structureBreakLookback?: number;
}

export interface OrderBlockZone {
  start: number;
  end: number;
  high: number;
  low: number;
  side: "bullish" | "bearish";
  createdAt: number;
  touched: boolean;
  mitigated: boolean;
}

export type OrderBlockEvidenceScalar = number | boolean | string | null;

export interface OrderBlockDetectionResult {
  hit: boolean;
  zone: OrderBlockZone | null;
  rejectReason: OrderBlockRejectCode | null;
  measuredValues: Record<string, OrderBlockEvidenceScalar>;
  thresholds: Record<string, OrderBlockEvidenceScalar>;
  sourceBar: number | null;
  impulseBar: number | null;
}

function bodySize(c: Pick<OhlcvCandle, "open" | "close">): number {
  return Math.abs(c.close - c.open);
}

function fullRange(c: Pick<OhlcvCandle, "high" | "low">): number {
  return Math.max(c.high - c.low, 1e-9);
}

function bodyRangeRatio(c: OhlcvCandle): number {
  return bodySize(c) / fullRange(c);
}

function upperWickPct(c: OhlcvCandle): number {
  const bodyHigh = Math.max(c.open, c.close);
  return (Math.max(0, c.high - bodyHigh) / fullRange(c)) * 100;
}

function lowerWickPct(c: OhlcvCandle): number {
  const bodyLow = Math.min(c.open, c.close);
  return (Math.max(0, bodyLow - c.low) / fullRange(c)) * 100;
}

function bodyEngulfPct(
  side: "bullish" | "bearish",
  source: OhlcvCandle,
  impulse: OhlcvCandle,
): number {
  const srcHigh = Math.max(source.open, source.close);
  const srcLow = Math.min(source.open, source.close);
  const srcBody = Math.max(srcHigh - srcLow, 1e-9);
  if (side === "bullish") {
    // How far impulse close cleared the source body high, as % of source body.
    return ((impulse.close - srcHigh) / srcBody) * 100;
  }
  return ((srcLow - impulse.close) / srcBody) * 100;
}

function structureBroken(
  candles: OhlcvCandle[],
  impulseBar: number,
  side: "bullish" | "bearish",
  lookback: number,
): boolean {
  const from = Math.max(0, impulseBar - lookback);
  const window = candles.slice(from, impulseBar);
  if (!window.length) return false;
  const impulse = candles[impulseBar]!;
  if (side === "bullish") {
    const swingHigh = Math.max(...window.map((c) => c.high));
    return impulse.close > swingHigh;
  }
  const swingLow = Math.min(...window.map((c) => c.low));
  return impulse.close < swingLow;
}

/**
 * Exact OB rules (deterministic):
 * 1. Scan back from `bar` within maxAgeBars.
 * 2. Impulse body vs ATR / pct (legacy) OR institutional displacement/engulf when enabled.
 * 3. Bullish OB = last bearish candle immediately before a bullish impulse.
 * 4. Bearish OB = last bullish candle immediately before a bearish impulse.
 * 5. Zone range from zoneBasis (BODY / FULL_CANDLE / BODY_PLUS_WICK_PERCENT).
 * Legacy strategies without institutionalQuality keep prior acceptance behavior.
 */
export function detectOrderBlocks(
  candles: OhlcvCandle[],
  bar: number,
  atr: number,
  side: "bullish" | "bearish",
  params: OrderBlockParams,
): OrderBlockDetectionResult {
  const empty: OrderBlockDetectionResult = {
    hit: false,
    zone: null,
    rejectReason: null,
    measuredValues: {},
    thresholds: {},
    sourceBar: null,
    impulseBar: null,
  };
  if (bar < 5) return empty;

  const volLook = 20;
  const vols = candles.slice(Math.max(0, bar - volLook), bar).map((c) => c.volume);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  const institutional = params.institutionalQuality === true;
  const atrSafe = Math.max(atr, 1e-9);

  let lastReject: OrderBlockDetectionResult | null = null;
  const startScan = Math.max(2, bar - params.maxAgeBars);

  for (let i = bar - 1; i >= startScan; i -= 1) {
    const impulse = candles[i]!;
    const source = candles[i - 1]!;
    const impulseBody = bodySize(impulse);
    const sourceBody = bodySize(source);
    const impulsePct = impulseBody / Math.max(impulse.close, 1e-9);
    const volMult = avgVol > 0 ? impulse.volume / avgVol : null;

    const bullishImpulse = impulse.close > impulse.open;
    const bearishImpulse = impulse.close < impulse.open;
    const bullishSource = source.close > source.open;
    const bearishSource = source.close < source.open;

    const structureOk =
      (side === "bullish" && bullishImpulse && bearishSource) ||
      (side === "bearish" && bearishImpulse && bullishSource);
    if (!structureOk) continue;

    // Legacy impulse gate (always applied as baseline).
    const impulseOk =
      impulseBody >= params.minImpulseAtrMult * atrSafe ||
      impulsePct >= params.minImpulsePct / 100;
    const volOk = avgVol <= 0 || impulse.volume >= avgVol * params.minVolumeMult;
    if (!impulseOk || !volOk) {
      if (institutional && !volOk) {
        lastReject = {
          hit: false,
          zone: null,
          rejectReason: "volume_expansion_failed",
          measuredValues: { volumeMult: volMult, impulseBody },
          thresholds: { minVolumeMult: params.minVolumeMult },
          sourceBar: i - 1,
          impulseBar: i,
        };
      }
      continue;
    }

    const zoneBasis = resolveOrderBlockZoneBasis(params);
    const wickPct = params.wickExtensionPct ?? 0;
    const { high, low } = computeOrderBlockZoneBounds(source, zoneBasis, wickPct);
    const zoneHeight = Math.max(high - low, 0);
    const mid = (high + low) / 2 || 1;
    const zoneHeightPct = (zoneHeight / mid) * 100;
    const displacementMult = sourceBody > 0 ? impulseBody / sourceBody : null;
    const engulfPct = bodyEngulfPct(side, source, impulse);
    const srcBodyPct = (sourceBody / Math.max(source.close, 1e-9)) * 100;
    const srcBodyAtr = sourceBody / atrSafe;
    const srcBodyRange = bodyRangeRatio(source);
    const impBodyRange = bodyRangeRatio(impulse);
    const srcUpperWick = upperWickPct(source);
    const srcLowerWick = lowerWickPct(source);

    const measuredValues: Record<string, OrderBlockEvidenceScalar> = {
      sourceBody,
      impulseBody,
      displacementBodyMult: displacementMult,
      bodyEngulfPct: engulfPct,
      sourceBodyPct: srcBodyPct,
      sourceBodyAtrMult: srcBodyAtr,
      sourceBodyRangeRatio: srcBodyRange,
      sourceUpperWickPct: srcUpperWick,
      sourceLowerWickPct: srcLowerWick,
      impulseBodyRangeRatio: impBodyRange,
      impulseAtrMult: impulseBody / atrSafe,
      impulsePct: impulsePct * 100,
      volumeMult: volMult,
      zoneHeight,
      zoneHeightPct,
      zoneHeightAtrMult: zoneHeight / atrSafe,
      zoneBasis,
    };

    if (institutional) {
      const minSrcPct = params.minSourceBodyPct ?? 0;
      const minSrcAtr = params.minSourceBodyAtrMult ?? 0;
      if (srcBodyPct < minSrcPct || srcBodyAtr < minSrcAtr) {
        lastReject = {
          hit: false,
          zone: null,
          rejectReason: "source_body_too_small",
          measuredValues,
          thresholds: {
            minSourceBodyPct: minSrcPct,
            minSourceBodyAtrMult: minSrcAtr,
          },
          sourceBar: i - 1,
          impulseBar: i,
        };
        continue;
      }

      const minBodyRange = params.minSourceBodyRangeRatio ?? 0;
      const maxUpper = params.maxSourceUpperWickPct ?? 100;
      const maxLower = params.maxSourceLowerWickPct ?? 100;
      if (
        srcBodyRange < minBodyRange ||
        srcUpperWick > maxUpper ||
        srcLowerWick > maxLower
      ) {
        lastReject = {
          hit: false,
          zone: null,
          rejectReason: "source_body_quality_low",
          measuredValues,
          thresholds: {
            minSourceBodyRangeRatio: minBodyRange,
            maxSourceUpperWickPct: maxUpper,
            maxSourceLowerWickPct: maxLower,
          },
          sourceBar: i - 1,
          impulseBar: i,
        };
        continue;
      }

      const minDisp = params.minDisplacementBodyMult ?? 0;
      const minImpRange = params.minImpulseBodyRangeRatio ?? 0;
      if (
        (displacementMult != null && displacementMult < minDisp) ||
        impBodyRange < minImpRange
      ) {
        lastReject = {
          hit: false,
          zone: null,
          rejectReason: "displacement_body_too_small",
          measuredValues,
          thresholds: {
            minDisplacementBodyMult: minDisp,
            minImpulseBodyRangeRatio: minImpRange,
          },
          sourceBar: i - 1,
          impulseBar: i,
        };
        continue;
      }

      if (params.requireBodyEngulf !== false) {
        const minEngulf = params.minBodyEngulfPct ?? 0;
        const cleared =
          side === "bullish"
            ? impulse.close > Math.max(source.open, source.close)
            : impulse.close < Math.min(source.open, source.close);
        if (!cleared || engulfPct < minEngulf) {
          lastReject = {
            hit: false,
            zone: null,
            rejectReason: "body_engulf_failed",
            measuredValues,
            thresholds: {
              requireBodyEngulf: true,
              minBodyEngulfPct: minEngulf,
            },
            sourceBar: i - 1,
            impulseBar: i,
          };
          continue;
        }
      }

      const minZhPct = params.minZoneHeightPct ?? 0;
      const minZhAtr = params.minZoneHeightAtrMult ?? 0;
      if (zoneHeightPct < minZhPct || zoneHeight / atrSafe < minZhAtr) {
        lastReject = {
          hit: false,
          zone: null,
          rejectReason: "zone_height_too_small",
          measuredValues,
          thresholds: {
            minZoneHeightPct: minZhPct,
            minZoneHeightAtrMult: minZhAtr,
          },
          sourceBar: i - 1,
          impulseBar: i,
        };
        continue;
      }

      const maxZhAtr = params.maxZoneHeightAtrMult;
      if (maxZhAtr != null && zoneHeight / atrSafe > maxZhAtr) {
        lastReject = {
          hit: false,
          zone: null,
          rejectReason: "zone_height_too_large",
          measuredValues,
          thresholds: { maxZoneHeightAtrMult: maxZhAtr },
          sourceBar: i - 1,
          impulseBar: i,
        };
        continue;
      }

      if (params.requireStructureBreak) {
        const lookback = Math.max(2, Math.trunc(params.structureBreakLookback ?? 20));
        const broken = structureBroken(candles, i, side, lookback);
        measuredValues.structureBreak = broken;
        if (!broken) {
          lastReject = {
            hit: false,
            zone: null,
            rejectReason: "structure_break_failed",
            measuredValues,
            thresholds: {
              requireStructureBreak: true,
              structureBreakLookback: lookback,
            },
            sourceBar: i - 1,
            impulseBar: i,
          };
          continue;
        }
      }
    }

    const zone: OrderBlockZone = {
      start: i - 1,
      end: i - 1,
      high,
      low,
      side,
      createdAt: i - 1,
      touched: false,
      mitigated: false,
    };

    if (bar - zone.createdAt > params.maxAgeBars) {
      return { ...empty, rejectReason: lastReject?.rejectReason ?? null };
    }

    const c = candles[bar]!;
    const width = Math.max(zone.high - zone.low, 1e-9);

    if (params.invalidateOnCloseBeyond) {
      if (zone.side === "bullish" && c.close < zone.low) {
        return {
          hit: false,
          zone: { ...zone, mitigated: true },
          rejectReason: null,
          measuredValues,
          thresholds: {},
          sourceBar: i - 1,
          impulseBar: i,
        };
      }
      if (zone.side === "bearish" && c.close > zone.high) {
        return {
          hit: false,
          zone: { ...zone, mitigated: true },
          rejectReason: null,
          measuredValues,
          thresholds: {},
          sourceBar: i - 1,
          impulseBar: i,
        };
      }
    }

    const overlaps = c.low <= zone.high && c.high >= zone.low;
    if (!overlaps) {
      return {
        hit: false,
        zone,
        rejectReason: null,
        measuredValues,
        thresholds: {},
        sourceBar: i - 1,
        impulseBar: i,
      };
    }

    const fill =
      zone.side === "bullish"
        ? Math.max(0, zone.high - Math.min(c.low, zone.high))
        : Math.max(0, Math.max(c.high, zone.low) - zone.low);
    const mitigated = fill / width >= params.mitigationPct / 100;
    const nextZone = { ...zone, touched: true, mitigated };

    let hit: boolean = overlaps;
    if (params.entryInsideBlock) {
      hit = c.close >= zone.low && c.close <= zone.high;
    }
    if (params.firstTouchOnly && !params.retestAllowed) {
      let earlier = false;
      for (let j = zone.createdAt + 1; j < bar; j += 1) {
        const cj = candles[j]!;
        if (cj.low <= zone.high && cj.high >= zone.low) {
          earlier = true;
          break;
        }
      }
      if (earlier) hit = false;
    }

    return {
      hit,
      zone: nextZone,
      rejectReason: null,
      measuredValues,
      thresholds: {
        minImpulseAtrMult: params.minImpulseAtrMult,
        minImpulsePct: params.minImpulsePct,
        minVolumeMult: params.minVolumeMult,
        institutionalQuality: institutional,
      },
      sourceBar: i - 1,
      impulseBar: i,
    };
  }

  if (lastReject) return lastReject;
  return empty;
}
