/**
 * Paper scan loop — executes the paperActive strategy identity.
 * SAFE is only used when it is the selected paperActive strategy.
 */

import { computeIndicators } from "../indicator/indicatorEngine";
import {
  evaluateSafeV44Signal,
  type SafeV44SignalResult,
} from "../signal/safeV44SignalEngine";
import { evaluateCostGuard } from "../cost/costGuard";
import { calculateSafeV44Risk } from "../risk/safeV44RiskEngine";
import { loadOhlcvCandles } from "../data/candleLoader";
import { getWatchedSymbols } from "../marketWatcherService";
import { getOpenPositions } from "../positionManager";
import { executePaperEntryFromSignal } from "../execution/safePaperExecution";
import { managePaperPositions } from "../paperExecutionEngine";
import {
  manageEventSequencePaperPositions,
  openEventSequencePaperPosition,
} from "../paper/paperEventSequenceLifecycle";
import {
  isSameEventSequencePaperDecisionCandle,
  markEventSequencePaperDecisionEvaluated,
  resetEventSequencePaperDecisionRuntimeForTests,
  selectEventSequencePaperDecisionCandle,
} from "../paper/paperEventSequenceDecisionCandle";
import { resolveTimeframe, isSupportedTimeframe } from "../data/timeframes";
import {
  lastEntryBarIndexFromCandleTimes,
  latestFinalizedCandle,
} from "../data/candleTime";
import { getAccountState } from "../accountStateStore";
import type { SafeV44Params } from "../strategy/strategyTypes";
import { storedToDefinition } from "../strategy/definition/bridge";
import { evaluateBuilderSignal } from "../strategy/conditions/evaluator";
import { evaluateEventSequencePaperSignal } from "../strategy/eventSequenceBacktest";
import { getEventSequenceMinimumHistoryBars } from "../strategy/eventSequenceHistoryRequirement";
import { reconcileEventSequencePaperAccountState } from "../paper/paperEventSequenceAccountReconcile";
import {
  assertPaperStrategyIntegrity,
  resolvePaperExecutionStrategy,
} from "./paperStrategyResolver";
import {
  getExecutablePaperSession,
  paperSessionCapitalUsdt,
} from "../paper/paperSessionStore";
import { resolvePaperExecutionSymbols } from "../paper/paperExecutionSymbols";
import { getRextoraSettings } from "../settings/settingsService";
import {
  PAPER_COST_MODEL_UNRESOLVED,
  resolvePaperEventSequenceCostModel,
} from "../paper/paperEventSequenceCostModel";

export type SafePaperObserveCode =
  | "WAITING_FOR_FINALIZED_CANDLE"
  | "SAME_FINALIZED_CANDLE"
  | "COOLDOWN"
  | "VALID_SIGNAL"
  | "NORMAL_REJECTION"
  | "POSITION_OPEN"
  | "WARMUP"
  | "COST_BLOCKED"
  | "ENTRY_BLOCKED"
  | "POSITION_LIMIT";

export interface SafeScanSnapshot {
  symbol: string;
  signal: SafeV44SignalResult;
  status: "진입" | "관측" | "차단" | "보유중";
  reason: string;
  observeCode?: SafePaperObserveCode;
  strategyId?: string;
  strategyHash?: string;
}

let lastEntryBars = new Map<string, number>();
const lastEntryFinalizedOpenTime = new Map<string, number>();
const lastEvaluatedFinalizedOpenTime = new Map<string, number>();
let lastSignals: SafeScanSnapshot[] = [];

export function resetSafePaperCandleRuntimeForTests(): void {
  lastEntryBars.clear();
  lastEntryFinalizedOpenTime.clear();
  lastEvaluatedFinalizedOpenTime.clear();
  lastSignals = [];
  resetEventSequencePaperDecisionRuntimeForTests();
}

function safePaperEvalKey(input: {
  sessionId?: string | null;
  strategyId: string;
  symbol: string;
  interval: string;
}): string {
  return `${input.sessionId ?? "none"}:${input.strategyId}:${input.symbol}:${input.interval}`;
}

function resolveSafePaperTimeframe(timeframe: string | undefined): {
  interval: string;
  intervalMs: number;
} {
  const id = timeframe && isSupportedTimeframe(timeframe) ? timeframe : "15m";
  const spec = resolveTimeframe(id);
  return { interval: spec.binanceInterval, intervalMs: spec.intervalMs };
}

export function getLastSafeSignals(limit = 30): SafeScanSnapshot[] {
  return lastSignals.slice(0, limit);
}

function noneSignal(
  symbol: string,
  paramsHash: string,
  rejectReason: string,
): SafeV44SignalResult {
  return {
    symbol,
    side: "NONE",
    signalType: "none",
    passed: false,
    score: 0,
    entryReason: "",
    rejectReason,
    indicators: null,
    paramsHash,
    cooldownActive: false,
    inRange: false,
  };
}

/**
 * Deterministic paper scan for the executable Paper session strategy.
 * Blocked when session is paused/ready/pending. Registry paperActive is
 * fallback only when no current session exists.
 */
export async function runSafePaperScanLoop(options?: {
  maxSymbols?: number;
  maxNewEntries?: number;
  nowMs?: number;
}): Promise<{
  scanned: number;
  entries: number;
  signals: SafeScanSnapshot[];
  strategyId: string;
  paramsHash: string;
  strategyHash: string;
}> {
  let resolved;
  try {
    resolved = resolvePaperExecutionStrategy();
  } catch (err) {
    const message = err instanceof Error ? err.message : "paper execution blocked";
    lastSignals = [];
    return {
      scanned: 0,
      entries: 0,
      signals: [],
      strategyId: "",
      paramsHash: "",
      strategyHash: "",
      // callers ignore extra fields
      ...( { blocked: true, blockReason: message } as object ),
    } as {
      scanned: number;
      entries: number;
      signals: SafeScanSnapshot[];
      strategyId: string;
      paramsHash: string;
      strategyHash: string;
    };
  }
  assertPaperStrategyIntegrity(resolved);
  if (resolved.sessionId) {
    try {
      const { recordPaperHeartbeat } = await import("../paper/paperSessionService");
      recordPaperHeartbeat(resolved.sessionId);
    } catch {
      // Heartbeat is best-effort.
    }
  }
  const {
    strategy,
    paramsHash,
    strategyHash,
    strategyId,
    name,
    executionKind,
  } = resolved;

  const paperSession = getExecutablePaperSession();
  if (executionKind === "event_sequence") {
    reconcileEventSequencePaperAccountState();
  }
  const esCost = resolvePaperEventSequenceCostModel({
    strategy,
    session: paperSession,
  });

  const maxSymbols = options?.maxSymbols ?? 40;
  const maxNewEntries = options?.maxNewEntries ?? 2;
  let allowedSymbols: string[] | undefined;
  try {
    const allowed = getRextoraSettings().market.allowedSymbols;
    if (Array.isArray(allowed) && allowed.length > 0) {
      allowedSymbols = allowed;
    }
  } catch {
    allowedSymbols = undefined;
  }
  const resolvedSymbols = resolvePaperExecutionSymbols({
    strategy,
    session: paperSession,
    watchedSymbols: getWatchedSymbols(),
    allowedSymbols,
  });
  const symbols = resolvedSymbols.symbols.slice(0, maxSymbols);
  const open = getOpenPositions();
  const openSymbols = new Set(open.map((p) => p.symbol));
  const balance = paperSession
    ? paperSessionCapitalUsdt(paperSession)
    : getAccountState().availableBalanceUsdt || 10_000;
  const params = strategy.params as SafeV44Params;

  const signals: SafeScanSnapshot[] = [];
  let entries = 0;

  await managePaperPositions();
  await manageEventSequencePaperPositions({
    loadCandles: async (symbol) => {
      const { candles } = await loadOhlcvCandles(symbol, {
        limit: 250,
        allowSynthetic: true,
      });
      return candles;
    },
  });

  if (
    executionKind === "event_sequence" &&
    esCost.status === "unresolved"
  ) {
    const blocked = symbols.slice(0, Math.min(symbols.length, 1)).map((symbol) => ({
      symbol: symbol || "—",
      signal: noneSignal(
        symbol || "—",
        paramsHash,
        esCost.reason,
      ),
      status: "차단" as const,
      reason: esCost.operatorLabel,
      strategyId,
      strategyHash,
    }));
    lastSignals = blocked;
    return {
      scanned: 0,
      entries: 0,
      signals: lastSignals,
      strategyId,
      paramsHash,
      strategyHash,
      ...( {
        blocked: true,
        blockReason: esCost.reason,
        blockCode: PAPER_COST_MODEL_UNRESOLVED,
      } as object ),
    } as {
      scanned: number;
      entries: number;
      signals: SafeScanSnapshot[];
      strategyId: string;
      paramsHash: string;
      strategyHash: string;
    };
  }

  for (const symbol of symbols) {
    if (openSymbols.has(symbol)) {
      signals.push({
        symbol,
        signal: noneSignal(symbol, paramsHash, "이미 포지션 보유"),
        status: "보유중",
        reason: "이미 포지션 보유",
        observeCode: "POSITION_OPEN",
        strategyId,
        strategyHash,
      });
      continue;
    }

    const warmUp =
      executionKind === "event_sequence" && strategy.definition
        ? getEventSequenceMinimumHistoryBars(storedToDefinition(strategy))
        : Math.max(50, Number(params.ema_slow ?? 50) + 5);
    const paperTf = resolveSafePaperTimeframe(strategy.timeframe);
    const { candles } = await loadOhlcvCandles(symbol, {
      interval: paperTf.interval,
      limit: Math.max(250, warmUp + 50),
      allowSynthetic: true,
    });
    if (candles.length < warmUp) {
      signals.push({
        symbol,
        signal: noneSignal(symbol, paramsHash, "캔들 부족"),
        status: "차단",
        reason: "캔들 부족",
        observeCode: "WARMUP",
        strategyId,
        strategyHash,
      });
      continue;
    }

    let signal: SafeV44SignalResult;
    let patternFillPrice: number | null = null;
    let safeFinalizedOpenTime: number | null = null;
    let safeEvalKey: string | null = null;
    let safeIntervalMs: number | null = null;

    if (executionKind === "condition_builder" && strategy.definition) {
      const def = storedToDefinition(strategy);
      const bar = candles.length - 1;
      const built = evaluateBuilderSignal(def, { candles, bar });
      const side =
        built === "LONG" || built === "SHORT" ? built : "NONE";
      const series = computeIndicators(candles, params);
      const ind = series.snapshots[bar] ?? null;
      signal = {
        symbol,
        side,
        signalType:
          side === "LONG"
            ? "trend_long"
            : side === "SHORT"
              ? "trend_short"
              : "none",
        passed: side !== "NONE",
        score: side !== "NONE" ? 1 : 0,
        entryReason: side !== "NONE" ? `조건 빌더 ${side}` : "",
        rejectReason: side === "NONE" ? "조건 미충족" : null,
        indicators: ind,
        paramsHash,
        cooldownActive: false,
        inRange: false,
      };
    } else if (executionKind === "event_sequence" && strategy.definition) {
      const def = storedToDefinition(strategy);
      const tf =
        strategy.timeframe === "1m" ||
        strategy.timeframe === "3m" ||
        strategy.timeframe === "5m" ||
        strategy.timeframe === "15m" ||
        strategy.timeframe === "1h"
          ? strategy.timeframe
          : "15m";
      const intervalMs = resolveTimeframe(tf).intervalMs;
      const nowMs = options?.nowMs ?? Date.now();
      const decision = selectEventSequencePaperDecisionCandle({
        candles,
        nowMs,
        intervalMs,
      });
      if (!decision) {
        signals.push({
          symbol,
          signal: noneSignal(symbol, paramsHash, "확정 봉 대기"),
          status: "관측",
          reason: "확정 봉 대기",
          observeCode: "WAITING_FOR_FINALIZED_CANDLE",
          strategyId,
          strategyHash,
        });
        continue;
      }
      const esEvalScope = {
        sessionId: paperSession?.id,
        strategyId,
        symbol,
        intervalMs,
      };
      if (
        isSameEventSequencePaperDecisionCandle(esEvalScope, decision.openTime)
      ) {
        signals.push({
          symbol,
          signal: noneSignal(symbol, paramsHash, "동일 확정 봉"),
          status: "관측",
          reason: "동일 확정 봉",
          observeCode: "SAME_FINALIZED_CANDLE",
          strategyId,
          strategyHash,
        });
        continue;
      }
      const last = decision.candle;
      const es = evaluateEventSequencePaperSignal({
        def,
        symbol,
        candles: decision.candles,
        costModel: esCost.costModel,
        feeRate: esCost.costAssumptions.feeRate,
        slippageRate: esCost.costAssumptions.slippageRate,
        applyFunding: esCost.costAssumptions.applyFunding,
        fundingRate: esCost.costAssumptions.fundingRate,
        applySpread: esCost.costAssumptions.applySpread,
        spreadRate: esCost.costAssumptions.spreadRate,
      });
      markEventSequencePaperDecisionEvaluated(esEvalScope, decision.openTime);
      const series = computeIndicators(decision.candles, params);
      const bar = decision.index;
      const ind = series.snapshots[decision.candles.length - 1] ?? null;
      signal = {
        symbol,
        side: es.side,
        signalType:
          es.side === "LONG"
            ? "trend_long"
            : es.side === "SHORT"
              ? "trend_short"
              : "none",
        passed: es.passed,
        score: es.passed ? 1 : 0,
        entryReason: es.reason,
        rejectReason: es.rejectReason,
        indicators: ind,
        paramsHash,
        cooldownActive: false,
        inRange: false,
      };
      if (!es.passed || es.side === "NONE" || es.entryPrice == null) {
        signals.push({
          symbol,
          signal,
          status: "관측",
          reason: es.rejectReason ?? "조건 미충족",
          observeCode: "NORMAL_REJECTION",
          strategyId,
          strategyHash,
        });
        continue;
      }
      if (entries < maxNewEntries && open.length + entries < 5) {
        if (!paperSession?.id || !strategyId) {
          signals.push({
            symbol,
            signal: {
              ...signal,
              passed: false,
              rejectReason: "OWNERSHIP_AUTHORITY_NOT_AVAILABLE",
            },
            status: "차단",
            reason: "OWNERSHIP_AUTHORITY_NOT_AVAILABLE",
            observeCode: "NORMAL_REJECTION",
            strategyId,
            strategyHash,
          });
          continue;
        }
        openEventSequencePaperPosition({
          symbol,
          strategyId,
          paperSessionId: paperSession.id,
          paperStrategyId: strategyId,
          strategyName: name,
          paramsHash,
          def,
          side: es.side,
          rawEntryPrice: es.rawEntryPrice ?? es.entryPrice,
          executionEntryPrice: es.entryPrice,
          stopPrice: es.stopPrice ?? es.entryPrice,
          targetPrice: es.targetPrice ?? es.entryPrice,
          entryCandleOpenTime: es.entryCandleOpenTime ?? last.openTime,
          maxHoldBars: es.maxHoldBars ?? def.risk.maxHoldBars,
          invalidateRule: es.invalidateRule ?? "close_beyond_zone",
          geo: {
            patternType: es.patternType ?? "order_block",
            zoneHigh: es.zoneHigh ?? es.entryPrice,
            zoneLow: es.zoneLow ?? es.entryPrice,
            creationBar: es.creationBar ?? es.entryBar ?? bar,
          },
          costModel: es.costModel,
          costAssumptions: esCost.costAssumptions,
          rankingCompatibilityGroup:
            strategy.executionProvenance?.rankingCompatibilityGroup,
          timeframe: tf,
          leverage: es.leverage ?? undefined,
        });
        entries += 1;
        lastEntryBars.set(symbol, bar);
        signals.push({
          symbol,
          signal,
          status: "진입",
          reason: signal.entryReason,
          observeCode: "VALID_SIGNAL",
          strategyId,
          strategyHash,
        });
        continue;
      }
      signals.push({
        symbol,
        signal,
        status: "관측",
        reason: "포지션 한도 — 신호만 기록",
        observeCode: "POSITION_LIMIT",
        strategyId,
        strategyHash,
      });
      continue;
    } else {
      // safe_params only — never substitute SAFE when another kind was selected
      const nowMs = options?.nowMs ?? Date.now();
      const finalized = latestFinalizedCandle(candles, nowMs, paperTf.intervalMs);
      if (!finalized) {
        signals.push({
          symbol,
          signal: noneSignal(symbol, paramsHash, "확정 봉 대기"),
          status: "관측",
          reason: "확정 봉 대기",
          observeCode: "WAITING_FOR_FINALIZED_CANDLE",
          strategyId,
          strategyHash,
        });
        continue;
      }

      const evalKey = safePaperEvalKey({
        sessionId: paperSession?.id,
        strategyId,
        symbol,
        interval: paperTf.interval,
      });
      if (lastEvaluatedFinalizedOpenTime.get(evalKey) === finalized.candle.openTime) {
        signals.push({
          symbol,
          signal: noneSignal(symbol, paramsHash, "동일 확정 봉"),
          status: "관측",
          reason: "동일 확정 봉",
          observeCode: "SAME_FINALIZED_CANDLE",
          strategyId,
          strategyHash,
        });
        continue;
      }

      const series = computeIndicators(candles, params);
      signal = evaluateSafeV44Signal({
        symbol,
        series,
        params,
        paramsHash,
        barIndex: finalized.index,
        lastEntryBarIndex: lastEntryBarIndexFromCandleTimes({
          finalizedIndex: finalized.index,
          finalizedOpenTime: finalized.candle.openTime,
          lastEntryOpenTime: lastEntryFinalizedOpenTime.get(evalKey) ?? null,
          intervalMs: paperTf.intervalMs,
        }),
      });
      lastEvaluatedFinalizedOpenTime.set(evalKey, finalized.candle.openTime);
      safeFinalizedOpenTime = finalized.candle.openTime;
      safeEvalKey = evalKey;
      safeIntervalMs = paperTf.intervalMs;
    }

    if (!signal.passed || signal.side === "NONE" || !signal.indicators) {
      const cooldown =
        signal.cooldownActive ||
        (signal.rejectReason ?? "").startsWith("쿨다운");
      signals.push({
        symbol,
        signal,
        status: "관측",
        reason: signal.rejectReason ?? "조건 미충족",
        observeCode: cooldown ? "COOLDOWN" : "NORMAL_REJECTION",
        strategyId,
        strategyHash,
      });
      continue;
    }

    const risk = calculateSafeV44Risk({
      entryPrice:
        patternFillPrice != null && Number.isFinite(patternFillPrice)
          ? patternFillPrice
          : signal.indicators.close,
      atr: signal.indicators.atr,
      atrPct: signal.indicators.atrPct,
      side: signal.side,
      signalType: signal.signalType,
      balance,
      params,
    });

    const cost =
      executionKind === "event_sequence"
        ? { passed: true, reason: "" }
        : evaluateCostGuard({
            entryPrice: risk.entryPrice,
            takeProfitPrice: risk.takeProfitPrice,
            side: signal.side,
            atr: signal.indicators.atr,
            params,
          });

    if (!cost.passed) {
      signals.push({
        symbol,
        signal: { ...signal, passed: false, rejectReason: cost.reason },
        status: "차단",
        reason: cost.reason,
        observeCode: "COST_BLOCKED",
        strategyId,
        strategyHash,
      });
      continue;
    }

    if (entries < maxNewEntries && open.length + entries < 5) {
      const result = await executePaperEntryFromSignal({
        signal,
        risk,
        strategyName: name,
        paramsHash,
        paperSessionId: paperSession?.id,
        paperStrategyId: strategyId,
        entrySignalCandleOpenTime: safeFinalizedOpenTime ?? undefined,
        entrySignalIntervalMs: safeIntervalMs ?? undefined,
      });
      if (result.ok) {
        entries += 1;
        lastEntryBars.set(symbol, signal.indicators.barIndex);
        if (safeEvalKey && safeFinalizedOpenTime != null) {
          lastEntryFinalizedOpenTime.set(safeEvalKey, safeFinalizedOpenTime);
        }
        signals.push({
          symbol,
          signal,
          status: "진입",
          reason: signal.entryReason,
          observeCode: "VALID_SIGNAL",
          strategyId,
          strategyHash,
        });
        continue;
      }
      signals.push({
        symbol,
        signal,
        status: "차단",
        reason: result.message,
        observeCode: "ENTRY_BLOCKED",
        strategyId,
        strategyHash,
      });
      continue;
    }

    signals.push({
      symbol,
      signal,
      status: "관측",
      reason: "포지션 한도 — 신호만 기록",
      observeCode: "POSITION_LIMIT",
      strategyId,
      strategyHash,
    });
  }

  lastSignals = signals
    .filter((s) => s.status === "진입" || s.signal.passed || s.status === "보유중")
    .concat(signals.filter((s) => s.status === "관측" || s.status === "차단"))
    .slice(0, 50);

  return {
    scanned: symbols.length,
    entries,
    signals: lastSignals,
    strategyId,
    paramsHash,
    strategyHash,
  };
}

/** Explicit alias for lifecycle naming. */
export const runPaperScanLoop = runSafePaperScanLoop;
