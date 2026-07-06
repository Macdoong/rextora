import {
  getFuturesAccountBalanceReadOnly,
  getFuturesAccountInfoReadOnly,
  getExchangeInfo,
  getServerTime
} from "./binance/binanceReadOnlyService";
import { signedGet } from "./binance/binanceHttpClient";
import type { BinanceOrderResponse, BinancePositionRisk } from "./binance/binanceTypes";
import { hasBinanceCredentials } from "./env";
import { updateAccountFromBinance } from "./accountStateStore";
import { appendAuditLog } from "./storage/auditStore";

let lastSyncAt: string | null = null;
let lastError: string | null = null;

export async function syncPositionsFromBinance(): Promise<{ ok: boolean; message: string; count: number }> {
  if (!hasBinanceCredentials()) {
    return { ok: true, message: "mock position sync", count: 0 };
  }

  try {
    const [balance, positions] = await Promise.all([
      getFuturesAccountBalanceReadOnly(),
      signedGet<BinancePositionRisk[]>("/fapi/v2/positionRisk")
    ]);

    const usdt = balance.data?.find((b) => b.asset === "USDT");
    updateAccountFromBinance({
      balanceUsdt: Number(usdt?.balance ?? 0),
      availableBalanceUsdt: Number(usdt?.availableBalance ?? 0),
      positions,
      source: "polling"
    });
    lastSyncAt = new Date().toISOString();
    lastError = null;
    const active = positions.filter((p) => Math.abs(Number(p.positionAmt)) > 0).length;
    return { ok: true, message: "position sync ok", count: active };
  } catch (error) {
    lastError = error instanceof Error ? error.message : "position sync failed";
    appendAuditLog({
      type: "binance_error",
      actor: "positionSyncService",
      message: lastError,
      mode: "LIVE",
      correlationId: `pos-sync-${Date.now()}`
    });
    return { ok: false, message: lastError, count: 0 };
  }
}

export function getPositionSyncStatus() {
  return { lastSyncAt, lastError };
}

export async function verifyBinanceReadiness(): Promise<{
  serverTimeOk: boolean;
  exchangeInfoOk: boolean;
  balanceOk: boolean;
  accountOk: boolean;
  message: string;
}> {
  const [serverTime, exchangeInfo, balance, account] = await Promise.all([
    getServerTime(),
    getExchangeInfo(),
    getFuturesAccountBalanceReadOnly(),
    getFuturesAccountInfoReadOnly()
  ]);

  const serverTimeOk = serverTime.ok;
  const exchangeInfoOk = exchangeInfo.ok;
  const balanceOk = !hasBinanceCredentials() || balance.ok;
  const accountOk = !hasBinanceCredentials() || account.ok;

  return {
    serverTimeOk,
    exchangeInfoOk,
    balanceOk,
    accountOk,
    message: serverTimeOk && exchangeInfoOk && balanceOk && accountOk ? "Binance read readiness OK" : "Binance readiness incomplete"
  };
}

export async function getOpenOrdersFromBinance(symbol?: string): Promise<BinanceOrderResponse[]> {
  if (!hasBinanceCredentials()) return [];
  const params = symbol ? { symbol } : {};
  return signedGet<BinanceOrderResponse[]>("/fapi/v1/openOrders", params);
}
