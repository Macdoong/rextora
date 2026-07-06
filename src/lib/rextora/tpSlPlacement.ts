import { getExchangeInfo } from "./binance/binanceReadOnlyService";
import { extractSymbolFilters, getSymbolInfo, normalizePrice, normalizeQuantity } from "./binance/binanceExchangeFilters";
import { placeStopLossOrder, placeTakeProfitOrder } from "./binance/binanceTradeService";
import { getRextoraSettings } from "./settings/settingsService";
import { appendAuditLog } from "./storage/auditStore";
import type { LiveExecutionContext } from "./serverTpSlManager";
import { registerServerTpSl, clearServerTpSl } from "./serverTpSlManager";
import type { TpSlPlacementResult, TpSlPrices } from "./tpSlTypes";

export function calculateTpSlPrices(entryPrice: number, side: "LONG" | "SHORT", atr?: number): TpSlPrices {
  const settings = getRextoraSettings();
  if (settings.tpSl.useAtrBasedTpSl && atr && atr > 0) {
    const tpDistance = atr * settings.tpSl.atrTpMultiplier;
    const slDistance = atr * settings.tpSl.atrSlMultiplier;
    if (side === "LONG") {
      return {
        takeProfitPrice: entryPrice + tpDistance,
        stopLossPrice: entryPrice - slDistance,
        source: "atr"
      };
    }
    return {
      takeProfitPrice: entryPrice - tpDistance,
      stopLossPrice: entryPrice + slDistance,
      source: "atr"
    };
  }

  const tpPct = settings.tpSl.takeProfitPct / 100;
  const slPct = settings.tpSl.stopLossPct / 100;
  if (side === "LONG") {
    return {
      takeProfitPrice: entryPrice * (1 + tpPct),
      stopLossPrice: entryPrice * (1 - slPct),
      source: "percentage"
    };
  }
  return {
    takeProfitPrice: entryPrice * (1 - tpPct),
    stopLossPrice: entryPrice * (1 + slPct),
    source: "percentage"
  };
}

export async function placeServerTpSlAfterEntry(input: {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  atr?: number;
  context: LiveExecutionContext;
}): Promise<TpSlPlacementResult> {
  const settings = getRextoraSettings();
  const exchange = await getExchangeInfo();
  const symbolInfo = exchange.data ? getSymbolInfo(input.symbol, exchange.data) : undefined;
  const filters = symbolInfo ? extractSymbolFilters(symbolInfo) : {
    quantityPrecision: 3,
    pricePrecision: 2,
    stepSize: 0.001,
    tickSize: 0.01,
    minQty: 0.001,
    minNotional: 5
  };

  const prices = calculateTpSlPrices(input.entryPrice, input.side, input.atr);
  const exitSide = input.side === "LONG" ? "SELL" : "BUY";
  const tpPrice = normalizePrice(prices.takeProfitPrice, filters);
  const slPrice = normalizePrice(prices.stopLossPrice, filters);

  try {
    const [sl, tp] = await Promise.all([
      placeStopLossOrder({ symbol: input.symbol, side: exitSide, stopPrice: slPrice, pricePrecision: filters.pricePrecision }, input.context),
      placeTakeProfitOrder({ symbol: input.symbol, side: exitSide, stopPrice: tpPrice, pricePrecision: filters.pricePrecision }, input.context)
    ]);

    const verified = Boolean(sl.orderId && tp.orderId);
    registerServerTpSl({
      symbol: input.symbol,
      slOrderId: sl.orderId,
      tpOrderId: tp.orderId,
      verified,
      message: verified ? "서버 TP/SL 배치 완료" : "서버 TP/SL 검증 실패"
    });

    appendAuditLog({
      type: "tpsl_placement",
      actor: "serverTpSlManager",
      message: verified ? "TP/SL placed" : "TP/SL placement incomplete",
      mode: "LIVE",
      correlationId: input.context.requestId,
      symbol: input.symbol,
      details: { slOrderId: sl.orderId, tpOrderId: tp.orderId, verified }
    });

    return {
      ok: verified,
      symbol: input.symbol,
      slOrderId: sl.orderId,
      tpOrderId: tp.orderId,
      verified,
      message: verified ? "서버 TP/SL 배치 완료" : "서버 TP/SL 검증 실패",
      failedCount: verified ? 0 : 1
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "TP/SL placement failed";
    registerServerTpSl({ symbol: input.symbol, verified: false, message });
    appendAuditLog({
      type: "tpsl_failure",
      actor: "serverTpSlManager",
      message,
      mode: "LIVE",
      correlationId: input.context.requestId,
      symbol: input.symbol
    });

    if (settings.tpSl.fallbackCloseIfTpSlFails) {
      appendAuditLog({
        type: "tpsl_failure",
        actor: "serverTpSlManager",
        message: "fallback close triggered",
        mode: "LIVE",
        correlationId: input.context.requestId,
        symbol: input.symbol
      });
    }

    return {
      ok: false,
      symbol: input.symbol,
      verified: false,
      message,
      failedCount: 1
    };
  }
}

export function simulatePaperTpSl(symbol: string): void {
  registerServerTpSl({
    symbol,
    tpOrderId: Date.now(),
    slOrderId: Date.now() + 1,
    verified: true,
    message: "PAPER TP/SL simulated"
  });
}

export function clearServerTpSlOrders(): void {
  clearServerTpSl();
}

export function normalizeLiveQuantity(symbol: string, quantity: number, exchangeInfo?: Awaited<ReturnType<typeof getExchangeInfo>>["data"]): number {
  if (!exchangeInfo) return quantity;
  const symbolInfo = getSymbolInfo(symbol, exchangeInfo);
  if (!symbolInfo) return quantity;
  return normalizeQuantity(quantity, extractSymbolFilters(symbolInfo));
}
