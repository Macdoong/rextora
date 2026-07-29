/**
 * Event-sequence backtest executor.
 * Walks completed candles only (no look-ahead). Does not modify SAFE_v44.
 *
 * Assumptions (returned as assumptionsKo):
 * - Only completed OHLC bars; at bar i detectors see candles[0..i].
 * - Same-candle stop/target ambiguity: stop is preferred (conservative).
 * - Pattern geometry comes from condition detectors (OB/FVG/TL/SR).
 */

import type { OhlcvCandle } from "../data/ohlcvTypes";
import type { BacktestTrade } from "../backtest/backtestEngine";
import { computeAtrSeries } from "../indicator/indicatorEngine";
import {
  detectOrderBlocks,
  type OrderBlockParams,
} from "./conditions/orderBlock";
import { resolveOrderBlockZoneBasis } from "./conditions/orderBlockZoneBasis";
import { detectFvg, type FvgParams } from "./conditions/fvg";
import {
  detectTrendLine,
  type TrendLineParams,
} from "./conditions/trendLine";
import {
  detectSupportResistance,
  type SrParams,
} from "./conditions/supportResistance";
import {
  detectSupplyDemand,
  type SupplyDemandParams,
} from "./conditions/supplyDemand";
import type { CanonicalStrategyDefinition } from "./definition/types";
import {
  normalizePatternBlockRole,
  validateEventSequence,
  type PatternFamily,
  type StrategyEventSequence,
  type StrategyEventStep,
} from "./definition/eventSequence";
import {
  EntryTriggerValidationError,
  resolveEntryTrigger,
  validateEntryTriggerParams,
  validateEntryZoneAtExecution,
} from "./definition/entryTrigger";
import { resolveEventSequenceLeverage } from "../strategySearch/leverageMode";

export type EvidenceScalar = number | string | boolean | null;

export interface PatternLineAnchor {
  bar: number;
  price: number;
  time?: string | null;
}

export interface RejectedSetup {
  bar: number;
  at?: string | null;
  eventPrice?: number | null;
  stage?: string;
  reasonCode: string;
  patternType: string;
  measured: number | null;
  required: number | null;
  detectorParams?: Record<string, EvidenceScalar>;
  measuredValues?: Record<string, EvidenceScalar>;
  thresholds?: Record<string, EvidenceScalar>;
  zoneHigh?: number | null;
  zoneLow?: number | null;
  lineAnchors?: PatternLineAnchor[] | null;
  creationBar?: number | null;
  creationTime?: string | null;
  revisitBar?: number | null;
  revisitTime?: string | null;
  breakBar?: number | null;
  breakTime?: string | null;
  confirmationBar?: number | null;
  confirmationTime?: string | null;
  invalidationBar?: number | null;
  invalidationTime?: string | null;
  patternBlocks?: PatternBlockEvidence[];
  combinationOperator?: string;
  combinationFailurePolicy?: string;
  combinationInvalidationMode?: string;
  combinationResult?: boolean;
  combinationScore?: number;
  combinationPriority?: number | null;
}

export interface PatternBlockEvidence {
  blockId: string;
  family: string;
  role: string;
  order: number;
  status: "detected" | "missing" | "failed" | "optional_skipped";
  patternType: string;
  zoneHigh: number | null;
  zoneLow: number | null;
  creationBar: number | null;
  creationTime?: string | null;
  revisitBar?: number | null;
  revisitTime?: string | null;
  breakBar?: number | null;
  breakTime?: string | null;
  confirmationBar?: number | null;
  confirmationTime?: string | null;
  invalidationBar?: number | null;
  invalidationTime?: string | null;
  entryBar?: number | null;
  entryTime?: string | null;
  measured: number | null;
  threshold: number | null;
  detectorParams: Record<string, EvidenceScalar>;
  measuredValues: Record<string, EvidenceScalar>;
  thresholds: Record<string, EvidenceScalar>;
  required: boolean;
  weight: number;
  priority: number;
  operatorPassed?: boolean;
  scoreContribution?: number;
  scoreTotal?: number;
  scoreThreshold?: number | null;
  selectedPriority?: number | null;
  operator?: string;
  stage?: string;
  reasonCode?: string | null;
  touchCount?: number | null;
  lineAnchors?: PatternLineAnchor[] | null;
  stopPrice?: number | null;
  targetPrice?: number | null;
  exitPrice?: number | null;
  exitBar?: number | null;
  exitTime?: string | null;
  exitReason?: string | null;
}

export type EventSequenceTrade = BacktestTrade & {
  stopPrice?: number;
  takeProfitPrice?: number;
  patternType?: string;
  zoneHigh?: number;
  zoneLow?: number;
  creationBar?: number;
  revisitBar?: number;
  confirmationBar?: number;
  breakBar?: number;
  invalidationBar?: number;
  penetrationPct?: number;
  creationCandleTime?: string;
  revisitCandleTime?: string;
  confirmationCandleTime?: string;
  breakCandleTime?: string;
  invalidationCandleTime?: string;
  lineAnchors?: PatternLineAnchor[];
  /** Every configured combination block (never reduced to one primary). */
  patternBlocks?: PatternBlockEvidence[];
  combinationOperator?: string;
  combinationResult?: boolean;
  combinationScore?: number;
  combinationPriority?: number | null;
};

export interface EventSequenceBacktestResult {
  trades: EventSequenceTrade[];
  equityCurve: number[];
  endingBalance: number;
  rejectedSetups: RejectedSetup[];
  assumptionsKo: string[];
}

type Phase =
  | "idle"
  | "pattern_created"
  | "revisited"
  | "penetrated"
  | "confirmed"
  | "entry_ready"
  | "in_position";

interface PatternGeometry {
  patternType: string;
  zoneHigh: number;
  zoneLow: number;
  creationBar: number;
  revisitBar?: number;
  confirmationBar?: number;
  breakBar?: number;
  invalidationBar?: number;
  penetrationPct?: number;
  lineAnchors?: PatternLineAnchor[];
}

interface SideMachine {
  side: "LONG" | "SHORT";
  phase: Phase;
  geo: PatternGeometry | null;
  entryBar?: number;
  entryPrice?: number;
  stop?: number;
  tp?: number;
  leverage?: number;
  /** Multi-candle confirmation progress (reset on idle). */
  confirmHits?: number;
  confirmWindowStart?: number | null;
  /** Sequence progress for combination.operator === "sequence". */
  sequenceNextOrder?: number;
  blockEvidence?: PatternBlockEvidence[];
  combinationScore?: number;
  combinationPriority?: number | null;
}

const ASSUMPTIONS_KO = [
  "완료 봉(OHLC)만 사용하며, 봉 i에서는 candles[0..i]만 참조합니다 (미래 봉 미사용).",
  "동일 봉에서 손절가와 익절가에 모두 닿으면 손절을 우선합니다 (보수적).",
  "패턴 기하(존/라인)는 조건 감지기(OB/FVG/추세선/지지저항) 결과에서만 채웁니다.",
];

function stepByKind(
  seq: StrategyEventSequence,
  kind: StrategyEventStep["kind"],
): StrategyEventStep | undefined {
  return seq.steps.find((s) => s.kind === kind);
}

function numParam(
  step: StrategyEventStep | undefined,
  key: string,
  fallback: number,
): number {
  const v = step?.params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function strParam(
  step: StrategyEventStep | undefined,
  key: string,
  fallback: string,
): string {
  const v = step?.params?.[key];
  return typeof v === "string" ? v : fallback;
}

function boolParam(
  step: StrategyEventStep | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const v = step?.params?.[key];
  return typeof v === "boolean" ? v : fallback;
}

function candleTimeIso(c: OhlcvCandle | undefined): string | undefined {
  if (!c) return undefined;
  return new Date(c.openTime).toISOString();
}

function zoneWidth(high: number, low: number): number {
  return Math.max(high - low, 1e-9);
}

/** Penetration depth into zone as fraction of width (0..1+). */
function measurePenetration(
  c: OhlcvCandle,
  zoneHigh: number,
  zoneLow: number,
  side: "LONG" | "SHORT",
): number {
  const w = zoneWidth(zoneHigh, zoneLow);
  if (side === "LONG") {
    // How deep price wicked below zone high into the block
    return Math.max(0, zoneHigh - Math.min(c.low, zoneHigh)) / w;
  }
  return Math.max(0, Math.max(c.high, zoneLow) - zoneLow) / w;
}

/** Persist USDT ledger fields so UI metrics match pnlPct / equity update. */
function eventSequenceLedger(input: {
  equityBefore: number;
  baseBalancePct: number;
  leverage: number;
  entryPrice: number;
  raw: number;
  feePct: number;
  slipPct: number;
  pnlPctStored: number;
}): {
  marginUsdt: number;
  quantity: number;
  feeCostUsdt: number;
  slippageCostUsdt: number;
  grossPnlUsdt: number;
  netPnlUsdt: number;
} {
  const margin = Math.max(
    0,
    input.equityBefore * input.baseBalancePct,
  );
  const quantity =
    margin > 0 && input.entryPrice > 0
      ? (margin * input.leverage) / input.entryPrice
      : 0;
  return {
    marginUsdt: Number(margin.toFixed(6)),
    quantity: Number(quantity.toFixed(8)),
    feeCostUsdt: Number(
      (margin * input.feePct * input.leverage).toFixed(6),
    ),
    slippageCostUsdt: Number(
      (margin * input.slipPct * input.leverage).toFixed(6),
    ),
    grossPnlUsdt: Number(
      (margin * input.raw * input.leverage).toFixed(6),
    ),
    netPnlUsdt: Number((margin * input.pnlPctStored).toFixed(6)),
  };
}

function touchesZone(
  c: OhlcvCandle,
  zoneHigh: number,
  zoneLow: number,
): boolean {
  return c.low <= zoneHigh && c.high >= zoneLow;
}

function defaultObParams(maxAgeBars: number): OrderBlockParams {
  return {
    bodyOnly: true,
    minImpulseAtrMult: 0.4,
    minImpulsePct: 0.25,
    minVolumeMult: 0.5,
    maxAgeBars,
    mitigationPct: 999,
    firstTouchOnly: false,
    retestAllowed: true,
    entryInsideBlock: false,
    invalidateOnCloseBeyond: false,
  };
}

function defaultFvgParams(maxAgeBars: number): FvgParams {
  return {
    minGapAbs: 0,
    minGapPct: 0.05,
    atrRelativeMult: 0.15,
    partialFillPct: 1,
    fullFillInvalidates: false,
    maxAgeBars,
    firstTouchOnly: false,
    entryInsideGap: false,
    invalidateOnCloseThrough: false,
  };
}

function defaultTlParams(maxAgeBars: number): TrendLineParams {
  return {
    minPivotCount: 2,
    minTouchCount: 2,
    slopeMin: 0,
    slopeMax: 1e9,
    tolerancePct: 0.35,
    breakoutByClose: false,
    breakoutByWick: false,
    confirmationCandles: 0,
    retestRequired: false,
    maxAgeBars,
  };
}

function defaultSrParams(lookback: number): SrParams {
  return {
    lookback,
    minTouches: 2,
    tolerancePct: 0.35,
    zoneWidthPct: 0.25,
    volumeConfirmation: false,
    breakoutConfirmation: false,
    maxAgeBars: lookback,
  };
}

interface DetectedPattern {
  patternType: string;
  zoneHigh: number;
  zoneLow: number;
  creationBar: number;
  lineAnchors?: PatternLineAnchor[];
  detectorParams: Record<string, EvidenceScalar>;
  measuredValues: Record<string, EvidenceScalar>;
  thresholds: Record<string, EvidenceScalar>;
  touchCount?: number | null;
}

interface PatternDetectionReject {
  rejected: true;
  reasonCode: string;
  patternType: string;
  detectorParams: Record<string, EvidenceScalar>;
  measuredValues: Record<string, EvidenceScalar>;
  thresholds: Record<string, EvidenceScalar>;
  zoneHigh: number | null;
  zoneLow: number | null;
  creationBar: number | null;
  impulseBar: number | null;
}

function isPatternReject(
  v: DetectedPattern | PatternDetectionReject | null,
): v is PatternDetectionReject {
  return Boolean(v && "rejected" in v && v.rejected);
}

/**
 * Detect a pattern using only candles[0..bar] (caller must slice).
 * @param requireFresh when true (primary creation), zone must form on/near bar.
 *   Combination presence checks use requireFresh=false within lookback age.
 */
function detectPatternAt(
  family: PatternFamily | undefined,
  candles: OhlcvCandle[],
  bar: number,
  atr: number,
  side: "LONG" | "SHORT",
  creationStep: StrategyEventStep | undefined,
  requireFresh = true,
): DetectedPattern | PatternDetectionReject | null {
  const lookback = numParam(creationStep, "lookback", 40);
  const maxAge = Math.max(
    2,
    Math.trunc(numParam(creationStep, "maxAgeBars", lookback)),
  );
  const dirParam = strParam(
    creationStep,
    "direction",
    side === "LONG" ? "bullish" : "bearish",
  );
  const obSide = dirParam === "bearish" ? "bearish" : "bullish";
  const fam = family ?? "order_block";

  if (fam === "order_block") {
    const zoneBasis = resolveOrderBlockZoneBasis({
      zoneBasis: creationStep?.params?.zoneBasis,
      bodyOnly: boolParam(creationStep, "bodyOnly", true),
    });
    const wickExtensionPct = numParam(creationStep, "wickExtensionPct", 25);
    const institutionalQuality = boolParam(
      creationStep,
      "institutionalQuality",
      false,
    );
    const detectorParams: Record<string, EvidenceScalar> = {
      ...defaultObParams(maxAge),
      zoneBasis,
      wickExtensionPct,
      bodyOnly: zoneBasis === "BODY",
      institutionalQuality,
      minImpulseAtrMult: numParam(creationStep, "minImpulseAtrMult", 0.8),
      minImpulsePct: numParam(creationStep, "minImpulsePct", 0.25),
      minVolumeMult: numParam(creationStep, "minVolumeMult", 0.5),
      mitigationPct: numParam(creationStep, "mitigationPct", 50),
      firstTouchOnly: boolParam(creationStep, "firstTouchOnly", false),
      retestAllowed: boolParam(creationStep, "retestAllowed", true),
      entryInsideBlock: boolParam(creationStep, "entryInsideBlock", false),
      invalidateOnCloseBeyond: boolParam(
        creationStep,
        "invalidateOnCloseBeyond",
        true,
      ),
      requireBodyEngulf: boolParam(creationStep, "requireBodyEngulf", true),
      minBodyEngulfPct: numParam(creationStep, "minBodyEngulfPct", 0),
      minDisplacementBodyMult: numParam(
        creationStep,
        "minDisplacementBodyMult",
        2,
      ),
      minSourceBodyPct: numParam(creationStep, "minSourceBodyPct", 0.05),
      minSourceBodyAtrMult: numParam(creationStep, "minSourceBodyAtrMult", 0.15),
      minSourceBodyRangeRatio: numParam(
        creationStep,
        "minSourceBodyRangeRatio",
        0.35,
      ),
      maxSourceUpperWickPct: numParam(creationStep, "maxSourceUpperWickPct", 60),
      maxSourceLowerWickPct: numParam(creationStep, "maxSourceLowerWickPct", 60),
      minImpulseBodyRangeRatio: numParam(
        creationStep,
        "minImpulseBodyRangeRatio",
        0.45,
      ),
      minZoneHeightPct: numParam(creationStep, "minZoneHeightPct", 0.08),
      minZoneHeightAtrMult: numParam(creationStep, "minZoneHeightAtrMult", 0.2),
      maxZoneHeightAtrMult: numParam(creationStep, "maxZoneHeightAtrMult", 8),
      requireStructureBreak: boolParam(
        creationStep,
        "requireStructureBreak",
        false,
      ),
      structureBreakLookback: Math.trunc(
        numParam(creationStep, "structureBreakLookback", 20),
      ),
    };
    // Legacy strategies: omit institutionalQuality → no new gates applied.
    if (!institutionalQuality) {
      delete detectorParams.requireBodyEngulf;
      delete detectorParams.minBodyEngulfPct;
      delete detectorParams.minDisplacementBodyMult;
      delete detectorParams.minSourceBodyPct;
      delete detectorParams.minSourceBodyAtrMult;
      delete detectorParams.minSourceBodyRangeRatio;
      delete detectorParams.maxSourceUpperWickPct;
      delete detectorParams.maxSourceLowerWickPct;
      delete detectorParams.minImpulseBodyRangeRatio;
      delete detectorParams.minZoneHeightPct;
      delete detectorParams.minZoneHeightAtrMult;
      delete detectorParams.maxZoneHeightAtrMult;
      delete detectorParams.requireStructureBreak;
      delete detectorParams.structureBreakLookback;
    }
    const det = detectOrderBlocks(
      candles,
      bar,
      atr,
      obSide,
      detectorParams as unknown as OrderBlockParams,
    );
    if (!det.zone) {
      if (det.rejectReason && requireFresh) {
        return {
          rejected: true,
          reasonCode: det.rejectReason,
          patternType: "order_block",
          detectorParams: { ...detectorParams },
          measuredValues: { ...det.measuredValues },
          thresholds: { ...det.thresholds },
          zoneHigh: null,
          zoneLow: null,
          creationBar: det.sourceBar,
          impulseBar: det.impulseBar,
        };
      }
      return null;
    }
    // Fresh creation: zone formed on/near this bar (impulse just completed)
    if (requireFresh && bar - det.zone.createdAt > 2) return null;
    if (!requireFresh && bar - det.zone.createdAt > maxAge) return null;
    return {
      patternType: "order_block",
      zoneHigh: det.zone.high,
      zoneLow: det.zone.low,
      creationBar: det.zone.createdAt,
      detectorParams: { ...detectorParams },
      measuredValues: { detected: 1, ...det.measuredValues },
      thresholds: {
        minImpulseAtrMult: detectorParams.minImpulseAtrMult,
        minImpulsePct: detectorParams.minImpulsePct,
        minVolumeMult: detectorParams.minVolumeMult,
        ...det.thresholds,
      },
    };
  }

  if (fam === "fvg") {
    const detectorParams: Record<string, EvidenceScalar> = {
      ...defaultFvgParams(lookback),
      atrRelativeMult: numParam(creationStep, "atrRelativeMult", 0.15),
      minGapPct: numParam(creationStep, "minGapPct", 0.05),
      minGapAbs: numParam(creationStep, "minGapAbs", 0),
      partialFillPct: numParam(creationStep, "partialFillPct", 45),
      fullFillInvalidates: boolParam(
        creationStep,
        "fullFillInvalidates",
        true,
      ),
      firstTouchOnly: boolParam(creationStep, "firstTouchOnly", false),
      entryInsideGap: boolParam(creationStep, "entryInsideGap", false),
      invalidateOnCloseThrough: boolParam(
        creationStep,
        "invalidateOnCloseThrough",
        true,
      ),
      maxAgeBars: maxAge,
    };
    const { zone } = detectFvg(
      candles,
      bar,
      atr,
      obSide,
      detectorParams as unknown as FvgParams,
    );
    if (!zone) return null;
    if (requireFresh && bar - zone.createdAt > 2) return null;
    if (!requireFresh && bar - zone.createdAt > maxAge) return null;
    return {
      patternType: "fvg",
      zoneHigh: zone.high,
      zoneLow: zone.low,
      creationBar: zone.createdAt,
      detectorParams,
      measuredValues: {
        detected: 1,
        gapSize: zone.high - zone.low,
        gapPct: zone.low !== 0 ? ((zone.high - zone.low) / zone.low) * 100 : null,
      },
      thresholds: {
        minGapAbs: detectorParams.minGapAbs,
        minGapPct: detectorParams.minGapPct,
        atrRelativeMult: detectorParams.atrRelativeMult,
      },
    };
  }

  if (fam === "trendline") {
    const kind =
      side === "LONG" ? "support_trend_line" : "resistance_trend_line";
    const detectorParams: Record<string, EvidenceScalar> = {
      ...defaultTlParams(lookback),
      slopeMin: numParam(creationStep, "slopeMin", 0),
      slopeMax: numParam(creationStep, "slopeMax", 1e9),
      tolerancePct: numParam(creationStep, "tolerancePct", 0.35),
      minTouchCount: Math.trunc(numParam(creationStep, "minTouchCount", 2)),
      minPivotCount: Math.trunc(numParam(creationStep, "minPivotCount", 2)),
      breakoutByClose: boolParam(creationStep, "breakoutByClose", false),
      breakoutByWick: boolParam(creationStep, "breakoutByWick", false),
      retestRequired: boolParam(creationStep, "retestRequired", false),
      confirmationCandles: Math.trunc(
        numParam(creationStep, "confirmationCandles", 0),
      ),
      maxAgeBars: maxAge,
    };
    const { hit, line } = detectTrendLine(
      candles,
      bar,
      kind,
      detectorParams as unknown as TrendLineParams,
    );
    if (!hit || !line) return null;
    const lo = Math.min(line.startPrice, line.endPrice);
    const hi = Math.max(line.startPrice, line.endPrice);
    const pad = Math.max((hi - lo) * 0.05, atr * 0.1, 1e-6);
    return {
      patternType: "trendline",
      zoneHigh: hi + pad,
      zoneLow: lo - pad,
      creationBar: line.endIndex,
      lineAnchors: [
        {
          bar: line.startIndex,
          price: line.startPrice,
          time: candleTimeIso(candles[line.startIndex]) ?? null,
        },
        {
          bar: line.endIndex,
          price: line.endPrice,
          time: candleTimeIso(candles[line.endIndex]) ?? null,
        },
      ],
      detectorParams,
      measuredValues: {
        detected: 1,
        slope: line.slope,
      },
      thresholds: {
        minTouchCount: detectorParams.minTouchCount,
        minPivotCount: detectorParams.minPivotCount,
        slopeMin: detectorParams.slopeMin,
        slopeMax: detectorParams.slopeMax,
        tolerancePct: detectorParams.tolerancePct,
      },
    };
  }

  if (fam === "support_resistance") {
    const kind = side === "LONG" ? "support_zone" : "resistance_zone";
    const detectorParams: Record<string, EvidenceScalar> = {
      ...defaultSrParams(lookback),
      lookback,
      minTouches: Math.trunc(numParam(creationStep, "minTouches", 2)),
      tolerancePct: numParam(creationStep, "tolerancePct", 0.35),
      zoneWidthPct: numParam(creationStep, "zoneWidthPct", 0.25),
      volumeConfirmation: boolParam(
        creationStep,
        "volumeConfirmation",
        false,
      ),
      breakoutConfirmation: boolParam(
        creationStep,
        "breakoutConfirmation",
        false,
      ),
      maxAgeBars: maxAge,
    };
    const { hit, zone } = detectSupportResistance(
      candles,
      bar,
      kind,
      detectorParams as unknown as SrParams,
    );
    if (!hit || !zone) return null;
    return {
      patternType: "support_resistance",
      zoneHigh: zone.high,
      zoneLow: zone.low,
      creationBar: zone.createdAt,
      detectorParams,
      measuredValues: { detected: 1, touchCount: zone.touches },
      thresholds: { minTouches: detectorParams.minTouches },
      touchCount: zone.touches,
    };
  }

  if (fam === "supply_demand") {
    const kind =
      strParam(
        creationStep,
        "kind",
        side === "LONG" ? "demand" : "supply",
      ) === "supply"
        ? "supply"
        : "demand";
    const detectorParams: SupplyDemandParams = {
      lookback,
      baseCandleCount: Math.trunc(
        numParam(creationStep, "baseCandleCount", 2),
      ),
      maxBaseRangeAtrMult: numParam(
        creationStep,
        "maxBaseRangeAtrMult",
        1,
      ),
      minDepartureAtrMult: numParam(
        creationStep,
        "minDepartureAtrMult",
        1,
      ),
      minDeparturePct: numParam(creationStep, "minDeparturePct", 0.3),
      zoneBodyOnly: boolParam(creationStep, "zoneBodyOnly", false),
      maxAgeBars: maxAge,
      firstTouchOnly: boolParam(creationStep, "firstTouchOnly", true),
      requireRejectionClose: boolParam(
        creationStep,
        "requireRejectionClose",
        false,
      ),
      invalidateOnCloseBeyond: boolParam(
        creationStep,
        "invalidateOnCloseBeyond",
        true,
      ),
    };
    const { zone } = detectSupplyDemand(
      candles,
      bar,
      atr,
      kind,
      detectorParams,
    );
    if (!zone) return null;
    if (requireFresh && bar - zone.departureBar > 2) return null;
    if (!requireFresh && bar - zone.departureBar > maxAge) return null;
    return {
      patternType: "supply_demand",
      zoneHigh: zone.high,
      zoneLow: zone.low,
      creationBar: zone.createdAt,
      detectorParams: { ...detectorParams },
      measuredValues: {
        detected: 1,
        departureBar: zone.departureBar,
        zoneWidth: zone.high - zone.low,
      },
      thresholds: {
        baseCandleCount: detectorParams.baseCandleCount,
        maxBaseRangeAtrMult: detectorParams.maxBaseRangeAtrMult,
        minDepartureAtrMult: detectorParams.minDepartureAtrMult,
        minDeparturePct: detectorParams.minDeparturePct,
      },
    };
  }

  // indicator / volume families: no geometric zone detector here
  return null;
}

function isInvalidated(
  c: OhlcvCandle,
  geo: PatternGeometry,
  side: "LONG" | "SHORT",
  rule: string,
): boolean {
  if (rule === "close_beyond_zone") {
    if (side === "LONG") return c.close < geo.zoneLow;
    return c.close > geo.zoneHigh;
  }
  return false;
}

function closeInDirection(c: OhlcvCandle, side: "LONG" | "SHORT"): boolean {
  return side === "LONG" ? c.close > c.open : c.close < c.open;
}

function failurePolicyTriggered(
  policy: "any" | "all" | "majority",
  failed: number,
  total: number,
): boolean {
  if (total === 0) return false;
  if (policy === "all") return failed === total;
  if (policy === "majority") return failed > total / 2;
  return failed > 0;
}

function roleMatchesFilter(
  blockRole: string,
  filterRoles: string[] | undefined,
): boolean {
  if (!filterRoles || filterRoles.length === 0) return true;
  const normalized = normalizePatternBlockRole(blockRole) ?? blockRole;
  return filterRoles.some(
    (role) =>
      role === blockRole ||
      role === normalized ||
      (normalizePatternBlockRole(role) ?? role) === normalized,
  );
}

function mergeBlockEvidence(
  existing: PatternBlockEvidence[] | undefined,
  incoming: PatternBlockEvidence[],
): PatternBlockEvidence[] {
  const map = new Map<string, PatternBlockEvidence>();
  for (const b of existing ?? []) map.set(b.blockId, { ...b });
  for (const b of incoming) {
    const prev = map.get(b.blockId);
    if (!prev) {
      map.set(b.blockId, { ...b });
      continue;
    }
    map.set(b.blockId, {
      ...prev,
      ...b,
      detectorParams: { ...prev.detectorParams, ...b.detectorParams },
      measuredValues: { ...prev.measuredValues, ...b.measuredValues },
      thresholds: { ...prev.thresholds, ...b.thresholds },
      zoneHigh: b.zoneHigh ?? prev.zoneHigh,
      zoneLow: b.zoneLow ?? prev.zoneLow,
      lineAnchors: b.lineAnchors ?? prev.lineAnchors,
      touchCount: b.touchCount ?? prev.touchCount,
      operatorPassed:
        b.operatorPassed ?? (b.status === "detected" ? true : prev.operatorPassed),
    });
  }
  return [...map.values()].sort((a, b) => a.order - b.order);
}

function evaluateCombinationBlocks(input: {
  combination: NonNullable<StrategyEventSequence["combination"]>;
  window: OhlcvCandle[];
  bar: number;
  atr: number;
  side: "LONG" | "SHORT";
  creationStep: StrategyEventStep | undefined;
  roles?: string[];
  stage?: string;
}): {
  ok: boolean;
  reasonCode: string | null;
  blocks: PatternBlockEvidence[];
  score: number;
  selectedPriority: number | null;
} {
  const sorted = [...input.combination.blocks]
    .sort((a, b) => a.order - b.order)
    .filter((block) => roleMatchesFilter(block.role, input.roles));
  if (sorted.length === 0) {
    return { ok: true, reasonCode: null, blocks: [], score: 0, selectedPriority: null };
  }
  const blocks: PatternBlockEvidence[] = [];
  for (const b of sorted) {
    const syntheticCreation: StrategyEventStep = {
      kind: "pattern_creation",
      labelKo: b.family,
      patternFamily: b.family,
      params: b.params,
    };
    // Presence within lookback — not "fresh creation at this bar".
    // Primary entry still uses requireFresh via the state machine.
    const detected = detectPatternAt(
      b.family,
      input.window,
      input.bar,
      input.atr,
      input.side,
      b.family === input.creationStep?.patternFamily
        ? input.creationStep
        : syntheticCreation,
      false,
    );
    if (detected && !isPatternReject(detected)) {
      const creationTime = candleTimeIso(input.window[detected.creationBar]) ?? null;
      const stageBar =
        input.stage === "entry_retest" ||
        input.stage === "confirmation" ||
        input.stage === "position_entry"
          ? input.bar
          : null;
      const stageTime =
        stageBar != null ? candleTimeIso(input.window[stageBar]) ?? null : null;
      blocks.push({
        blockId: b.id,
        family: b.family,
        role: b.role,
        order: b.order,
        status: "detected",
        patternType: detected.patternType,
        zoneHigh: detected.zoneHigh,
        zoneLow: detected.zoneLow,
        creationBar: detected.creationBar,
        creationTime,
        revisitBar: input.stage === "entry_retest" ? stageBar : null,
        revisitTime: input.stage === "entry_retest" ? stageTime : null,
        confirmationBar: input.stage === "confirmation" ? stageBar : null,
        confirmationTime: input.stage === "confirmation" ? stageTime : null,
        entryBar: input.stage === "position_entry" ? stageBar : null,
        entryTime: input.stage === "position_entry" ? stageTime : null,
        measured: 1,
        threshold: 1,
        detectorParams: detected.detectorParams,
        measuredValues: detected.measuredValues,
        thresholds: detected.thresholds,
        required: b.required,
        weight: b.weight,
        priority: b.priority,
        operatorPassed: true,
        scoreContribution: b.weight,
        stage: input.stage,
        touchCount: detected.touchCount ?? null,
        lineAnchors: detected.lineAnchors,
      });
    } else {
      blocks.push({
        blockId: b.id,
        family: b.family,
        role: b.role,
        order: b.order,
        status: b.required ? "missing" : "optional_skipped",
        patternType: b.family,
        zoneHigh: null,
        zoneLow: null,
        creationBar: null,
        measured: 0,
        threshold: 1,
        detectorParams: { ...b.params },
        measuredValues: { detected: 0 },
        thresholds: { detected: 1 },
        required: b.required,
        weight: b.weight,
        priority: b.priority,
        scoreContribution: 0,
        stage: input.stage,
        reasonCode: `${b.family}_missing`,
      });
    }
  }

  const detectedCount = blocks.filter((b) => b.status === "detected").length;
  const op = input.combination.operator;
  const score = sorted.reduce(
    (sum, block, index) =>
      sum + (blocks[index]?.status === "detected" ? block.weight : 0),
    0,
  );
  const withResult = (
    ok: boolean,
    reasonCode: string | null = null,
    selectedPriority: number | null = null,
  ) =>
    blocks.map((block) => ({
      ...block,
      operatorPassed: ok,
      operator: op,
      scoreTotal: score,
      scoreThreshold:
        op === "weighted_score" ? input.combination.weightedThreshold ?? 1 : null,
      selectedPriority,
      reasonCode: ok ? block.reasonCode ?? null : reasonCode ?? block.reasonCode ?? null,
    }));
  if (op === "or") {
    if (detectedCount >= 1) {
      return { ok: true, reasonCode: null, blocks: withResult(true), score, selectedPriority: null };
    }
    const missing = blocks.find((b) => b.status === "missing");
    return {
      ok: false,
      reasonCode: missing
        ? `${missing.family}_missing`
        : "operator_not_satisfied",
      blocks: withResult(
        false,
        missing ? `${missing.family}_missing` : "operator_not_satisfied",
      ),
      score,
      selectedPriority: null,
    };
  }
  if (op === "sequence") {
    // Ordered: each block must be detected; creation bars must be non-decreasing by order.
    let lastCreation = -1;
    for (const b of blocks) {
      const configured = sorted[blocks.indexOf(b)];
      if (!configured?.required && b.status === "optional_skipped") continue;
      if (b.status !== "detected" || b.creationBar == null) {
        return {
          ok: false,
          reasonCode:
            b.status === "missing"
              ? `${b.family}_missing`
              : "sequence_order_failed",
          blocks: withResult(
            false,
            b.status === "missing"
              ? `${b.family}_missing`
              : "sequence_order_failed",
          ),
          score,
          selectedPriority: null,
        };
      }
      if (b.creationBar < lastCreation) {
        return {
          ok: false,
          reasonCode: "sequence_order_failed",
          blocks: withResult(false, "sequence_order_failed"),
          score,
          selectedPriority: null,
        };
      }
      lastCreation = b.creationBar;
    }
    return { ok: true, reasonCode: null, blocks: withResult(true), score, selectedPriority: null };
  }
  if (op === "weighted_score") {
    const requiredMissing = sorted.some(
      (block, index) => block.required && blocks[index]?.status !== "detected",
    );
    const ok =
      !requiredMissing && score >= (input.combination.weightedThreshold ?? 1);
    return {
      ok,
      reasonCode: ok ? null : "weighted_score_below_threshold",
      blocks: withResult(ok, ok ? null : "weighted_score_below_threshold"),
      score,
      selectedPriority: null,
    };
  }
  if (op === "priority") {
    const chosen = sorted
      .map((block, index) => ({ block, evidence: blocks[index]! }))
      .filter((item) => item.evidence.status === "detected")
      .sort((a, b) => a.block.priority - b.block.priority)[0];
    const ok = Boolean(chosen);
    return {
      ok,
      reasonCode: ok ? null : "priority_no_match",
      blocks: withResult(ok, ok ? null : "priority_no_match", chosen?.block.priority ?? null),
      score,
      selectedPriority: chosen?.block.priority ?? null,
    };
  }
  // AND (default): optional blocks are evidence-only.
  const requiredSatisfied = sorted.every(
    (block, index) => !block.required || blocks[index]?.status === "detected",
  );
  if (requiredSatisfied) {
    return { ok: true, reasonCode: null, blocks: withResult(true), score, selectedPriority: null };
  }
  const missing = blocks.find((b) => b.status === "missing");
  return {
    ok: false,
    reasonCode: missing
      ? `${missing.family}_missing`
      : "operator_not_satisfied",
    blocks: withResult(
      false,
      missing ? `${missing.family}_missing` : "operator_not_satisfied",
    ),
    score,
    selectedPriority: null,
  };
}

function aggregateCombinationEvidence(
  combination: NonNullable<StrategyEventSequence["combination"]>,
  evidence: PatternBlockEvidence[],
  roles: string[],
): {
  ok: boolean;
  score: number;
  selectedPriority: number | null;
  reasonCode: string | null;
} {
  const configured = [...combination.blocks]
    .filter((block) => roleMatchesFilter(block.role, roles))
    .sort((a, b) => a.order - b.order);
  if (configured.length === 0) {
    return { ok: true, score: 0, selectedPriority: null, reasonCode: null };
  }
  const latest = new Map<string, PatternBlockEvidence>();
  for (const item of evidence) latest.set(item.blockId, item);
  const passed = (block: (typeof configured)[number]) =>
    latest.get(block.id)?.status === "detected";
  const score = configured.reduce(
    (sum, block) => sum + (passed(block) ? block.weight : 0),
    0,
  );
  if (combination.operator === "or") {
    const ok = configured.some(passed);
    return {
      ok,
      score,
      selectedPriority: null,
      reasonCode: ok ? null : "operator_not_satisfied",
    };
  }
  if (combination.operator === "weighted_score") {
    const ok = score >= (combination.weightedThreshold ?? 1);
    return {
      ok,
      score,
      selectedPriority: null,
      reasonCode: ok ? null : "weighted_score_below_threshold",
    };
  }
  if (combination.operator === "priority") {
    const selected = [...configured]
      .filter(passed)
      .sort((a, b) => a.priority - b.priority)[0];
    return {
      ok: Boolean(selected),
      score,
      selectedPriority: selected?.priority ?? null,
      reasonCode: selected ? null : "priority_no_match",
    };
  }
  if (combination.operator === "sequence") {
    let lastCreation = -1;
    for (const block of configured) {
      const item = latest.get(block.id);
      if (!block.required && item?.status !== "detected") continue;
      if (
        item?.status !== "detected" ||
        item.creationBar == null ||
        item.creationBar < lastCreation
      ) {
        return {
          ok: false,
          score,
          selectedPriority: null,
          reasonCode: "sequence_order_failed",
        };
      }
      lastCreation = item.creationBar;
    }
    return { ok: true, score, selectedPriority: null, reasonCode: null };
  }
  const ok = configured.every((block) => !block.required || passed(block));
  return {
    ok,
    score,
    selectedPriority: null,
    reasonCode: ok ? null : "operator_not_satisfied",
  };
}

type CombinationRejectContext = {
  blocks: PatternBlockEvidence[];
  operatorOk: boolean;
  score?: number;
  priority?: number | null;
};

function enrichCombinationReject(
  setup: RejectedSetup,
  combination: NonNullable<StrategyEventSequence["combination"]>,
  context: CombinationRejectContext,
): RejectedSetup {
  const failurePolicy =
    combination.failurePolicy ?? combination.invalidationMode ?? "any";
  const invalidationMode =
    combination.invalidationMode ?? combination.failurePolicy ?? "any";
  return {
    ...setup,
    patternBlocks: context.blocks,
    combinationOperator: combination.operator,
    combinationFailurePolicy: failurePolicy,
    combinationInvalidationMode: invalidationMode,
    combinationResult: context.operatorOk,
    combinationScore: context.score ?? setup.combinationScore,
    combinationPriority:
      context.priority ?? setup.combinationPriority ?? null,
  };
}

function pushRejectedSetup(
  rejectedSetups: RejectedSetup[],
  seq: StrategyEventSequence | undefined,
  setup: RejectedSetup,
  combo?: CombinationRejectContext,
): void {
  if (seq?.combination && combo) {
    rejectedSetups.push(enrichCombinationReject(setup, seq.combination, combo));
    return;
  }
  if (seq?.combination && setup.patternBlocks && setup.patternBlocks.length > 0) {
    const operatorOk =
      typeof setup.combinationResult === "boolean"
        ? setup.combinationResult
        : setup.patternBlocks.some((block) => block.operatorPassed === true);
    rejectedSetups.push(
      enrichCombinationReject(setup, seq.combination, {
        blocks: setup.patternBlocks,
        operatorOk,
        score: setup.combinationScore,
        priority: setup.combinationPriority ?? null,
      }),
    );
    return;
  }
  rejectedSetups.push(setup);
}

function comboContextFromEvidence(
  seq: StrategyEventSequence | undefined,
  evidence: PatternBlockEvidence[] | undefined,
  roles: string[] = [
    "trend_filter",
    "entry_zone",
    "confirmation",
    "invalidation",
    "exit_filter",
  ],
): CombinationRejectContext | undefined {
  if (!seq?.combination || !evidence) return undefined;
  const aggregate = aggregateCombinationEvidence(seq.combination, evidence, roles);
  return {
    blocks: evidence,
    operatorOk: aggregate.ok,
    score: aggregate.score,
    priority: aggregate.selectedPriority,
  };
}

export function runEventSequenceBacktest(input: {
  def: CanonicalStrategyDefinition;
  symbol: string;
  candles: OhlcvCandle[];
  balance: number;
  feeRate: number;
  slippageRate: number;
  /** Optional Search candidate params (lev_*, direction passthrough already in def). */
  params?: Record<string, unknown> | null;
}): EventSequenceBacktestResult {
  const seq = input.def.eventSequence;
  const entryStepEarly = seq?.steps.find((step) => step.kind === "entry");
  const triggerParamsValidation = validateEntryTriggerParams(
    entryStepEarly?.params as Record<string, unknown> | undefined,
  );
  if (!triggerParamsValidation.ok) {
    return {
      trades: [],
      equityCurve: [input.balance],
      endingBalance: input.balance,
      rejectedSetups: [
        {
          bar: -1,
          stage: "definition_validation",
          reasonCode: "unsupported_trigger_mode",
          patternType: "none",
          measured: null,
          required: null,
          measuredValues: { triggerMode: triggerParamsValidation.triggerMode },
        },
      ],
      assumptionsKo: ASSUMPTIONS_KO,
    };
  }
  if (!seq || !validateEventSequence(seq).ok) {
    return {
      trades: [],
      equityCurve: [input.balance],
      endingBalance: input.balance,
      rejectedSetups: [
        {
          bar: -1,
          stage: "definition_validation",
          reasonCode: "invalid_event_sequence",
          patternType: "none",
          measured: null,
          required: null,
        },
      ],
      assumptionsKo: ASSUMPTIONS_KO,
    };
  }

  const { def, symbol, candles } = input;
  const creationStep = stepByKind(seq, "pattern_creation");
  const validityStep = stepByKind(seq, "pattern_validity");
  const revisitStep = stepByKind(seq, "revisit");
  const penetrationStep = stepByKind(seq, "penetration");
  const confirmationStep = stepByKind(seq, "confirmation");
  const entryStep = stepByKind(seq, "entry");
  const stopStep = stepByKind(seq, "stop_loss");
  const tpStep = stepByKind(seq, "take_profit");
  const invalidationStep = stepByKind(seq, "invalidation");
  const maxHoldStep = stepByKind(seq, "max_hold_exit");
  let entryTrigger;
  let legacyEntryTrigger;
  try {
    ({ trigger: entryTrigger, legacy: legacyEntryTrigger } = resolveEntryTrigger(
      entryStep?.params as Record<string, unknown> | undefined,
    ));
  } catch (err) {
    if (err instanceof EntryTriggerValidationError) {
      return {
        trades: [],
        equityCurve: [input.balance],
        endingBalance: input.balance,
        rejectedSetups: [
          {
            bar: -1,
            stage: "definition_validation",
            reasonCode: "unsupported_trigger_mode",
            patternType: "none",
            measured: null,
            required: null,
            measuredValues: { triggerMode: err.triggerMode },
          },
        ],
        assumptionsKo: ASSUMPTIONS_KO,
      };
    }
    throw err;
  }

  const penetrationRequired = numParam(penetrationStep, "penetrationPct", 0.3);
  const stopAtrMult = numParam(stopStep, "atrMult", def.risk.stopLossAtrMult);
  const tpAtrMult = numParam(tpStep, "atrMult", def.risk.takeProfitAtrMult);
  const stopAnchor = strParam(stopStep, "anchor", "zone_low");
  const maxHoldBars = numParam(
    maxHoldStep,
    "maxHoldBars",
    def.risk.maxHoldBars,
  );
  const invalidateRule = strParam(
    invalidationStep ?? validityStep,
    "rule",
    strParam(validityStep, "invalidation", "close_beyond_zone"),
  );
  const confirmModeRaw = strParam(
    confirmationStep,
    "confirmationMode",
    "",
  );
  const confirmCount = Math.max(
    1,
    Math.min(8, Math.trunc(numParam(confirmationStep, "confirmationCandleCount", 1))),
  );
  const confirmWindow = Math.max(
    confirmCount,
    Math.min(24, Math.trunc(numParam(confirmationStep, "confirmationWindow", confirmCount))),
  );
  const legacyRequireClose = boolParam(
    confirmationStep,
    "requireCloseInDirection",
    true,
  );
  const confirmMode =
    confirmModeRaw === "none" ||
    confirmModeRaw === "single_close" ||
    confirmModeRaw === "consecutive_closes" ||
    confirmModeRaw === "threshold_count"
      ? confirmModeRaw
      : !legacyRequireClose
        ? "none"
        : confirmCount > 1
          ? "consecutive_closes"
          : "single_close";
  const family = creationStep?.patternFamily;

  const atrFull = computeAtrSeries(
    candles.map((c) => c.high),
    candles.map((c) => c.low),
    candles.map((c) => c.close),
    14,
  );

  const trades: EventSequenceTrade[] = [];
  const rejectedSetups: RejectedSetup[] = [];
  let equity = input.balance;
  let peakEquity = input.balance;
  const equityCurve = [equity];
  let cooldown = 0;
  const levParams = input.params ?? null;

  const sides: Array<"LONG" | "SHORT"> = [];
  if (
    (seq.direction === "long" || seq.direction === "both") &&
    def.longEnabled &&
    def.execution.longEnabled
  ) {
    sides.push("LONG");
  }
  if (
    (seq.direction === "short" || seq.direction === "both") &&
    def.shortEnabled &&
    def.execution.shortEnabled
  ) {
    sides.push("SHORT");
  }

  const machines: SideMachine[] = sides.map((side) => ({
    side,
    phase: "idle",
    geo: null,
  }));

  const warmUp = 20;

  for (let i = warmUp; i < candles.length; i += 1) {
    // No look-ahead: detectors only see completed bars through i
    const window = candles.slice(0, i + 1);
    const c = window[i];
    const atr = Math.max(atrFull[i] ?? 0, c.close * 0.001);

    if (cooldown > 0) cooldown -= 1;

    for (const m of machines) {
      if (m.phase === "in_position" && m.geo && m.stop != null && m.tp != null) {
        const hold = i - (m.entryBar ?? i);
        let exitPrice: number | null = null;
        let exitReason: BacktestTrade["exitReason"] = "end";

        // Conservative: same-candle stop preferred over target
        if (m.side === "LONG") {
          if (c.low <= m.stop) {
            exitPrice = m.stop;
            exitReason = "stop_loss";
          } else if (c.high >= m.tp) {
            exitPrice = m.tp;
            exitReason = "take_profit";
          }
        } else if (c.high >= m.stop) {
          exitPrice = m.stop;
          exitReason = "stop_loss";
        } else if (c.low <= m.tp) {
          exitPrice = m.tp;
          exitReason = "take_profit";
        }

        if (exitPrice == null && hold >= maxHoldBars) {
          exitPrice = c.close;
          exitReason = "max_hold";
        }

        if (exitPrice == null && seq.combination) {
          const lifecycle = evaluateCombinationBlocks({
            combination: seq.combination,
            window,
            bar: i,
            atr,
            side: m.side,
            creationStep,
            roles: ["invalidation", "exit_filter"],
            stage: "position_lifecycle",
          });
          const configured = seq.combination.blocks.filter(
            (block) =>
              (block.role === "invalidation" ||
                block.role === "exit_filter") &&
              block.required,
          );
          const failedIds = new Set(
            configured.filter((block) => {
            const evidence = lifecycle.blocks.find(
              (item) => item.blockId === block.id,
            );
            if (!evidence || evidence.status !== "detected") return true;
            if (block.role === "exit_filter") return false;
            if (evidence.zoneHigh == null || evidence.zoneLow == null) return false;
            return isInvalidated(
              c,
              {
                patternType: evidence.patternType,
                zoneHigh: evidence.zoneHigh,
                zoneLow: evidence.zoneLow,
                creationBar: evidence.creationBar ?? i,
              },
              m.side,
              typeof block.params.invalidationMode === "string" &&
                block.params.invalidationMode === "none"
                ? "none"
                : "close_beyond_zone",
            );
            }).map((block) => block.id),
          );
          const failed = failedIds.size;
          const policy =
            seq.combination.failurePolicy ??
            seq.combination.invalidationMode ??
            "any";
          if (failurePolicyTriggered(policy, failed, configured.length)) {
            exitPrice = c.close;
            exitReason = "end";
          }
          m.blockEvidence = [
            ...(m.blockEvidence ?? []).filter(
              (item) =>
                item.role !== "invalidation" && item.role !== "exit_filter",
            ),
            ...lifecycle.blocks.map((block) =>
              failedIds.has(block.blockId)
                ? {
                    ...block,
                    status: "failed" as const,
                    invalidationBar: i,
                    invalidationTime: candleTimeIso(c) ?? null,
                    breakBar: block.family === "trendline" ? i : null,
                    breakTime:
                      block.family === "trendline"
                        ? candleTimeIso(c) ?? null
                        : null,
                    reasonCode: "lifecycle_invalidation",
                  }
                : block,
            ),
          ];
        }

        if (
          exitPrice == null &&
          isInvalidated(c, m.geo, m.side, invalidateRule)
        ) {
          m.geo = {
            ...m.geo,
            invalidationBar: i,
            breakBar: m.geo.patternType === "trendline" ? i : m.geo.breakBar,
          };
          exitPrice = c.close;
          exitReason = "end";
        }

        if (exitPrice != null) {
          const feePct = input.feeRate * 2;
          const slipPct = input.slippageRate * 2;
          const raw =
            m.side === "LONG"
              ? (exitPrice - (m.entryPrice ?? exitPrice)) / (m.entryPrice ?? 1)
              : ((m.entryPrice ?? exitPrice) - exitPrice) / (m.entryPrice ?? 1);
          const pnlPct = raw - feePct - slipPct;
          const lev = m.leverage ?? 1;
          const entryPx = m.entryPrice ?? c.close;
          const ledger = eventSequenceLedger({
            equityBefore: equity,
            baseBalancePct: def.positionSizing.baseBalancePct,
            leverage: lev,
            entryPrice: entryPx,
            raw,
            feePct,
            slipPct,
            pnlPctStored: pnlPct * lev,
          });
          equity *= 1 + pnlPct * def.positionSizing.baseBalancePct * lev;
          if (equity > peakEquity) peakEquity = equity;

          const geo = m.geo;
          trades.push({
            symbol,
            side: m.side,
            signalType: "EVENT_SEQUENCE",
            entryBar: m.entryBar ?? i,
            exitBar: i,
            entryPrice: entryPx,
            exitPrice,
            stopLoss: m.stop,
            takeProfit: m.tp,
            stopPrice: m.stop,
            takeProfitPrice: m.tp,
            leverage: lev,
            pnlPct: pnlPct * lev,
            feePct,
            slippagePct: slipPct,
            ...ledger,
            exitReason,
            holdBars: hold,
            entryTime: candles[m.entryBar ?? i]?.openTime,
            exitTime: c.openTime,
            patternType: geo.patternType,
            zoneHigh: geo.zoneHigh,
            zoneLow: geo.zoneLow,
            creationBar: geo.creationBar,
            revisitBar: geo.revisitBar,
            confirmationBar: geo.confirmationBar,
            breakBar: geo.breakBar,
            invalidationBar: geo.invalidationBar,
            penetrationPct: geo.penetrationPct,
            creationCandleTime: candleTimeIso(candles[geo.creationBar]),
            revisitCandleTime:
              geo.revisitBar != null
                ? candleTimeIso(candles[geo.revisitBar])
                : undefined,
            confirmationCandleTime:
              geo.confirmationBar != null
                ? candleTimeIso(candles[geo.confirmationBar])
                : undefined,
            breakCandleTime:
              geo.breakBar != null
                ? candleTimeIso(candles[geo.breakBar])
                : undefined,
            invalidationCandleTime:
              geo.invalidationBar != null
                ? candleTimeIso(candles[geo.invalidationBar])
                : undefined,
            lineAnchors: geo.lineAnchors,
            patternBlocks: m.blockEvidence?.map((block) => ({
              ...block,
              revisitBar: block.revisitBar ?? geo.revisitBar ?? null,
              revisitTime:
                block.revisitTime ??
                (geo.revisitBar != null
                  ? candleTimeIso(candles[geo.revisitBar]) ?? null
                  : null),
              confirmationBar:
                block.confirmationBar ?? geo.confirmationBar ?? null,
              confirmationTime:
                block.confirmationTime ??
                (geo.confirmationBar != null
                  ? candleTimeIso(candles[geo.confirmationBar]) ?? null
                  : null),
              entryBar: block.entryBar ?? m.entryBar ?? null,
              entryTime:
                block.entryTime ??
                (m.entryBar != null
                  ? candleTimeIso(candles[m.entryBar]) ?? null
                  : null),
              breakBar: block.breakBar ?? geo.breakBar ?? null,
              breakTime:
                block.breakTime ??
                (geo.breakBar != null
                  ? candleTimeIso(candles[geo.breakBar]) ?? null
                  : null),
              invalidationBar:
                block.invalidationBar ?? geo.invalidationBar ?? null,
              invalidationTime:
                block.invalidationTime ??
                (geo.invalidationBar != null
                  ? candleTimeIso(candles[geo.invalidationBar]) ?? null
                  : null),
              stopPrice: m.stop ?? null,
              targetPrice: m.tp ?? null,
              exitPrice,
              exitBar: i,
              exitTime: candleTimeIso(c) ?? null,
              exitReason,
            })),
            combinationOperator: seq.combination?.operator,
            combinationResult: m.blockEvidence
              ? m.blockEvidence.every((b) => b.status === "detected") ||
                (seq.combination?.operator === "or" &&
                  m.blockEvidence.some((b) => b.status === "detected"))
              : undefined,
            combinationScore: m.combinationScore,
            combinationPriority: m.combinationPriority,
          });

          m.phase = "idle";
          m.geo = null;
          m.entryBar = undefined;
          m.entryPrice = undefined;
          m.stop = undefined;
          m.tp = undefined;
          m.leverage = undefined;
          m.blockEvidence = undefined;
          m.combinationScore = undefined;
          m.combinationPriority = undefined;
          cooldown = def.execution.cooldownBars;
          equityCurve.push(equity);
        }
        continue;
      }

      if (cooldown > 0) continue;
      if (machines.some((x) => x.phase === "in_position")) continue;

      // --- state machine (idle → … → confirmed → entry) ---
      if (m.phase === "idle") {
        if (seq.combination) {
          const filters = evaluateCombinationBlocks({
            combination: seq.combination,
            window,
            bar: i,
            atr,
            side: m.side,
            creationStep,
            roles: ["trend_filter"],
            stage: "before_setup",
          });
          if (
            !filters.ok &&
            (seq.combination.operator === "and" ||
              seq.combination.operator === "sequence")
          ) {
            pushRejectedSetup(
              rejectedSetups,
              seq,
              {
              bar: i,
              at: candleTimeIso(c) ?? null,
              eventPrice: c.close,
              stage: "before_setup",
              reasonCode: filters.reasonCode ?? "trend_filter_failed",
              patternType: family ?? "none",
              measured: filters.blocks.filter(
                (block) => block.status === "detected",
              ).length,
              required: filters.blocks.length,
              patternBlocks: filters.blocks,
            },
              {
                blocks: filters.blocks,
                operatorOk: filters.ok,
                score: filters.score,
                priority: filters.selectedPriority,
              },
            );
            continue;
          }
          m.blockEvidence = filters.blocks;
          m.combinationScore = filters.score;
          m.combinationPriority = filters.selectedPriority;
        }
        const detected = detectPatternAt(
          family,
          window,
          i,
          atr,
          m.side,
          creationStep,
        );
        if (isPatternReject(detected)) {
          const comboEval = seq.combination
            ? evaluateCombinationBlocks({
                combination: seq.combination,
                window,
                bar: i,
                atr,
                side: m.side,
                creationStep,
                stage: "pattern_creation",
              })
            : null;
          pushRejectedSetup(
            rejectedSetups,
            seq,
            {
            bar: i,
            at: candleTimeIso(c) ?? null,
            eventPrice: c.close,
            stage: "pattern_creation",
            reasonCode: detected.reasonCode,
            patternType: detected.patternType,
            measured: null,
            required: null,
            detectorParams: detected.detectorParams,
            measuredValues: detected.measuredValues,
            thresholds: detected.thresholds,
            zoneHigh: detected.zoneHigh,
            zoneLow: detected.zoneLow,
            creationBar: detected.creationBar,
            creationTime:
              detected.creationBar != null
                ? candleTimeIso(candles[detected.creationBar]) ?? null
                : null,
          },
            comboEval
              ? {
                  blocks: comboEval.blocks,
                  operatorOk: comboEval.ok,
                  score: comboEval.score,
                  priority: comboEval.selectedPriority,
                }
              : undefined,
          );
          continue;
        }
        if (detected) {
          m.phase = "pattern_created";
          m.geo = {
            patternType: detected.patternType,
            zoneHigh: detected.zoneHigh,
            zoneLow: detected.zoneLow,
            creationBar: detected.creationBar,
            lineAnchors: detected.lineAnchors,
          };
          if (!seq.combination) {
            m.blockEvidence = [
              {
                blockId: "primary",
                family: family ?? detected.patternType,
                role: "entry_zone",
                order: 0,
                status: "detected",
                patternType: detected.patternType,
                zoneHigh: detected.zoneHigh,
                zoneLow: detected.zoneLow,
                creationBar: detected.creationBar,
                creationTime:
                  candleTimeIso(candles[detected.creationBar]) ?? null,
                measured: 1,
                threshold: 1,
                detectorParams: detected.detectorParams,
                measuredValues: detected.measuredValues,
                thresholds: detected.thresholds,
                required: true,
                weight: 1,
                priority: 0,
                operatorPassed: true,
                scoreContribution: 1,
                scoreTotal: 1,
                scoreThreshold: 1,
                selectedPriority: 0,
                operator: "single",
                stage: "pattern_creation",
                reasonCode: null,
                touchCount: detected.touchCount ?? null,
                lineAnchors: detected.lineAnchors ?? null,
              },
            ];
          }
        }
        continue;
      }

      if (!m.geo) {
        m.phase = "idle";
        continue;
      }

      if (isInvalidated(c, m.geo, m.side, invalidateRule)) {
        pushRejectedSetup(
          rejectedSetups,
          seq,
          {
          bar: i,
          at: candleTimeIso(c) ?? null,
          eventPrice: c.close,
          stage: "pattern_validity",
          reasonCode: "pattern_invalidated",
          patternType: m.geo.patternType,
          measured: m.side === "LONG" ? c.close : c.close,
          required: m.side === "LONG" ? m.geo.zoneLow : m.geo.zoneHigh,
          detectorParams: { ...(creationStep?.params ?? {}) },
          measuredValues: { close: c.close },
          thresholds: {
            invalidationPrice:
              m.side === "LONG" ? m.geo.zoneLow : m.geo.zoneHigh,
          },
          zoneHigh: m.geo.zoneHigh,
          zoneLow: m.geo.zoneLow,
          lineAnchors: m.geo.lineAnchors ?? null,
          creationBar: m.geo.creationBar,
          creationTime: candleTimeIso(candles[m.geo.creationBar]) ?? null,
          revisitBar: m.geo.revisitBar ?? null,
          revisitTime:
            m.geo.revisitBar != null
              ? candleTimeIso(candles[m.geo.revisitBar]) ?? null
              : null,
          confirmationBar: m.geo.confirmationBar ?? null,
          confirmationTime:
            m.geo.confirmationBar != null
              ? candleTimeIso(candles[m.geo.confirmationBar]) ?? null
              : null,
          invalidationBar: i,
          invalidationTime: candleTimeIso(c) ?? null,
          patternBlocks: m.blockEvidence,
        },
          comboContextFromEvidence(seq, m.blockEvidence),
        );
        m.phase = "idle";
        m.geo = null;
        continue;
      }

      if (m.phase === "pattern_created") {
        // Revisit only after creation bar
        if (i <= m.geo.creationBar) continue;
        const requireTouch = boolParam(revisitStep, "requireTouch", true);
        if (requireTouch && !touchesZone(c, m.geo.zoneHigh, m.geo.zoneLow)) {
          continue;
        }
        m.geo = { ...m.geo, revisitBar: i };
        m.blockEvidence = m.blockEvidence?.map((block) => ({
          ...block,
          revisitBar: i,
          revisitTime: candleTimeIso(c) ?? null,
        }));
        if (seq.combination) {
          const entryGate = evaluateCombinationBlocks({
            combination: seq.combination,
            window,
            bar: i,
            atr,
            side: m.side,
            creationStep,
            roles: ["entry_zone"],
            stage: "entry_retest",
          });
          m.blockEvidence = mergeBlockEvidence(m.blockEvidence, entryGate.blocks);
          m.combinationScore = (m.combinationScore ?? 0) + entryGate.score;
          if (
            !entryGate.ok &&
            (seq.combination.operator === "and" ||
              seq.combination.operator === "sequence")
          ) {
            continue;
          }
        }
        m.phase = "revisited";
        // fall through to allow same-bar penetration
      }

      if (m.phase === "revisited") {
        const measured = measurePenetration(
          c,
          m.geo.zoneHigh,
          m.geo.zoneLow,
          m.side,
        );
        if (measured + 1e-12 < penetrationRequired) {
          // Still in zone but not deep enough — keep waiting unless left without enough depth
          if (!touchesZone(c, m.geo.zoneHigh, m.geo.zoneLow)) {
            pushRejectedSetup(
              rejectedSetups,
              seq,
              {
              bar: i,
              at: candleTimeIso(c) ?? null,
              eventPrice: c.close,
              stage: "penetration",
              reasonCode: "penetration_too_shallow",
              patternType: m.geo.patternType,
              measured,
              required: penetrationRequired,
              detectorParams: { ...(creationStep?.params ?? {}) },
              measuredValues: { penetrationPct: measured },
              thresholds: { penetrationPct: penetrationRequired },
              zoneHigh: m.geo.zoneHigh,
              zoneLow: m.geo.zoneLow,
              lineAnchors: m.geo.lineAnchors ?? null,
              creationBar: m.geo.creationBar,
              creationTime: candleTimeIso(candles[m.geo.creationBar]) ?? null,
              revisitBar: m.geo.revisitBar ?? null,
              revisitTime:
                m.geo.revisitBar != null
                  ? candleTimeIso(candles[m.geo.revisitBar]) ?? null
                  : null,
              patternBlocks: m.blockEvidence,
            },
              comboContextFromEvidence(seq, m.blockEvidence),
            );
            m.phase = "idle";
            m.geo = null;
          }
          continue;
        }
        m.geo = { ...m.geo, penetrationPct: measured };
        m.blockEvidence = m.blockEvidence?.map((block) => ({
          ...block,
          measured: measured,
          threshold: penetrationRequired,
          measuredValues: {
            ...block.measuredValues,
            penetrationPct: measured,
          },
          thresholds: {
            ...block.thresholds,
            penetrationPct: penetrationRequired,
          },
        }));
        m.phase = "penetrated";
        // fall through for same-bar confirmation
      }

      if (m.phase === "penetrated") {
        if (confirmMode === "none") {
          m.geo = { ...m.geo, confirmationBar: i };
          m.blockEvidence = m.blockEvidence?.map((block) => ({
            ...block,
            confirmationBar: i,
            confirmationTime: candleTimeIso(c) ?? null,
          }));
          m.phase = "confirmed";
          m.confirmHits = 0;
          m.confirmWindowStart = null;
        } else if (confirmMode === "single_close") {
          if (!closeInDirection(c, m.side)) {
            continue;
          }
          m.geo = { ...m.geo, confirmationBar: i };
          m.blockEvidence = m.blockEvidence?.map((block) => ({
            ...block,
            confirmationBar: i,
            confirmationTime: candleTimeIso(c) ?? null,
          }));
          m.phase = "confirmed";
          m.confirmHits = 0;
          m.confirmWindowStart = null;
        } else {
          if (m.confirmWindowStart == null) {
            m.confirmWindowStart = i;
            m.confirmHits = 0;
          }
          const elapsed = i - (m.confirmWindowStart ?? i);
          if (elapsed >= confirmWindow) {
            pushRejectedSetup(
              rejectedSetups,
              seq,
              {
              bar: i,
              at: candleTimeIso(c) ?? null,
              eventPrice: c.close,
              stage: "confirmation",
              reasonCode: "confirmation_timeout",
              patternType: m.geo.patternType,
              measured: m.confirmHits ?? 0,
              required: confirmCount,
              detectorParams: { ...(confirmationStep?.params ?? {}) },
              measuredValues: { confirmationCount: m.confirmHits ?? 0 },
              thresholds: {
                confirmationCount: confirmCount,
                confirmationWindow: confirmWindow,
              },
              zoneHigh: m.geo.zoneHigh,
              zoneLow: m.geo.zoneLow,
              lineAnchors: m.geo.lineAnchors ?? null,
              creationBar: m.geo.creationBar,
              creationTime: candleTimeIso(candles[m.geo.creationBar]) ?? null,
              revisitBar: m.geo.revisitBar ?? null,
              revisitTime:
                m.geo.revisitBar != null
                  ? candleTimeIso(candles[m.geo.revisitBar]) ?? null
                  : null,
              patternBlocks: m.blockEvidence,
            },
              comboContextFromEvidence(seq, m.blockEvidence),
            );
            m.phase = "idle";
            m.geo = null;
            m.confirmHits = 0;
            m.confirmWindowStart = null;
            continue;
          }
          const inDir = closeInDirection(c, m.side);
          if (confirmMode === "consecutive_closes") {
            m.confirmHits = inDir ? (m.confirmHits ?? 0) + 1 : 0;
          } else if (inDir) {
            m.confirmHits = (m.confirmHits ?? 0) + 1;
          }
          if ((m.confirmHits ?? 0) >= confirmCount) {
            m.geo = { ...m.geo, confirmationBar: i };
            m.blockEvidence = m.blockEvidence?.map((block) => ({
              ...block,
              confirmationBar: i,
              confirmationTime: candleTimeIso(c) ?? null,
            }));
            m.phase = "confirmed";
            m.confirmHits = 0;
            m.confirmWindowStart = null;
          } else {
            continue;
          }
        }
      }

      // Touch / confirmation validity windows (new entryTrigger only).
      const phaseForExpiry = m.phase as Phase;
      if (
        !legacyEntryTrigger &&
        m.geo &&
        (phaseForExpiry === "revisited" ||
          phaseForExpiry === "penetrated" ||
          phaseForExpiry === "confirmed" ||
          phaseForExpiry === "entry_ready")
      ) {
        if (
          entryTrigger.maxBarsAfterTouch != null &&
          m.geo.revisitBar != null &&
          i - m.geo.revisitBar > entryTrigger.maxBarsAfterTouch
        ) {
          pushRejectedSetup(
            rejectedSetups,
            seq,
            {
            bar: i,
            at: candleTimeIso(c) ?? null,
            eventPrice: c.close,
            stage: "entry",
            reasonCode: "touch_expired",
            patternType: m.geo.patternType,
            measured: i - m.geo.revisitBar,
            required: entryTrigger.maxBarsAfterTouch,
            measuredValues: {
              barsAfterTouch: i - m.geo.revisitBar,
              maxBarsAfterTouch: entryTrigger.maxBarsAfterTouch,
            },
            thresholds: { maxBarsAfterTouch: entryTrigger.maxBarsAfterTouch },
            zoneHigh: m.geo.zoneHigh,
            zoneLow: m.geo.zoneLow,
            creationBar: m.geo.creationBar,
            creationTime: candleTimeIso(candles[m.geo.creationBar]) ?? null,
            revisitBar: m.geo.revisitBar,
            revisitTime:
              candleTimeIso(candles[m.geo.revisitBar]) ?? null,
            patternBlocks: m.blockEvidence,
          },
            comboContextFromEvidence(seq, m.blockEvidence),
          );
          m.phase = "idle";
          m.geo = null;
          continue;
        }
        if (
          entryTrigger.maxBarsAfterConfirmation != null &&
          m.geo.confirmationBar != null &&
          i - m.geo.confirmationBar > entryTrigger.maxBarsAfterConfirmation
        ) {
          pushRejectedSetup(
            rejectedSetups,
            seq,
            {
            bar: i,
            at: candleTimeIso(c) ?? null,
            eventPrice: c.close,
            stage: "entry",
            reasonCode: "confirmation_expired",
            patternType: m.geo.patternType,
            measured: i - m.geo.confirmationBar,
            required: entryTrigger.maxBarsAfterConfirmation,
            measuredValues: {
              barsAfterConfirmation: i - m.geo.confirmationBar,
              maxBarsAfterConfirmation: entryTrigger.maxBarsAfterConfirmation,
            },
            thresholds: {
              maxBarsAfterConfirmation: entryTrigger.maxBarsAfterConfirmation,
            },
            zoneHigh: m.geo.zoneHigh,
            zoneLow: m.geo.zoneLow,
            creationBar: m.geo.creationBar,
            creationTime: candleTimeIso(candles[m.geo.creationBar]) ?? null,
            revisitBar: m.geo.revisitBar ?? null,
            confirmationBar: m.geo.confirmationBar,
            confirmationTime:
              candleTimeIso(candles[m.geo.confirmationBar]) ?? null,
            patternBlocks: m.blockEvidence,
          },
            comboContextFromEvidence(seq, m.blockEvidence),
          );
          m.phase = "idle";
          m.geo = null;
          continue;
        }
      }

      if (m.phase === "entry_ready" && m.geo) {
        const entryPrice =
          entryTrigger.entryExecution === "NEXT_BAR_OPEN" ? c.open : c.close;
        const spatial = validateEntryZoneAtExecution({
          side: m.side,
          candle: c,
          zoneHigh: m.geo.zoneHigh,
          zoneLow: m.geo.zoneLow,
          entryPrice,
          trigger: entryTrigger,
        });
        if (!spatial.ok) {
          pushRejectedSetup(
            rejectedSetups,
            seq,
            {
            bar: i,
            at: candleTimeIso(c) ?? null,
            eventPrice: entryPrice,
            stage: "entry",
            reasonCode: spatial.reasonCode ?? "entry_zone_not_valid_at_execution",
            patternType: m.geo.patternType,
            measured: spatial.distanceZoneMult,
            required: spatial.toleranceMult,
            measuredValues: {
              entryPrice,
              distanceOutside: spatial.distanceOutside,
              distanceZoneMult: spatial.distanceZoneMult,
              penetrationPct: spatial.penetrationPct,
              touchOk: spatial.touchOk,
              revalidateAtEntry: true,
            },
            thresholds: {
              entryPriceTolerancePct: entryTrigger.entryPriceTolerancePct,
            },
            zoneHigh: m.geo.zoneHigh,
            zoneLow: m.geo.zoneLow,
            creationBar: m.geo.creationBar,
            creationTime: candleTimeIso(candles[m.geo.creationBar]) ?? null,
            revisitBar: m.geo.revisitBar ?? null,
            confirmationBar: m.geo.confirmationBar ?? null,
            patternBlocks: m.blockEvidence,
          },
            comboContextFromEvidence(seq, m.blockEvidence),
          );
          m.phase = "idle";
          m.geo = null;
          continue;
        }
        // Fall through by setting confirmed path vars via synthetic jump:
        // reuse confirmed entry block by assigning phase and entryPrice below.
        const stopAtrLocal = stopAtrMult;
        const tpAtrLocal = tpAtrMult;
        let stop: number;
        if (stopAnchor === "zone_low" && m.side === "LONG") {
          stop = m.geo.zoneLow - atr * stopAtrLocal;
        } else if (stopAnchor === "zone_high" && m.side === "SHORT") {
          stop = m.geo.zoneHigh + atr * stopAtrLocal;
        } else if (m.side === "LONG") {
          stop = entryPrice - atr * stopAtrLocal;
        } else {
          stop = entryPrice + atr * stopAtrLocal;
        }
        const tp =
          m.side === "LONG"
            ? entryPrice + atr * tpAtrLocal
            : entryPrice - atr * tpAtrLocal;
        m.phase = "in_position";
        m.entryBar = i;
        m.entryPrice = entryPrice;
        m.stop = stop;
        m.tp = tp;
        m.blockEvidence = m.blockEvidence?.map((block) => ({
          ...block,
          entryBar: i,
          entryTime: candleTimeIso(c) ?? null,
          stopPrice: stop,
          targetPrice: tp,
          measuredValues: {
            ...block.measuredValues,
            entryRevalidated: true,
            distanceZoneMult: spatial.distanceZoneMult,
            entryExecution: entryTrigger.entryExecution,
            legacyEntryTrigger: false,
          },
        }));
        m.leverage = resolveEventSequenceLeverage({
          params: levParams,
          atr,
          price: entryPrice,
          peakEquity,
          equity,
        });
        continue;
      }

      if (m.phase === "confirmed" && m.geo) {
        // Confirmation-role blocks are evaluated only at confirmation.
        if (seq.combination && seq.combination.blocks.length > 0) {
          const combo = evaluateCombinationBlocks({
            combination: seq.combination,
            window,
            bar: i,
            atr,
            side: m.side,
            creationStep,
            roles: ["confirmation"],
            stage: "confirmation",
          });
          m.blockEvidence = mergeBlockEvidence(m.blockEvidence, combo.blocks);
          m.combinationScore = (m.combinationScore ?? 0) + combo.score;
          m.combinationPriority =
            combo.selectedPriority ?? m.combinationPriority ?? null;
          const aggregate = aggregateCombinationEvidence(
            seq.combination,
            m.blockEvidence,
            ["trend_filter", "entry_zone", "confirmation"],
          );
          m.combinationScore = aggregate.score;
          m.combinationPriority = aggregate.selectedPriority;
          if (!aggregate.ok) {
            pushRejectedSetup(
              rejectedSetups,
              seq,
              {
              bar: i,
              at: candleTimeIso(c) ?? null,
              eventPrice: c.close,
              stage: "combination_confirmation",
              reasonCode:
                aggregate.reasonCode ??
                combo.reasonCode ??
                "operator_not_satisfied",
              patternType: m.geo.patternType,
              measured: combo.blocks.filter((b) => b.status === "detected")
                .length,
              required: combo.blocks.length,
              measuredValues: {
                detectedBlocks: combo.blocks.filter(
                  (b) => b.status === "detected",
                ).length,
                scoreTotal: aggregate.score,
              },
              thresholds: {
                requiredBlocks: combo.blocks.length,
                scoreThreshold: seq.combination.weightedThreshold ?? null,
              },
              zoneHigh: m.geo.zoneHigh,
              zoneLow: m.geo.zoneLow,
              lineAnchors: m.geo.lineAnchors ?? null,
              creationBar: m.geo.creationBar,
              creationTime: candleTimeIso(candles[m.geo.creationBar]) ?? null,
              revisitBar: m.geo.revisitBar ?? null,
              revisitTime:
                m.geo.revisitBar != null
                  ? candleTimeIso(candles[m.geo.revisitBar]) ?? null
                  : null,
              confirmationBar: m.geo.confirmationBar ?? i,
              confirmationTime: candleTimeIso(c) ?? null,
              patternBlocks: m.blockEvidence,
            },
              {
                blocks: m.blockEvidence ?? combo.blocks,
                operatorOk: aggregate.ok,
                score: aggregate.score,
                priority: aggregate.selectedPriority,
              },
            );
            m.phase = "idle";
            m.geo = null;
            m.confirmHits = 0;
            m.confirmWindowStart = null;
            continue;
          }
        }

        if (
          !legacyEntryTrigger &&
          entryTrigger.entryExecution === "NEXT_BAR_OPEN"
        ) {
          m.phase = "entry_ready";
          continue;
        }

        const entryPrice = c.close;
        if (!legacyEntryTrigger && entryTrigger.revalidateAtEntry) {
          const spatial = validateEntryZoneAtExecution({
            side: m.side,
            candle: c,
            zoneHigh: m.geo.zoneHigh,
            zoneLow: m.geo.zoneLow,
            entryPrice,
            trigger: entryTrigger,
          });
          if (!spatial.ok) {
            pushRejectedSetup(
              rejectedSetups,
              seq,
              {
              bar: i,
              at: candleTimeIso(c) ?? null,
              eventPrice: entryPrice,
              stage: "entry",
              reasonCode:
                spatial.reasonCode ?? "entry_zone_not_valid_at_execution",
              patternType: m.geo.patternType,
              measured: spatial.distanceZoneMult,
              required: spatial.toleranceMult,
              measuredValues: {
                entryPrice,
                distanceOutside: spatial.distanceOutside,
                distanceZoneMult: spatial.distanceZoneMult,
                penetrationPct: spatial.penetrationPct,
                touchOk: spatial.touchOk,
                revalidateAtEntry: true,
                legacyEntryTrigger: false,
              },
              thresholds: {
                entryPriceTolerancePct: entryTrigger.entryPriceTolerancePct,
              },
              zoneHigh: m.geo.zoneHigh,
              zoneLow: m.geo.zoneLow,
              creationBar: m.geo.creationBar,
              creationTime: candleTimeIso(candles[m.geo.creationBar]) ?? null,
              revisitBar: m.geo.revisitBar ?? null,
              confirmationBar: m.geo.confirmationBar ?? i,
              confirmationTime: candleTimeIso(c) ?? null,
              patternBlocks: m.blockEvidence,
            },
              comboContextFromEvidence(seq, m.blockEvidence),
            );
            m.phase = "idle";
            m.geo = null;
            m.confirmHits = 0;
            m.confirmWindowStart = null;
            continue;
          }
          m.blockEvidence = m.blockEvidence?.map((block) => ({
            ...block,
            measuredValues: {
              ...block.measuredValues,
              entryRevalidated: true,
              distanceZoneMult: spatial.distanceZoneMult,
              entryExecution: entryTrigger.entryExecution,
            },
          }));
        }

        const lifecycleEntry = seq.combination
          ? evaluateCombinationBlocks({
              combination: seq.combination,
              window,
              bar: i,
              atr,
              side: m.side,
              creationStep,
              roles: ["stop_placement", "take_profit"],
              stage: "position_entry",
            })
          : null;
        if (lifecycleEntry) {
          m.blockEvidence = mergeBlockEvidence(
            m.blockEvidence,
            lifecycleEntry.blocks,
          );
          m.combinationScore =
            (m.combinationScore ?? 0) + lifecycleEntry.score;
          if (!lifecycleEntry.ok) {
            m.phase = "idle";
            m.geo = null;
            continue;
          }
        }
        const stopBlock = seq.combination?.blocks.find(
          (block) => block.role === "stop_placement",
        );
        const targetBlock = seq.combination?.blocks.find(
          (block) => block.role === "take_profit",
        );
        const stopEvidence = lifecycleEntry?.blocks.find(
          (block) => block.role === "stop_placement" && block.status === "detected",
        );
        const targetEvidence = lifecycleEntry?.blocks.find(
          (block) => block.role === "take_profit" && block.status === "detected",
        );
        const effectiveStopAtr =
          typeof stopBlock?.params.stopAtrMult === "number"
            ? stopBlock.params.stopAtrMult
            : stopAtrMult;
        const effectiveTpAtr =
          typeof targetBlock?.params.tpAtrMult === "number"
            ? targetBlock.params.tpAtrMult
            : tpAtrMult;
        let stop: number;
        if (stopEvidence?.zoneLow != null && m.side === "LONG") {
          stop = stopEvidence.zoneLow - atr * effectiveStopAtr;
        } else if (stopEvidence?.zoneHigh != null && m.side === "SHORT") {
          stop = stopEvidence.zoneHigh + atr * effectiveStopAtr;
        } else if (stopAnchor === "zone_low" && m.side === "LONG") {
          stop = m.geo.zoneLow - atr * effectiveStopAtr;
        } else if (stopAnchor === "zone_high" && m.side === "SHORT") {
          stop = m.geo.zoneHigh + atr * effectiveStopAtr;
        } else if (m.side === "LONG") {
          stop = entryPrice - atr * effectiveStopAtr;
        } else {
          stop = entryPrice + atr * effectiveStopAtr;
        }
        const tp =
          targetEvidence?.zoneHigh != null && m.side === "LONG"
            ? Math.max(targetEvidence.zoneHigh, entryPrice + atr * effectiveTpAtr)
            : targetEvidence?.zoneLow != null && m.side === "SHORT"
              ? Math.min(targetEvidence.zoneLow, entryPrice - atr * effectiveTpAtr)
              : m.side === "LONG"
                ? entryPrice + atr * effectiveTpAtr
                : entryPrice - atr * effectiveTpAtr;

        m.phase = "in_position";
        m.entryBar = i;
        m.entryPrice = entryPrice;
        m.stop = stop;
        m.tp = tp;
        m.blockEvidence = m.blockEvidence?.map((block) => ({
          ...block,
          entryBar: block.entryBar ?? i,
          entryTime: block.entryTime ?? candleTimeIso(c) ?? null,
          stopPrice: stop,
          targetPrice: tp,
        }));
        m.leverage = resolveEventSequenceLeverage({
          params: levParams,
          atr,
          price: entryPrice,
          peakEquity,
          equity,
        });
      }
    }
  }

  // Force-close any open positions at end
  for (const m of machines) {
    if (m.phase !== "in_position" || !m.geo || m.entryPrice == null) continue;
    const last = candles[candles.length - 1];
    const feePct = input.feeRate * 2;
    const slipPct = input.slippageRate * 2;
    const raw =
      m.side === "LONG"
        ? (last.close - m.entryPrice) / m.entryPrice
        : (m.entryPrice - last.close) / m.entryPrice;
    const pnlPct = raw - feePct - slipPct;
    const lev = m.leverage ?? 1;
    const ledger = eventSequenceLedger({
      equityBefore: equity,
      baseBalancePct: def.positionSizing.baseBalancePct,
      leverage: lev,
      entryPrice: m.entryPrice,
      raw,
      feePct,
      slipPct,
      pnlPctStored: pnlPct * lev,
    });
    equity *= 1 + pnlPct * def.positionSizing.baseBalancePct * lev;
    if (equity > peakEquity) peakEquity = equity;
    const geo = m.geo;
    trades.push({
      symbol,
      side: m.side,
      signalType: "EVENT_SEQUENCE",
      entryBar: m.entryBar ?? candles.length - 1,
      exitBar: candles.length - 1,
      entryPrice: m.entryPrice,
      exitPrice: last.close,
      stopLoss: m.stop ?? m.entryPrice,
      takeProfit: m.tp ?? m.entryPrice,
      stopPrice: m.stop,
      takeProfitPrice: m.tp,
      leverage: lev,
      pnlPct: pnlPct * lev,
      feePct,
      slippagePct: slipPct,
      ...ledger,
      exitReason: "end",
      holdBars: candles.length - 1 - (m.entryBar ?? 0),
      entryTime: candles[m.entryBar ?? 0]?.openTime,
      exitTime: last.openTime,
      patternType: geo.patternType,
      zoneHigh: geo.zoneHigh,
      zoneLow: geo.zoneLow,
      creationBar: geo.creationBar,
      revisitBar: geo.revisitBar,
      confirmationBar: geo.confirmationBar,
      breakBar: geo.breakBar,
      invalidationBar: geo.invalidationBar,
      penetrationPct: geo.penetrationPct,
      creationCandleTime: candleTimeIso(candles[geo.creationBar]),
      revisitCandleTime:
        geo.revisitBar != null
          ? candleTimeIso(candles[geo.revisitBar])
          : undefined,
      confirmationCandleTime:
        geo.confirmationBar != null
          ? candleTimeIso(candles[geo.confirmationBar])
          : undefined,
      breakCandleTime:
        geo.breakBar != null
          ? candleTimeIso(candles[geo.breakBar])
          : undefined,
      invalidationCandleTime:
        geo.invalidationBar != null
          ? candleTimeIso(candles[geo.invalidationBar])
          : undefined,
      lineAnchors: geo.lineAnchors,
      patternBlocks: m.blockEvidence?.map((block) => ({
        ...block,
        revisitBar: block.revisitBar ?? geo.revisitBar ?? null,
        revisitTime:
          block.revisitTime ??
          (geo.revisitBar != null
            ? candleTimeIso(candles[geo.revisitBar]) ?? null
            : null),
        confirmationBar: block.confirmationBar ?? geo.confirmationBar ?? null,
        confirmationTime:
          block.confirmationTime ??
          (geo.confirmationBar != null
            ? candleTimeIso(candles[geo.confirmationBar]) ?? null
            : null),
        entryBar: block.entryBar ?? m.entryBar ?? null,
        entryTime:
          block.entryTime ??
          (m.entryBar != null
            ? candleTimeIso(candles[m.entryBar]) ?? null
            : null),
        stopPrice: m.stop ?? null,
        targetPrice: m.tp ?? null,
        exitPrice: last.close,
        exitBar: candles.length - 1,
        exitTime: candleTimeIso(last) ?? null,
        exitReason: "end",
      })),
      combinationOperator: seq.combination?.operator,
      combinationResult: m.blockEvidence
        ? m.blockEvidence.every(
            (block) =>
              block.status === "detected" ||
              block.status === "optional_skipped",
          )
        : undefined,
      combinationScore: m.combinationScore,
      combinationPriority: m.combinationPriority,
    });
    equityCurve.push(equity);
  }

  return {
    trades,
    equityCurve,
    endingBalance: equity,
    rejectedSetups,
    assumptionsKo: ASSUMPTIONS_KO,
  };
}

export interface EventSequencePaperSignal {
  side: "LONG" | "SHORT" | "NONE";
  passed: boolean;
  reason: string;
  rejectReason: string | null;
  patternType: string | null;
  zoneHigh: number | null;
  zoneLow: number | null;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
}

/**
 * Paper / live dry-run signal from eventSequence at the latest completed bar.
 * Reuses the same deterministic walker as backtest (no look-ahead).
 * Emits LONG/SHORT only when an entry occurs on the last candle.
 */
export function evaluateEventSequencePaperSignal(input: {
  def: CanonicalStrategyDefinition;
  symbol: string;
  candles: OhlcvCandle[];
  feeRate?: number;
  slippageRate?: number;
}): EventSequencePaperSignal {
  const none = (
    reason: string,
  ): EventSequencePaperSignal => ({
    side: "NONE",
    passed: false,
    reason: "",
    rejectReason: reason,
    patternType: null,
    zoneHigh: null,
    zoneLow: null,
    entryPrice: null,
    stopPrice: null,
    targetPrice: null,
  });

  if (!input.def.eventSequence || !validateEventSequence(input.def.eventSequence).ok) {
    return none("eventSequence 없음 또는 무효");
  }
  if (input.candles.length < 25) {
    return none("캔들 부족");
  }

  const result = runEventSequenceBacktest({
    def: input.def,
    symbol: input.symbol,
    candles: input.candles,
    balance: 10_000,
    feeRate: input.feeRate ?? 0.0004,
    slippageRate: input.slippageRate ?? 0.0002,
  });

  const lastBar = input.candles.length - 1;
  const entered = result.trades.find((t) => t.entryBar === lastBar);
  if (!entered) {
    const lastReject = result.rejectedSetups
      .filter((r) => r.bar === lastBar)
      .at(-1);
    return none(
      lastReject
        ? `거부: ${lastReject.reasonCode}`
        : "eventSequence 진입 조건 미충족",
    );
  }

  return {
    side: entered.side,
    passed: true,
    reason: `eventSequence ${entered.patternType ?? "pattern"} 진입`,
    rejectReason: null,
    patternType: entered.patternType ?? null,
    zoneHigh: entered.zoneHigh ?? null,
    zoneLow: entered.zoneLow ?? null,
    entryPrice: entered.entryPrice,
    stopPrice: entered.stopPrice ?? entered.stopLoss ?? null,
    targetPrice: entered.takeProfitPrice ?? entered.takeProfit ?? null,
  };
}
