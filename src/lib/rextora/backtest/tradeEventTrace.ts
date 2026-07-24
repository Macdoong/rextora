/**
 * Trade event trace for chart explanation — derived from verified backtest fields.
 * Does not invent intrabar events beyond what the engine stored.
 */

import type { BacktestTrade } from "../backtest/backtestEngine";

export const TRADE_EVENT_TRACE_VERSION = 1 as const;

export type TradeEventKind =
  | "entry"
  | "exit"
  | "stop"
  | "target"
  | "max_hold"
  | "signal"
  | "rejected";

export interface TradeEventTraceItem {
  kind: TradeEventKind;
  at: string | null;
  price: number | null;
  labelKo: string;
  detailKo: string | null;
}

export interface TradeEventTrace {
  version: typeof TRADE_EVENT_TRACE_VERSION;
  tradeId: string;
  symbol: string;
  timeframe: string | null;
  direction: "LONG" | "SHORT" | string;
  entry: TradeEventTraceItem;
  exit: TradeEventTraceItem;
  stopPrice: number | null;
  targetPrice: number | null;
  exitReason: string | null;
  grossPnl: number | null;
  fee: number | null;
  slippage: number | null;
  netPnl: number | null;
  holdingDurationMs: number | null;
  assumptionsKo: string[];
  events: TradeEventTraceItem[];
  whyEnteredKo: string;
  whyExitedKo: string;
  feeSlippageImpactKo: string;
  /** Optional pattern geometry — only when present on the trade record. */
  patternType?: string | null;
  zoneHigh?: number | null;
  zoneLow?: number | null;
  lineAnchors?: Array<{ bar: number; price: number }> | null;
  creationCandleTime?: string | null;
  revisitCandleTime?: string | null;
  confirmationCandleTime?: string | null;
  penetrationPct?: number | null;
  rejectedReasonCode?: string | null;
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function asLineAnchors(
  v: unknown,
): Array<{ bar: number; price: number }> | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: Array<{ bar: number; price: number }> = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const bar = asNum((item as { bar?: unknown }).bar);
    const price = asNum((item as { price?: unknown }).price);
    if (bar != null && price != null) out.push({ bar, price });
  }
  return out.length ? out : null;
}

/** Build an auditable event trace from a BacktestTrade (no fabricated fields). */
export function buildTradeEventTrace(
  trade: BacktestTrade & Record<string, unknown>,
  opts?: { symbol?: string; timeframe?: string | null },
): TradeEventTrace {
  const entryTime = asStr(trade.entryTime) ?? asStr(trade.openedAt);
  const exitTime = asStr(trade.exitTime) ?? asStr(trade.closedAt);
  const entryPrice = asNum(trade.entryPrice);
  const exitPrice = asNum(trade.exitPrice);
  const fee = asNum(trade.feeUsdt) ?? asNum(trade.fee);
  const slippage = asNum(trade.slippageUsdt) ?? asNum(trade.slippage);
  const net = asNum(trade.netPnlUsdt) ?? asNum(trade.pnl);
  const gross =
    net != null && fee != null && slippage != null
      ? net + fee + slippage
      : asNum(trade.grossPnlUsdt);
  const exitReason = asStr(trade.exitReason);
  const side = String(trade.side ?? trade.direction ?? "LONG");
  const stopPrice =
    asNum(trade.stopPrice) ?? asNum(trade.slPrice) ?? asNum(trade.stopLoss);
  const targetPrice =
    asNum(trade.takeProfitPrice) ??
    asNum(trade.tpPrice) ??
    asNum(trade.takeProfit);

  let holdMs: number | null = null;
  if (entryTime && exitTime) {
    const a = Date.parse(entryTime);
    const b = Date.parse(exitTime);
    if (Number.isFinite(a) && Number.isFinite(b)) holdMs = Math.max(0, b - a);
  }

  const entry: TradeEventTraceItem = {
    kind: "entry",
    at: entryTime,
    price: entryPrice,
    labelKo: "진입",
    detailKo: side === "SHORT" || side === "short" ? "숏 진입" : "롱 진입",
  };

  const exitKind: TradeEventKind =
    exitReason?.includes("stop") || exitReason?.includes("SL")
      ? "stop"
      : exitReason?.includes("tp") ||
          exitReason?.includes("target") ||
          exitReason?.includes("TP") ||
          exitReason?.includes("take_profit")
        ? "target"
        : exitReason?.includes("hold") || exitReason?.includes("max")
          ? "max_hold"
          : "exit";

  const exit: TradeEventTraceItem = {
    kind: exitKind,
    at: exitTime,
    price: exitPrice,
    labelKo:
      exitKind === "stop"
        ? "손절"
        : exitKind === "target"
          ? "익절"
          : exitKind === "max_hold"
            ? "최대 보유 청산"
            : "청산",
    detailKo: exitReason,
  };

  const events: TradeEventTraceItem[] = [entry];
  if (stopPrice != null) {
    events.push({
      kind: "stop",
      at: null,
      price: stopPrice,
      labelKo: "손절 예정가",
      detailKo: null,
    });
  }
  if (targetPrice != null) {
    events.push({
      kind: "target",
      at: null,
      price: targetPrice,
      labelKo: "익절 예정가",
      detailKo: null,
    });
  }
  events.push(exit);

  const feeSlip =
    fee != null || slippage != null
      ? `수수료 ${fee ?? "불가"} · 슬리피지 ${slippage ?? "불가"} (가용 값만 표시)`
      : "수수료·슬리피지 세부 값이 거래 기록에 없습니다.";

  const patternType = asStr(trade.patternType);
  const zoneHigh = asNum(trade.zoneHigh);
  const zoneLow = asNum(trade.zoneLow);
  const lineAnchors = asLineAnchors(trade.lineAnchors);
  const creationCandleTime = asStr(trade.creationCandleTime);
  const revisitCandleTime = asStr(trade.revisitCandleTime);
  const confirmationCandleTime = asStr(trade.confirmationCandleTime);
  const penetrationPct = asNum(trade.penetrationPct);
  const rejectedReasonCode = asStr(trade.rejectedReasonCode);

  return {
    version: TRADE_EVENT_TRACE_VERSION,
    tradeId: String(trade.id ?? `${entryTime ?? "t"}-${side}`),
    symbol: opts?.symbol ?? String(trade.symbol ?? "UNKNOWN"),
    timeframe: opts?.timeframe ?? null,
    direction: side,
    entry,
    exit,
    stopPrice,
    targetPrice,
    exitReason,
    grossPnl: gross,
    fee,
    slippage,
    netPnl: net,
    holdingDurationMs: holdMs,
    assumptionsKo: [
      "완료 봉(OHLC) 기준으로 체결된 백테스트 가정입니다.",
      "봉 내부 순서가 기록되지 않은 경우 추정하지 않습니다.",
    ],
    events,
    whyEnteredKo: `${entry.detailKo ?? "진입"} @ ${entryPrice ?? "가격 미기록"}`,
    whyExitedKo: exit.detailKo
      ? `${exit.labelKo} (${exit.detailKo})`
      : exit.labelKo,
    feeSlippageImpactKo: feeSlip,
    patternType,
    zoneHigh,
    zoneLow,
    lineAnchors,
    creationCandleTime,
    revisitCandleTime,
    confirmationCandleTime,
    penetrationPct,
    rejectedReasonCode,
  };
}

export function buildTradeEventTraces(
  trades: Array<BacktestTrade & Record<string, unknown>>,
  opts?: { symbol?: string; timeframe?: string | null },
): TradeEventTrace[] {
  return trades.map((t, index) => {
    const withId =
      t.id != null && String(t.id).trim()
        ? t
        : {
            ...t,
            id: `T${String(index + 1).padStart(4, "0")}`,
          };
    return buildTradeEventTrace(withId, opts);
  });
}
