/**
 * Live Event-Sequence scan → existing Live entry path.
 *
 * Signal authority: evaluateEventSequencePaperSignal (shared walker, signal only).
 * Order authority: executeLiveEntry (existing Live engine).
 * Does not open Paper positions, copy Paper lifecycle, call SAFE entry,
 * or use Event-Sequence accounting / Paper PnL.
 */

import { evaluateLiveSafetyGate } from "../liveSafetyGate";
import { executeLiveEntry } from "../liveExecutionEngine";
import { appendAuditLog } from "../storage/auditStore";
import { loadOhlcvCandles } from "../data/candleLoader";
import { getWatchedSymbols } from "../marketWatcherService";
import { getStrategyById } from "../strategy/strategyStore";
import { storedToDefinition, type StoredStrategyV1 } from "../strategy/definition/bridge";
import { evaluateEventSequencePaperSignal } from "../strategy/eventSequenceBacktest";
import { EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1 } from "../strategy/eventSequenceCostModel";
import { getEventSequenceMinimumHistoryBars } from "../strategy/eventSequenceHistoryRequirement";
import { resolveTimeframe } from "../data/timeframes";
import type { AiCandidate } from "../types";

function toLiveCandidateFromEventSequence(input: {
  symbol: string;
  side: "LONG" | "SHORT";
  entryReason: string;
  leverage: number;
  expectedProfitPct: number;
  stopLossDistancePct: number;
}): AiCandidate {
  return {
    rank: 1,
    symbol: input.symbol,
    direction: input.side === "LONG" ? "롱" : "숏",
    signalType: input.side === "LONG" ? "long_candidate" : "short_candidate",
    aiScore: 1,
    finalScore: 1,
    expectedProfitPct: input.expectedProfitPct,
    expectedCostPct: 0.08,
    stopLossDistancePct: input.stopLossDistancePct,
    riskGrade: "중간",
    status: "진입 가능",
    entryReason: input.entryReason,
    signalReason: input.entryReason,
    costPassed: true,
    riskPassed: true,
    serviceState: "live-ready",
    leverage: input.leverage,
  };
}

export async function runEventSequenceLiveEntries(input: {
  strategyId: string;
  maxEntries?: number;
}): Promise<{ entered: number; scanned: number; blockedReason?: string }> {
  const strategy = getStrategyById(input.strategyId) as StoredStrategyV1 | undefined;
  if (!strategy?.definition?.eventSequence) {
    return { entered: 0, scanned: 0, blockedReason: "이 전략은 실전 실행 경로가 없습니다." };
  }
  const def = storedToDefinition(strategy);
  const maxEntries = input.maxEntries ?? 1;
  const declared = (strategy.symbols ?? [])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const symbols = (declared.length ? declared : getWatchedSymbols()).slice(0, 30);
  const tf =
    strategy.timeframe === "1m" ||
    strategy.timeframe === "3m" ||
    strategy.timeframe === "5m" ||
    strategy.timeframe === "15m" ||
    strategy.timeframe === "1h"
      ? strategy.timeframe
      : "15m";
  const interval = resolveTimeframe(tf).binanceInterval;
  const warmUp = getEventSequenceMinimumHistoryBars(def);
  let entered = 0;
  let scanned = 0;

  for (const symbol of symbols) {
    if (entered >= maxEntries) break;
    scanned += 1;
    const { candles, source } = await loadOhlcvCandles(symbol, {
      interval,
      limit: Math.max(250, warmUp + 50),
      allowSynthetic: false,
    });
    if (source !== "binance" || candles.length < warmUp) continue;

    const es = evaluateEventSequencePaperSignal({
      def,
      symbol,
      candles,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    });
    if (!es.passed || es.side === "NONE" || es.entryPrice == null) continue;

    const entry = es.entryPrice;
    const tp = es.targetPrice ?? entry;
    const sl = es.stopPrice ?? entry;
    const tpDist = es.side === "LONG" ? (tp - entry) / entry : (entry - tp) / entry;
    const slDist = es.side === "LONG" ? (entry - sl) / entry : (sl - entry) / entry;
    const candidate = toLiveCandidateFromEventSequence({
      symbol,
      side: es.side,
      entryReason: es.reason,
      leverage: es.leverage ?? 1,
      expectedProfitPct: tpDist * 100,
      stopLossDistancePct: slDist * 100,
    });

    const gate = evaluateLiveSafetyGate({
      mode: "LIVE",
      operatorLiveStartRequested: true,
      candidate,
      executionInProgress: true,
    });
    if (!gate.passed) continue;

    const result = await executeLiveEntry(candidate);
    appendAuditLog({
      type: result.ok ? "live_entry" : "candidate_block",
      actor: "botRuntime",
      message: result.message,
      mode: "LIVE",
      correlationId: `es-live-${Date.now()}`,
      symbol,
      details: {
        strategyId: strategy.id,
        paramsHash: strategy.paramsHash,
        executionKind: "event_sequence",
      },
    });
    if (result.ok) entered += 1;
  }

  return { entered, scanned };
}
