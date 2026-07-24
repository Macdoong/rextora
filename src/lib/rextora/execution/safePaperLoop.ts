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
import { getAccountState } from "../accountStateStore";
import type { SafeV44Params } from "../strategy/strategyTypes";
import { storedToDefinition } from "../strategy/definition/bridge";
import { evaluateBuilderSignal } from "../strategy/conditions/evaluator";
import { evaluateEventSequencePaperSignal } from "../strategy/eventSequenceBacktest";
import {
  assertPaperStrategyIntegrity,
  resolvePaperExecutionStrategy,
} from "./paperStrategyResolver";

export interface SafeScanSnapshot {
  symbol: string;
  signal: SafeV44SignalResult;
  status: "진입" | "관측" | "차단" | "보유중";
  reason: string;
  strategyId?: string;
  strategyHash?: string;
}

let lastEntryBars = new Map<string, number>();
let lastSignals: SafeScanSnapshot[] = [];

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
 * Deterministic paper scan for the currently paperActive strategy.
 * Does not hard-code SAFE unless SAFE is the active selection.
 */
export async function runSafePaperScanLoop(options?: {
  maxSymbols?: number;
  maxNewEntries?: number;
}): Promise<{
  scanned: number;
  entries: number;
  signals: SafeScanSnapshot[];
  strategyId: string;
  paramsHash: string;
}> {
  const resolved = resolvePaperExecutionStrategy();
  assertPaperStrategyIntegrity(resolved);
  const { strategy, paramsHash, strategyId, name, executionKind } = resolved;

  const maxSymbols = options?.maxSymbols ?? 40;
  const maxNewEntries = options?.maxNewEntries ?? 2;
  const symbols = getWatchedSymbols().slice(0, maxSymbols);
  const open = getOpenPositions();
  const openSymbols = new Set(open.map((p) => p.symbol));
  const balance = getAccountState().availableBalanceUsdt || 10_000;
  const params = strategy.params as SafeV44Params;

  const signals: SafeScanSnapshot[] = [];
  let entries = 0;

  await managePaperPositions();

  for (const symbol of symbols) {
    if (openSymbols.has(symbol)) {
      signals.push({
        symbol,
        signal: noneSignal(symbol, paramsHash, "이미 포지션 보유"),
        status: "보유중",
        reason: "이미 포지션 보유",
        strategyId,
        strategyHash: paramsHash,
      });
      continue;
    }

    const warmUp = Math.max(50, Number(params.ema_slow ?? 50) + 5);
    const { candles } = await loadOhlcvCandles(symbol, {
      limit: Math.max(250, warmUp + 50),
      allowSynthetic: true,
    });
    if (candles.length < warmUp) {
      signals.push({
        symbol,
        signal: noneSignal(symbol, paramsHash, "캔들 부족"),
        status: "차단",
        reason: "캔들 부족",
        strategyId,
        strategyHash: paramsHash,
      });
      continue;
    }

    let signal: SafeV44SignalResult;

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
      const es = evaluateEventSequencePaperSignal({
        def,
        symbol,
        candles,
      });
      const series = computeIndicators(candles, params);
      const bar = candles.length - 1;
      const ind = series.snapshots[bar] ?? null;
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
    } else {
      // safe_params only — never substitute SAFE when another kind was selected
      const series = computeIndicators(candles, params);
      signal = evaluateSafeV44Signal({
        symbol,
        series,
        params,
        paramsHash,
        lastEntryBarIndex: lastEntryBars.get(symbol) ?? null,
      });
    }

    if (!signal.passed || signal.side === "NONE" || !signal.indicators) {
      signals.push({
        symbol,
        signal,
        status: "관측",
        reason: signal.rejectReason ?? "조건 미충족",
        strategyId,
        strategyHash: paramsHash,
      });
      continue;
    }

    const risk = calculateSafeV44Risk({
      entryPrice: signal.indicators.close,
      atr: signal.indicators.atr,
      atrPct: signal.indicators.atrPct,
      side: signal.side,
      signalType: signal.signalType,
      balance,
      params,
    });

    const cost = evaluateCostGuard({
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
        strategyId,
        strategyHash: paramsHash,
      });
      continue;
    }

    if (entries < maxNewEntries && open.length + entries < 5) {
      const result = await executePaperEntryFromSignal({
        signal,
        risk,
        strategyName: name,
        paramsHash,
      });
      if (result.ok) {
        entries += 1;
        lastEntryBars.set(symbol, signal.indicators.barIndex);
        signals.push({
          symbol,
          signal,
          status: "진입",
          reason: signal.entryReason,
          strategyId,
          strategyHash: paramsHash,
        });
        continue;
      }
      signals.push({
        symbol,
        signal,
        status: "차단",
        reason: result.message,
        strategyId,
        strategyHash: paramsHash,
      });
      continue;
    }

    signals.push({
      symbol,
      signal,
      status: "관측",
      reason: "포지션 한도 — 신호만 기록",
      strategyId,
      strategyHash: paramsHash,
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
  };
}

/** Explicit alias for lifecycle naming. */
export const runPaperScanLoop = runSafePaperScanLoop;
