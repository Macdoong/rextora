import { loadSafeV44Strategy } from "../strategy/safeV44Strategy";
import { computeIndicators } from "../indicator/indicatorEngine";
import { evaluateSafeV44Signal, type SafeV44SignalResult } from "../signal/safeV44SignalEngine";
import { evaluateCostGuard } from "../cost/costGuard";
import { calculateSafeV44Risk } from "../risk/safeV44RiskEngine";
import { loadOhlcvCandles } from "../data/candleLoader";
import { getWatchedSymbols } from "../marketWatcherService";
import { getOpenPositions } from "../positionManager";
import { executePaperEntryFromSignal } from "../execution/safePaperExecution";
import { managePaperPositions } from "../paperExecutionEngine";
import { getAccountState } from "../accountStateStore";

export interface SafeScanSnapshot {
  symbol: string;
  signal: SafeV44SignalResult;
  status: "진입" | "관측" | "차단" | "보유중";
  reason: string;
}

let lastEntryBars = new Map<string, number>();
let lastSignals: SafeScanSnapshot[] = [];

export function getLastSafeSignals(limit = 30): SafeScanSnapshot[] {
  return lastSignals.slice(0, limit);
}

/**
 * Deterministic SAFE paper scan — no AI ranking / queue.
 */
export async function runSafePaperScanLoop(options?: {
  maxSymbols?: number;
  maxNewEntries?: number;
}): Promise<{ scanned: number; entries: number; signals: SafeScanSnapshot[] }> {
  const strategy = loadSafeV44Strategy({ throwOnHashMismatch: false });
  if (!strategy.hashVerified && strategy.sourceStatus === "hash_mismatch") {
    throw new Error("SAFE params_hash mismatch — refusing paper scan");
  }

  const maxSymbols = options?.maxSymbols ?? 40;
  const maxNewEntries = options?.maxNewEntries ?? 2;
  const symbols = getWatchedSymbols().slice(0, maxSymbols);
  const open = getOpenPositions();
  const openSymbols = new Set(open.map((p) => p.symbol));
  const balance = getAccountState().availableBalanceUsdt || 10_000;

  const signals: SafeScanSnapshot[] = [];
  let entries = 0;

  await managePaperPositions();

  for (const symbol of symbols) {
    if (openSymbols.has(symbol)) {
      signals.push({
        symbol,
        signal: {
          symbol,
          side: "NONE",
          signalType: "none",
          passed: false,
          score: 0,
          entryReason: "",
          rejectReason: "이미 포지션 보유",
          indicators: null,
          paramsHash: strategy.paramsHash,
          cooldownActive: false,
          inRange: false
        },
        status: "보유중",
        reason: "이미 포지션 보유"
      });
      continue;
    }

    const { candles } = await loadOhlcvCandles(symbol, { limit: 250, allowSynthetic: true });
    if (candles.length < strategy.params.ema_slow + 5) {
      signals.push({
        symbol,
        signal: {
          symbol,
          side: "NONE",
          signalType: "none",
          passed: false,
          score: 0,
          entryReason: "",
          rejectReason: "캔들 부족",
          indicators: null,
          paramsHash: strategy.paramsHash,
          cooldownActive: false,
          inRange: false
        },
        status: "차단",
        reason: "캔들 부족"
      });
      continue;
    }

    const series = computeIndicators(candles, strategy.params);
    const signal = evaluateSafeV44Signal({
      symbol,
      series,
      params: strategy.params,
      paramsHash: strategy.paramsHash,
      lastEntryBarIndex: lastEntryBars.get(symbol) ?? null
    });

    if (!signal.passed || signal.side === "NONE" || !signal.indicators) {
      signals.push({
        symbol,
        signal,
        status: "관측",
        reason: signal.rejectReason ?? "조건 미충족"
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
      params: strategy.params
    });

    const cost = evaluateCostGuard({
      entryPrice: risk.entryPrice,
      takeProfitPrice: risk.takeProfitPrice,
      side: signal.side,
      atr: signal.indicators.atr,
      params: strategy.params
    });

    if (!cost.passed) {
      signals.push({
        symbol,
        signal: { ...signal, passed: false, rejectReason: cost.reason },
        status: "차단",
        reason: cost.reason
      });
      continue;
    }

    if (entries < maxNewEntries && open.length + entries < 5) {
      const result = await executePaperEntryFromSignal({
        signal,
        risk,
        strategyName: strategy.name,
        paramsHash: strategy.paramsHash
      });
      if (result.ok) {
        entries += 1;
        lastEntryBars.set(symbol, signal.indicators.barIndex);
        signals.push({ symbol, signal, status: "진입", reason: signal.entryReason });
        continue;
      }
      signals.push({
        symbol,
        signal,
        status: "차단",
        reason: result.message
      });
      continue;
    }

    signals.push({
      symbol,
      signal,
      status: "관측",
      reason: "포지션 한도 — 신호만 기록"
    });
  }

  lastSignals = signals
    .filter((s) => s.status === "진입" || s.signal.passed || s.status === "보유중")
    .concat(signals.filter((s) => s.status === "관측" || s.status === "차단"))
    .slice(0, 50);

  return { scanned: symbols.length, entries, signals: lastSignals };
}
