import { recordPaperEntryFromSafe, type SafePaperEntryPayload } from "../tradeLifecycle";
import type { SafeV44SignalResult } from "../signal/safeV44SignalEngine";
import type { RiskEngineResult } from "../risk/safeV44RiskEngine";
import type { EngineResult } from "../types";

export async function executePaperEntryFromSignal(input: {
  signal: SafeV44SignalResult;
  risk: RiskEngineResult;
  strategyName: string;
  paramsHash: string;
}): Promise<EngineResult> {
  if (!input.signal.passed || input.signal.side === "NONE") {
    return { ok: false, mode: "PAPER", serviceState: "paper", message: "유효한 SAFE 신호가 없습니다." };
  }

  const payload: SafePaperEntryPayload = {
    symbol: input.signal.symbol,
    side: input.signal.side,
    signalType: input.signal.signalType,
    entryReason: input.signal.entryReason,
    score: input.signal.score,
    entryPrice: input.risk.entryPrice,
    stopLoss: input.risk.stopLossPrice,
    takeProfit: input.risk.takeProfitPrice,
    leverage: input.risk.leverage,
    quantity: Math.max(input.risk.quantity, 0.001),
    margin: input.risk.marginAmount,
    strategyName: input.strategyName,
    paramsHash: input.paramsHash,
    trailingDistance: input.risk.trailingStopDistance,
    maxHoldBars: input.risk.maxHoldBars
  };

  recordPaperEntryFromSafe(payload);
  return {
    ok: true,
    mode: "PAPER",
    serviceState: "paper",
    message: `SAFE PAPER 진입: ${payload.symbol} ${payload.side} (실제 주문 없음)`
  };
}
