import { evaluateLiveSafetyGate, evaluateLiveSafetyGateAsync } from "./liveSafetyGate";
import {
  acquireExecutionLock,
  createLiveExecutionContext,
  releaseExecutionLock,
  registerServerTpSl,
  setLiveExecutionStatus,
  validateServerTpSlRequired
} from "./serverTpSlManager";
import { getRextoraSettings } from "./settings/settingsService";
import { getExchangeInfo } from "./binance/binanceReadOnlyService";
import {
  cancelAllFuturesOrders,
  changeLeverage,
  changeMarginType,
  placeMarketOrder
} from "./binance/binanceTradeService";
import { calculateTpSlPrices, normalizeLiveQuantity, placeServerTpSlAfterEntry } from "./tpSlPlacement";
import { appendAuditLog } from "./storage/auditStore";
import { appendLearningEntry } from "./learningLogger";
import { recordTradeOutcome } from "./learningEngine";
import {
  notifyLiveEntrySuccess,
  notifyLiveEntryAttempt,
  notifyLiveOrderError,
  notifyLiveTpSlFailure,
  notifyLiveTpSlPlaced
} from "./telegramOperation";
import { syncPositionsFromBinance } from "./positionSyncService";
import { getMarketDataSnapshot } from "./marketDataStore";
import { markEmergencyStop } from "./runtimeState";
import type { AiCandidate, EngineResult } from "./types";

export type { LiveExecutionContext } from "./serverTpSlManager";

export function preflightLiveExecution(): EngineResult & { blockedReasons: string[] } {
  const gate = evaluateLiveSafetyGate({
    mode: "LIVE",
    operatorLiveStartRequested: true,
    fatalOnly: true
  });
  const tpSl = validateServerTpSlRequired("LIVE");
  const blockedReasons = [...gate.blockedReasons];
  if (!tpSl.ok) blockedReasons.push(tpSl.message);

  return {
    ok: gate.passed && tpSl.ok,
    mode: "LIVE",
    serviceState: gate.passed && tpSl.ok ? "live-ready" : "live-blocked",
    message: gate.passed && tpSl.ok ? "LIVE preflight passed" : "LIVE preflight blocked",
    blockedReasons: Array.from(new Set(blockedReasons))
  };
}

async function closeLivePositionAfterTpSlFailure(
  symbol: string,
  side: "LONG" | "SHORT",
  context: NonNullable<ReturnType<typeof createLiveExecutionContext>>
): Promise<void> {
  const exitSide = side === "LONG" ? "SELL" : "BUY";
  await cancelAllFuturesOrders(symbol, context).catch(() => undefined);
  await placeMarketOrder({ symbol, side: exitSide, quantity: 0, closePosition: true }, context).catch(() => undefined);
  await syncPositionsFromBinance().catch(() => undefined);
}

export async function executeLiveEntry(candidate: AiCandidate): Promise<EngineResult> {
  const gate = await evaluateLiveSafetyGateAsync({
    mode: "LIVE",
    operatorLiveStartRequested: true,
    executionInProgress: true,
    candidate
  });

  if (!gate.passed) {
    appendAuditLog({
      type: "live_execution_attempt",
      actor: "liveExecutionEngine",
      message: "LIVE entry blocked by gate",
      mode: "LIVE",
      correlationId: `live-entry-${Date.now()}`,
      symbol: candidate.symbol,
      details: { blockedReasons: gate.blockedReasons, candidateScore: candidate.aiScore }
    });
    appendLearningEntry({
      symbol: candidate.symbol,
      direction: candidate.direction,
      entryReason: candidate.entryReason ?? candidate.signalReason ?? "live entry blocked",
      exitReason: gate.blockedReasons[0] ?? "gate blocked",
      result: "실패",
      pnlPct: 0,
      signalType: candidate.signalType,
      mode: "LIVE"
    });
    recordTradeOutcome({
      mode: "LIVE",
      symbol: candidate.symbol,
      side: candidate.direction,
      signalType: candidate.signalType,
      aiScore: candidate.aiScore,
      finalScore: candidate.finalScore ?? candidate.aiScore,
      leverage: candidate.leverage ?? 1,
      entryPrice: 0,
      result: "loss",
      exitReason: "error",
      timestamp: new Date().toISOString()
    });
    return {
      ok: false,
      mode: "LIVE",
      serviceState: "live-blocked",
      message: gate.blockedReasons[0] ?? "LIVE blocked",
      blockedReasons: gate.blockedReasons
    };
  }

  if (!acquireExecutionLock()) {
    return {
      ok: false,
      mode: "LIVE",
      serviceState: "live-blocked",
      message: "다른 LIVE 실행이 진행 중입니다.",
      blockedReasons: ["execution lock active"]
    };
  }

  setLiveExecutionStatus("LIVE_EXECUTING");
  const context = createLiveExecutionContext(undefined, { preflightPassed: true, riskPassed: true });
  if (!context) {
    releaseExecutionLock();
    setLiveExecutionStatus("LIVE_BLOCKED");
    return { ok: false, mode: "LIVE", serviceState: "live-blocked", message: "LiveExecutionContext 생성 실패", blockedReasons: gate.blockedReasons };
  }

  const positionSide = candidate.direction === "롱" ? "LONG" : "SHORT";
  const side = positionSide === "LONG" ? "BUY" : "SELL";

  try {
    const settings = getRextoraSettings();
    const exchange = await getExchangeInfo();
    const coin = getMarketDataSnapshot().coins.find((c) => c.symbol === candidate.symbol);
    const entryPrice = coin?.price ?? 100;
    const leverage = candidate.leverage ?? (settings.execution.defaultLeverage || settings.trading.defaultLeverage);
    const orderUsdt =
      settings.execution.positionSizeMode === "BALANCE_PERCENT"
        ? (settings.execution.positionSizePct / 100) * 10_000
        : settings.execution.fixedOrderUsdt;
    const quantity = normalizeLiveQuantity(candidate.symbol, orderUsdt / entryPrice, exchange.data);

    await notifyLiveEntryAttempt(candidate.symbol, candidate.direction, candidate.aiScore);

    if (settings.execution.cancelOpenOrdersBeforeEntry) {
      await cancelAllFuturesOrders(candidate.symbol, context).catch(() => undefined);
    }

    await changeLeverage(candidate.symbol, leverage, context).catch(() => undefined);
    await changeMarginType(candidate.symbol, settings.trading.marginType, context).catch(() => undefined);

    const order = await placeMarketOrder({ symbol: candidate.symbol, side, quantity }, context);
    const fillPrice = Number(order.price) || entryPrice;

    const tpSl = await placeServerTpSlAfterEntry({
      symbol: candidate.symbol,
      side: positionSide,
      entryPrice: fillPrice,
      context
    });

    const shouldClose =
      !tpSl.ok &&
      (settings.execution.closePositionOnTpSlFailure ||
        settings.tpSl.closePositionIfTpSlFails ||
        settings.tpSl.fallbackCloseIfTpSlFails);

    if (!tpSl.ok || !tpSl.verified) {
      registerServerTpSl({
        symbol: candidate.symbol,
        tpOrderId: tpSl.tpOrderId,
        slOrderId: tpSl.slOrderId,
        verified: false,
        message: tpSl.message
      });

      if (shouldClose) {
        await closeLivePositionAfterTpSlFailure(candidate.symbol, positionSide, context);
        await notifyLiveTpSlFailure(candidate.symbol, tpSl.message);
        markEmergencyStop("TP/SL 배치 실패로 긴급 중단");
        setLiveExecutionStatus("LIVE_EMERGENCY_STOPPED");
        appendAuditLog({
          type: "tpsl_failure",
          actor: "liveExecutionEngine",
          message: "TP/SL failure — position closed",
          mode: "LIVE",
          correlationId: context.requestId,
          symbol: candidate.symbol,
          details: { tpSl, orderId: order.orderId }
        });
        appendLearningEntry({
          symbol: candidate.symbol,
          direction: candidate.direction,
          entryReason: candidate.entryReason ?? "live entry",
          exitReason: "TP/SL 실패 긴급 청산",
          result: "실패",
          pnlPct: 0,
          signalType: candidate.signalType,
          mode: "LIVE"
        });
        recordTradeOutcome({
          mode: "LIVE",
          symbol: candidate.symbol,
          side: candidate.direction,
          signalType: candidate.signalType,
          aiScore: candidate.aiScore,
          finalScore: candidate.finalScore ?? candidate.aiScore,
          leverage: candidate.leverage ?? leverage,
          entryPrice: fillPrice,
          result: "loss",
          exitReason: "error",
          timestamp: new Date().toISOString()
        });
        return {
          ok: false,
          mode: "LIVE",
          serviceState: "live-error",
          message: "TP/SL 실패로 포지션을 즉시 청산했습니다.",
          blockedReasons: [tpSl.message]
        };
      }

      setLiveExecutionStatus("LIVE_ERROR");
      return {
        ok: false,
        mode: "LIVE",
        serviceState: "live-error",
        message: "TP/SL 실패 — 포지션 보호 미완료",
        blockedReasons: [tpSl.message]
      };
    }

    registerServerTpSl({
      symbol: candidate.symbol,
      tpOrderId: tpSl.tpOrderId,
      slOrderId: tpSl.slOrderId,
      verified: tpSl.verified,
      message: tpSl.message
    });

    const prices = calculateTpSlPrices(fillPrice, positionSide);
    await syncPositionsFromBinance();
    await notifyLiveEntrySuccess({
      symbol: candidate.symbol,
      direction: candidate.direction,
      leverage: candidate.leverage ?? leverage,
      quantity,
      entryPrice: fillPrice,
      stopLoss: prices.stopLossPrice,
      takeProfit: prices.takeProfitPrice
    });
    await notifyLiveTpSlPlaced({
      symbol: candidate.symbol,
      side: candidate.direction,
      entryPrice: fillPrice,
      quantity,
      tpPrice: prices.takeProfitPrice,
      slPrice: prices.stopLossPrice,
      tpOrderId: tpSl.tpOrderId,
      slOrderId: tpSl.slOrderId
    });

    appendAuditLog({
      type: "live_execution_attempt",
      actor: "liveExecutionEngine",
      message: "LIVE entry with TP/SL verified",
      mode: "LIVE",
      correlationId: context.requestId,
      symbol: candidate.symbol,
      details: {
        orderId: order.orderId,
        tpOrderId: tpSl.tpOrderId,
        slOrderId: tpSl.slOrderId,
        candidateScore: candidate.aiScore,
        costPassed: candidate.costPassed
      }
    });

    appendLearningEntry({
      symbol: candidate.symbol,
      direction: candidate.direction,
      entryReason: candidate.entryReason ?? candidate.signalReason ?? "live entry",
      exitReason: "open",
      result: "성공",
      pnlPct: 0,
      signalType: candidate.signalType,
      mode: "LIVE"
    });
    recordTradeOutcome({
      mode: "LIVE",
      symbol: candidate.symbol,
      side: candidate.direction,
      signalType: candidate.signalType,
      aiScore: candidate.aiScore,
      finalScore: candidate.finalScore ?? candidate.aiScore,
      leverage,
      entryPrice: fillPrice,
      result: "unknown",
      exitReason: "unknown",
      timestamp: new Date().toISOString()
    });

    setLiveExecutionStatus("LIVE_READY");
    return { ok: true, mode: "LIVE", serviceState: "live-ready", message: `LIVE entry placed orderId=${order.orderId}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "LIVE entry failed";
    appendAuditLog({
      type: "live_execution_attempt",
      actor: "liveExecutionEngine",
      message,
      mode: "LIVE",
      correlationId: context.requestId,
      symbol: candidate.symbol
    });
    await notifyLiveOrderError(candidate.symbol, message);
    setLiveExecutionStatus("LIVE_ERROR");
    return { ok: false, mode: "LIVE", serviceState: "live-error", message, blockedReasons: [message] };
  } finally {
    releaseExecutionLock();
  }
}

export async function executeLiveExit(symbol: string): Promise<EngineResult> {
  const preflight = preflightLiveExecution();
  if (!preflight.ok) return preflight;
  return { ok: true, mode: "LIVE", serviceState: "live-ready", message: `${symbol} LIVE exit workflow ready` };
}

export async function executeLiveEmergencyStop(): Promise<EngineResult> {
  setLiveExecutionStatus("LIVE_EMERGENCY_STOPPED");
  markEmergencyStop("LIVE emergency stop");
  return { ok: true, mode: "LIVE", serviceState: "live-blocked", message: "LIVE emergency stop engaged" };
}
