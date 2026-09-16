/**
 * Event-Sequence Paper closed-trade lifecycle (P3-A8.3.3).
 * Owns only positions stamped paperLifecycleModel=event_sequence_paper_v1.
 * Does not change SAFE Paper, Research, Backtest, or Live arithmetic.
 */

import { applyPaperRealizedPnl, getAccountState } from "../accountStateStore";
import { reconcileEventSequencePaperAccountState } from "./paperEventSequenceAccountReconcile";
import { computeAtrSeries } from "../indicator/indicatorEngine";
import { appendUnifiedTradeResult } from "../metrics/tradeResultStore";
import type { UnifiedTradeResult } from "../metrics/types";
import { formatHoldingTime } from "../metrics/tradeResult";
import { getOpenPositions, upsertPosition } from "../positionManager";
import { resolveEventSequenceLeverage } from "../strategySearch/leverageMode";
import type { CanonicalStrategyDefinition } from "../strategy/definition/types";
import type { StrategyEventSequence } from "../strategy/definition/eventSequence";
import {
  decideEventSequencePositionExit,
  readEventSequenceLifecycleParams,
} from "../strategy/eventSequenceBacktest";
import {
  settleEventSequenceClose,
  type EventSequenceCostModel,
} from "../strategy/eventSequenceCostModel";
import { resolveTimeframe } from "../data/timeframes";
import type { OhlcvCandle } from "../data/ohlcvTypes";
import { isCandleFinalized } from "../data/candleTime";
import {
  EVENT_SEQUENCE_PAPER_LIFECYCLE_V1,
  type EventSequencePaperCandleAudit,
  type EventSequencePaperPositionState,
  type Position,
} from "../types";
import { applyActivePaperSessionRealizedPnl } from "./paperSessionStore";
import type { PaperEventSequenceCostAssumptions } from "./paperEventSequenceCostModel";

export const EVENT_SEQUENCE_PAPER_MANUAL_CLOSE = "manual_close" as const;
export const EVENT_SEQUENCE_PAPER_EMERGENCY_CLOSE = "emergency_close" as const;

export function isEventSequencePaperOwned(
  position?: Position | null,
): boolean {
  return (
    position?.paperLifecycleModel === EVENT_SEQUENCE_PAPER_LIFECYCLE_V1 &&
    position.eventSequencePaper?.paperLifecycleModel ===
      EVENT_SEQUENCE_PAPER_LIFECYCLE_V1 &&
    !position.eventSequencePaper.settlementId
  );
}

export { isCandleFinalized } from "../data/candleTime";

function eventSequenceSizing(input: {
  equity: number;
  baseBalancePct: number;
  leverage: number;
  fillEntryPrice: number;
}): { margin: number; quantity: number } {
  const margin = Math.max(0, input.equity * input.baseBalancePct);
  const quantity =
    margin > 0 && input.fillEntryPrice > 0
      ? (margin * input.leverage) / input.fillEntryPrice
      : 0;
  return {
    margin: Number(margin.toFixed(6)),
    quantity: Number(quantity.toFixed(8)),
  };
}

function levParamsFromDefinition(
  def: CanonicalStrategyDefinition,
): Record<string, unknown> | null {
  const meta = (def.metadata ?? {}) as Record<string, unknown>;
  if (
    meta.lev_base != null ||
    meta.lev_min != null ||
    meta.lev_max != null ||
    meta.use_dynamic_leverage != null
  ) {
    return meta;
  }
  return null;
}

/**
 * Snapshot the actual finalized OhlcvCandle the ES manager processed.
 * closeTime falls back to openTime+intervalMs-1 only when the engine candle
 * omitted closeTime — never reconstructed from currentPrice or later market data.
 */
export function eventSequencePaperCandleAuditFromFinalized(input: {
  symbol: string;
  intervalMs: number;
  candle: OhlcvCandle;
}): EventSequencePaperCandleAudit {
  const closeTime =
    typeof input.candle.closeTime === "number" &&
    Number.isFinite(input.candle.closeTime)
      ? input.candle.closeTime
      : input.candle.openTime + input.intervalMs - 1;
  return {
    symbol: input.symbol,
    intervalMs: input.intervalMs,
    openTime: input.candle.openTime,
    closeTime,
    open: input.candle.open,
    high: input.candle.high,
    low: input.candle.low,
    close: input.candle.close,
  };
}

export function openEventSequencePaperPosition(input: {
  symbol: string;
  strategyId: string;
  strategyName: string;
  paramsHash: string;
  /** Owning Paper session. Required for new positions; never guessed. */
  paperSessionId: string;
  paperStrategyId: string;
  def: CanonicalStrategyDefinition;
  side: "LONG" | "SHORT";
  rawEntryPrice: number;
  executionEntryPrice: number;
  stopPrice: number;
  targetPrice: number;
  entryCandleOpenTime: number;
  maxHoldBars: number;
  invalidateRule: string;
  geo: EventSequencePaperPositionState["geo"];
  costModel: EventSequenceCostModel;
  costAssumptions: PaperEventSequenceCostAssumptions;
  rankingCompatibilityGroup?: string;
  timeframe: string;
  leverage?: number;
  nowMs?: number;
}): Position {
  reconcileEventSequencePaperAccountState();
  const intervalMs = resolveTimeframe(
    input.timeframe === "1m" ||
      input.timeframe === "3m" ||
      input.timeframe === "5m" ||
      input.timeframe === "15m" ||
      input.timeframe === "1h"
      ? input.timeframe
      : "15m",
  ).intervalMs;
  const equity = getAccountState().balanceUsdt;
  const resolvedLev = resolveEventSequenceLeverage({
    params: levParamsFromDefinition(input.def),
    atr: Math.max(input.rawEntryPrice * 0.001, 1e-9),
    price: input.rawEntryPrice,
    equity,
    peakEquity: equity,
  });
  const leverage =
    input.leverage != null && Number.isFinite(input.leverage) && input.leverage > 0
      ? input.leverage
      : Number.isFinite(resolvedLev) && resolvedLev > 0
        ? resolvedLev
        : 1;
  const sized = eventSequenceSizing({
    equity,
    baseBalancePct: input.def.positionSizing.baseBalancePct,
    leverage,
    fillEntryPrice: input.executionEntryPrice,
  });
  const state: EventSequencePaperPositionState = {
    version: "event_sequence_paper_state_v1",
    paperLifecycleModel: EVENT_SEQUENCE_PAPER_LIFECYCLE_V1,
    strategyId: input.strategyId,
    costModel: input.costModel,
    rankingCompatibilityGroup: input.rankingCompatibilityGroup,
    feeRate: input.costAssumptions.feeRate,
    slippageRate: input.costAssumptions.slippageRate,
    fundingRate: input.costAssumptions.fundingRate,
    applyFunding: input.costAssumptions.applyFunding,
    applySpread: input.costAssumptions.applySpread,
    spreadRate: input.costAssumptions.spreadRate,
    side: input.side,
    rawEntryPrice: input.rawEntryPrice,
    executionEntryPrice: input.executionEntryPrice,
    stop: input.stopPrice,
    tp: input.targetPrice,
    entryCandleOpenTime: input.entryCandleOpenTime,
    lastProcessedCandleOpenTime: input.entryCandleOpenTime,
    maxHoldBars: input.maxHoldBars,
    leverage,
    baseBalancePct: input.def.positionSizing.baseBalancePct,
    invalidateRule: input.invalidateRule,
    geo: input.geo,
    timeframe: input.timeframe,
    intervalMs,
    eventSequenceSnapshot: input.def.eventSequence ?? null,
    settlementId: null,
  };
  const position: Position = {
    id: `paper-es-${input.symbol}-${Date.now()}`,
    symbol: input.symbol,
    side: input.side === "LONG" ? "Long" : "Short",
    entryPrice: input.executionEntryPrice,
    currentPrice: input.executionEntryPrice,
    quantity: sized.quantity,
    leverage,
    unrealizedPnl: 0,
    margin: sized.margin,
    stopLoss: input.stopPrice,
    takeProfit: input.targetPrice,
    mode: "PAPER",
    serviceState: "paper",
    openedAt: new Date().toISOString(),
    entryReason: `eventSequence ${input.geo.patternType} 진입`,
    paramsHash: input.paramsHash,
    strategyName: input.strategyName,
    trailingDistance: 0,
    maxHoldBars: input.maxHoldBars,
    barsHeld: 0,
    paperLifecycleModel: EVENT_SEQUENCE_PAPER_LIFECYCLE_V1,
    paperSessionId: input.paperSessionId,
    paperStrategyId: input.paperStrategyId,
    eventSequencePaper: state,
  };
  upsertPosition(position);
  return position;
}

function findBarIndex(candles: OhlcvCandle[], openTime: number): number {
  return candles.findIndex((c) => c.openTime === openTime);
}

export function listFinalizedUnprocessedCandles(input: {
  candles: OhlcvCandle[];
  lastProcessedCandleOpenTime: number;
  intervalMs: number;
  nowMs: number;
}): OhlcvCandle[] {
  return input.candles.filter(
    (c) =>
      c.openTime > input.lastProcessedCandleOpenTime &&
      isCandleFinalized(c, input.nowMs, input.intervalMs),
  );
}

export function settleEventSequencePaperClose(input: {
  position: Position;
  rawExitPrice: number;
  exitReason: string;
  equityBefore?: number;
}): UnifiedTradeResult | null {
  const state = input.position.eventSequencePaper;
  if (!state || state.paperLifecycleModel !== EVENT_SEQUENCE_PAPER_LIFECYCLE_V1) {
    return null;
  }
  if (state.settlementId) return null;
  const settlementId = `${input.position.id}:${input.exitReason}:${input.rawExitPrice}`;
  const equityBefore = input.equityBefore ?? getAccountState().balanceUsdt;
  const settlement = settleEventSequenceClose({
    side: state.side,
    rawEntryPrice: state.rawEntryPrice,
    rawExitPrice: input.rawExitPrice,
    feeRate: state.feeRate,
    slippageRate: state.slippageRate,
    leverage: state.leverage,
    equityBefore,
    baseBalancePct: state.baseBalancePct,
    costModel: state.costModel,
    applyFunding: state.applyFunding,
    fundingRate: state.fundingRate,
    applySpread: state.applySpread,
    spreadRate: state.spreadRate,
  });
  const openedMs = input.position.openedAt
    ? Date.parse(input.position.openedAt)
    : NaN;
  const timestamp = new Date().toISOString();
  const holdingTimeMs =
    Number.isFinite(openedMs) ? Math.max(0, Date.parse(timestamp) - openedMs) : 0;
  const trade: UnifiedTradeResult = {
    id: settlementId,
    symbol: input.position.symbol,
    side: state.side,
    strategyId: state.strategyId,
    entryPrice: settlement.fillEntryPrice,
    exitPrice: settlement.fillExitPrice,
    quantity: settlement.quantity,
    leverage: state.leverage,
    fee: settlement.feeCostUsdt,
    funding: settlement.fundingCostUsdt,
    slippage: settlement.slippageCostUsdt,
    spread: settlement.spreadCostUsdt,
    grossPnl: settlement.grossPnlUsdt,
    netPnl: settlement.netPnlUsdt,
    grossPct: Number((settlement.grossReturn * 100).toFixed(4)),
    netPct: Number((settlement.pnlPct * 100).toFixed(4)),
    realizedUsdt: settlement.netPnlUsdt,
    holdingTimeMs,
    holdingTimeLabel: formatHoldingTime(holdingTimeMs),
    exitReason: input.exitReason,
    timestamp,
    mode: "PAPER",
    openedAt: input.position.openedAt,
  };
  const closed: Position = {
    ...input.position,
    side: "Flat",
    quantity: 0,
    unrealizedPnl: 0,
    currentPrice: settlement.fillExitPrice,
    eventSequencePaper: { ...state, settlementId },
  };
  upsertPosition(closed);
  appendUnifiedTradeResult(trade);
  applyPaperRealizedPnl(settlement.netPnlUsdt);
  applyActivePaperSessionRealizedPnl(settlement.netPnlUsdt);
  return trade;
}

export function closeEventSequencePaperPosition(input: {
  position: Position;
  rawExitPrice: number;
  exitReason: string;
}): UnifiedTradeResult | null {
  if (!input.position.eventSequencePaper) return null;
  if (input.position.eventSequencePaper.settlementId) return null;
  return settleEventSequencePaperClose(input);
}

export function manageEventSequencePaperPositions(input?: {
  loadCandles?: (symbol: string) => Promise<OhlcvCandle[]>;
  candlesBySymbol?: Record<string, OhlcvCandle[]>;
  nowMs?: number;
}): Promise<{ checked: number; closed: number; advanced: number }> {
  reconcileEventSequencePaperAccountState();
  const nowMs = input?.nowMs ?? Date.now();
  const open = getOpenPositions().filter(isEventSequencePaperOwned);
  let closed = 0;
  let advanced = 0;

  const runOne = (position: Position, candles: OhlcvCandle[]) => {
    const state = position.eventSequencePaper!;
    const pending = listFinalizedUnprocessedCandles({
      candles,
      lastProcessedCandleOpenTime: state.lastProcessedCandleOpenTime,
      intervalMs: state.intervalMs,
      nowMs,
    });
    if (pending.length === 0) return;
    const atrFull = computeAtrSeries(
      candles.map((c) => c.high),
      candles.map((c) => c.low),
      candles.map((c) => c.close),
      14,
    );
    const entryIndex = findBarIndex(candles, state.entryCandleOpenTime);
    let nextState = { ...state };
    let nextPosition = { ...position, eventSequencePaper: nextState };
    for (const candle of pending) {
      const bar = findBarIndex(candles, candle.openTime);
      if (bar < 0) continue;
      const holdBars = entryIndex >= 0 ? bar - entryIndex : nextPosition.barsHeld ?? 0;
      const atr = Math.max(atrFull[bar] ?? 0, candle.close * 0.001);
      const seq = nextState.eventSequenceSnapshot as StrategyEventSequence | undefined;
      const decided = decideEventSequencePositionExit({
        side: nextState.side,
        candle,
        stop: nextState.stop,
        tp: nextState.tp,
        holdBars,
        maxHoldBars: nextState.maxHoldBars,
        geo: nextState.geo,
        invalidateRule: nextState.invalidateRule,
        combination: seq?.combination,
        window: candles.slice(0, bar + 1),
        bar,
        atr,
        creationStep: seq?.steps.find((s) => s.kind === "pattern_creation"),
      });
      nextState = {
        ...nextState,
        geo: decided.geo,
        lastProcessedCandleOpenTime: candle.openTime,
        lastProcessedFinalizedCandle: eventSequencePaperCandleAuditFromFinalized({
          symbol: position.symbol,
          intervalMs: nextState.intervalMs,
          candle,
        }),
      };
      nextPosition = {
        ...nextPosition,
        barsHeld: holdBars,
        currentPrice: candle.close,
        eventSequencePaper: nextState,
      };
      advanced += 1;
      if (decided.exitPrice != null) {
        upsertPosition(nextPosition);
        const trade = settleEventSequencePaperClose({
          position: nextPosition,
          rawExitPrice: decided.exitPrice,
          exitReason: decided.exitReason,
        });
        if (trade) closed += 1;
        return;
      }
    }
    upsertPosition(nextPosition);
  };

  const jobs = open.map(async (position) => {
    const candles =
      input?.candlesBySymbol?.[position.symbol] ??
      (input?.loadCandles ? await input.loadCandles(position.symbol) : []);
    if (candles.length > 0) runOne(position, candles);
  });
  return Promise.all(jobs).then(() => ({
    checked: open.length,
    closed,
    advanced,
  }));
}

export { readEventSequenceLifecycleParams, eventSequenceSizing };
