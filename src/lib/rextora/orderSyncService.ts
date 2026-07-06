import { getOpenOrdersFromBinance } from "./positionSyncService";
import { updateOpenOrders, type AccountOrder } from "./accountStateStore";
import { hasBinanceCredentials } from "./env";
import { appendAuditLog } from "./storage/auditStore";
import type { BinanceOrderResponse } from "./binance/binanceTypes";

let lastSyncAt: string | null = null;
let lastError: string | null = null;

function mapOrder(order: BinanceOrderResponse): AccountOrder {
  return {
    orderId: order.orderId,
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    status: order.status,
    quantity: Number(order.origQty),
    price: Number(order.price),
    stopPrice: order.stopPrice ? Number(order.stopPrice) : undefined,
    reduceOnly: Boolean(order.reduceOnly),
    updatedAt: new Date().toISOString()
  };
}

export async function syncOpenOrders(symbol?: string): Promise<{ ok: boolean; message: string; count: number }> {
  if (!hasBinanceCredentials()) {
    updateOpenOrders([]);
    return { ok: true, message: "mock order sync", count: 0 };
  }

  try {
    const orders = await getOpenOrdersFromBinance(symbol);
    updateOpenOrders(orders.map(mapOrder));
    lastSyncAt = new Date().toISOString();
    lastError = null;
    return { ok: true, message: "order sync ok", count: orders.length };
  } catch (error) {
    lastError = error instanceof Error ? error.message : "order sync failed";
    appendAuditLog({
      type: "binance_error",
      actor: "orderSyncService",
      message: lastError,
      mode: "LIVE",
      correlationId: `order-sync-${Date.now()}`
    });
    return { ok: false, message: lastError, count: 0 };
  }
}

export function getOrderSyncStatus() {
  return { lastSyncAt, lastError };
}
