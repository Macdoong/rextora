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
import { detectFvg, type FvgParams } from "./conditions/fvg";
import {
  detectTrendLine,
  type TrendLineParams,
} from "./conditions/trendLine";
import {
  detectSupportResistance,
  type SrParams,
} from "./conditions/supportResistance";
import type { CanonicalStrategyDefinition } from "./definition/types";
import {
  validateEventSequence,
  type PatternFamily,
  type StrategyEventSequence,
  type StrategyEventStep,
} from "./definition/eventSequence";

export interface RejectedSetup {
  bar: number;
  reasonCode: string;
  patternType: string;
  measured: number | null;
  required: number | null;
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
  penetrationPct?: number;
  creationCandleTime?: string;
  revisitCandleTime?: string;
  confirmationCandleTime?: string;
  lineAnchors?: Array<{ bar: number; price: number }>;
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
  | "in_position";

interface PatternGeometry {
  patternType: string;
  zoneHigh: number;
  zoneLow: number;
  creationBar: number;
  revisitBar?: number;
  confirmationBar?: number;
  penetrationPct?: number;
  lineAnchors?: Array<{ bar: number; price: number }>;
}

interface SideMachine {
  side: "LONG" | "SHORT";
  phase: Phase;
  geo: PatternGeometry | null;
  entryBar?: number;
  entryPrice?: number;
  stop?: number;
  tp?: number;
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
  lineAnchors?: Array<{ bar: number; price: number }>;
}

/**
 * Detect a fresh pattern using only candles[0..bar] (caller must slice).
 */
function detectPatternAt(
  family: PatternFamily | undefined,
  candles: OhlcvCandle[],
  bar: number,
  atr: number,
  side: "LONG" | "SHORT",
  creationStep: StrategyEventStep | undefined,
): DetectedPattern | null {
  const lookback = numParam(creationStep, "lookback", 40);
  const dirParam = strParam(
    creationStep,
    "direction",
    side === "LONG" ? "bullish" : "bearish",
  );
  const obSide = dirParam === "bearish" ? "bearish" : "bullish";
  const fam = family ?? "order_block";

  if (fam === "order_block") {
    const { zone } = detectOrderBlocks(
      candles,
      bar,
      atr,
      obSide,
      defaultObParams(lookback),
    );
    if (!zone) return null;
    // Fresh creation: zone formed on/near this bar (impulse just completed)
    if (bar - zone.createdAt > 2) return null;
    return {
      patternType: "order_block",
      zoneHigh: zone.high,
      zoneLow: zone.low,
      creationBar: zone.createdAt,
    };
  }

  if (fam === "fvg") {
    const { zone } = detectFvg(
      candles,
      bar,
      atr,
      obSide,
      defaultFvgParams(lookback),
    );
    if (!zone) return null;
    if (bar - zone.createdAt > 2) return null;
    return {
      patternType: "fvg",
      zoneHigh: zone.high,
      zoneLow: zone.low,
      creationBar: zone.createdAt,
    };
  }

  if (fam === "trendline") {
    const kind =
      side === "LONG" ? "support_trend_line" : "resistance_trend_line";
    const { hit, line } = detectTrendLine(
      candles,
      bar,
      kind,
      defaultTlParams(lookback),
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
        { bar: line.startIndex, price: line.startPrice },
        { bar: line.endIndex, price: line.endPrice },
      ],
    };
  }

  if (fam === "support_resistance") {
    const kind = side === "LONG" ? "support_zone" : "resistance_zone";
    const { hit, zone } = detectSupportResistance(
      candles,
      bar,
      kind,
      defaultSrParams(lookback),
    );
    if (!hit || !zone) return null;
    return {
      patternType: "support_resistance",
      zoneHigh: zone.high,
      zoneLow: zone.low,
      creationBar: zone.createdAt,
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

export function runEventSequenceBacktest(input: {
  def: CanonicalStrategyDefinition;
  symbol: string;
  candles: OhlcvCandle[];
  balance: number;
  feeRate: number;
  slippageRate: number;
}): EventSequenceBacktestResult {
  const seq = input.def.eventSequence;
  if (!seq || !validateEventSequence(seq).ok) {
    return {
      trades: [],
      equityCurve: [input.balance],
      endingBalance: input.balance,
      rejectedSetups: [
        {
          bar: -1,
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
  const stopStep = stepByKind(seq, "stop_loss");
  const tpStep = stepByKind(seq, "take_profit");
  const invalidationStep = stepByKind(seq, "invalidation");
  const maxHoldStep = stepByKind(seq, "max_hold_exit");

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
  const requireCloseDir = boolParam(
    confirmationStep,
    "requireCloseInDirection",
    true,
  );
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
  const equityCurve = [equity];
  let cooldown = 0;

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

        if (
          exitPrice == null &&
          isInvalidated(c, m.geo, m.side, invalidateRule)
        ) {
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
          equity *= 1 + pnlPct * def.positionSizing.baseBalancePct;

          const geo = m.geo;
          trades.push({
            symbol,
            side: m.side,
            signalType: "EVENT_SEQUENCE",
            entryBar: m.entryBar ?? i,
            exitBar: i,
            entryPrice: m.entryPrice ?? c.close,
            exitPrice,
            stopLoss: m.stop,
            takeProfit: m.tp,
            stopPrice: m.stop,
            takeProfitPrice: m.tp,
            leverage: 1,
            pnlPct,
            feePct,
            slippagePct: slipPct,
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
            lineAnchors: geo.lineAnchors,
          });

          m.phase = "idle";
          m.geo = null;
          m.entryBar = undefined;
          m.entryPrice = undefined;
          m.stop = undefined;
          m.tp = undefined;
          cooldown = def.execution.cooldownBars;
          equityCurve.push(equity);
        }
        continue;
      }

      if (cooldown > 0) continue;
      if (machines.some((x) => x.phase === "in_position")) continue;

      // --- state machine (idle → … → confirmed → entry) ---
      if (m.phase === "idle") {
        const detected = detectPatternAt(
          family,
          window,
          i,
          atr,
          m.side,
          creationStep,
        );
        if (detected) {
          m.phase = "pattern_created";
          m.geo = {
            patternType: detected.patternType,
            zoneHigh: detected.zoneHigh,
            zoneLow: detected.zoneLow,
            creationBar: detected.creationBar,
            lineAnchors: detected.lineAnchors,
          };
        }
        continue;
      }

      if (!m.geo) {
        m.phase = "idle";
        continue;
      }

      if (isInvalidated(c, m.geo, m.side, invalidateRule)) {
        rejectedSetups.push({
          bar: i,
          reasonCode: "pattern_invalidated",
          patternType: m.geo.patternType,
          measured: m.side === "LONG" ? c.close : c.close,
          required: m.side === "LONG" ? m.geo.zoneLow : m.geo.zoneHigh,
        });
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
            rejectedSetups.push({
              bar: i,
              reasonCode: "penetration_too_shallow",
              patternType: m.geo.patternType,
              measured,
              required: penetrationRequired,
            });
            m.phase = "idle";
            m.geo = null;
          }
          continue;
        }
        m.geo = { ...m.geo, penetrationPct: measured };
        m.phase = "penetrated";
        // fall through for same-bar confirmation
      }

      if (m.phase === "penetrated") {
        if (requireCloseDir && !closeInDirection(c, m.side)) {
          continue;
        }
        m.geo = { ...m.geo, confirmationBar: i };
        m.phase = "confirmed";
      }

      if (m.phase === "confirmed" && m.geo) {
        const entryPrice = c.close;
        let stop: number;
        if (stopAnchor === "zone_low" && m.side === "LONG") {
          stop = m.geo.zoneLow - atr * stopAtrMult;
        } else if (stopAnchor === "zone_high" && m.side === "SHORT") {
          stop = m.geo.zoneHigh + atr * stopAtrMult;
        } else if (m.side === "LONG") {
          stop = entryPrice - atr * stopAtrMult;
        } else {
          stop = entryPrice + atr * stopAtrMult;
        }
        const tp =
          m.side === "LONG"
            ? entryPrice + atr * tpAtrMult
            : entryPrice - atr * tpAtrMult;

        m.phase = "in_position";
        m.entryBar = i;
        m.entryPrice = entryPrice;
        m.stop = stop;
        m.tp = tp;
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
    equity *= 1 + pnlPct * def.positionSizing.baseBalancePct;
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
      leverage: 1,
      pnlPct,
      feePct,
      slippagePct: slipPct,
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
      lineAnchors: geo.lineAnchors,
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
