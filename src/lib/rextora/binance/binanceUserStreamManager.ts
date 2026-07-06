import { getConfig } from "../config";
import { hasBinanceCredentials } from "../env";
import { setUserStreamStatus, touchUserStreamEvent, updateAccountFromBinance } from "../accountStateStore";
import { appendAuditLog } from "../storage/auditStore";
import { syncOpenOrders } from "../orderSyncService";
import {
  buildUserStreamUrl,
  closeUserDataListenKey,
  createUserDataListenKey,
  getActiveListenKey,
  keepAliveUserDataListenKey
} from "./binanceUserStreamService";
import type { BinancePositionRisk } from "./binanceTypes";

export type UserStreamStatus = {
  connected: boolean;
  listenKey: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  reconnectCount: number;
  fallbackPolling: boolean;
};

let status: UserStreamStatus = {
  connected: false,
  listenKey: null,
  lastEventAt: null,
  lastError: null,
  reconnectCount: 0,
  fallbackPolling: false
};

let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let ws: WebSocket | null = null;

function clearTimers(): void {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  if (pollingTimer) clearInterval(pollingTimer);
  keepAliveTimer = null;
  pollingTimer = null;
}

function handleAccountUpdate(payload: Record<string, unknown>): void {
  touchUserStreamEvent();
  const balances = (payload.B as Array<{ a: string; wb: string; cw: string }>) ?? [];
  const positions = (payload.P as Array<{ s: string; pa: string; ep: string; up: string; ps: string }>) ?? [];
  const usdt = balances.find((b) => b.a === "USDT");
  const mapped: BinancePositionRisk[] = positions.map((p) => ({
    symbol: p.s,
    positionAmt: p.pa,
    entryPrice: p.ep,
    markPrice: "0",
    unRealizedProfit: p.up,
    leverage: "1",
    positionSide: p.ps
  }));
  updateAccountFromBinance({
    balanceUsdt: Number(usdt?.wb ?? 0),
    availableBalanceUsdt: Number(usdt?.cw ?? 0),
    positions: mapped,
    source: "user_stream"
  });
}

function handleOrderUpdate(event: Record<string, unknown>): void {
  touchUserStreamEvent();
  void syncOpenOrders(String(event.s ?? ""));
}

function startKeepAlive(): void {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = setInterval(() => {
    void keepAliveUserDataListenKey().catch((error) => {
      status.lastError = error instanceof Error ? error.message : "keepalive failed";
    });
  }, 30 * 60 * 1000);
}

function startPollingFallback(): void {
  status.fallbackPolling = true;
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(() => {
    void syncOpenOrders();
  }, 15_000);
}

export function getUserStreamStatus(): UserStreamStatus {
  return { ...status, listenKey: getActiveListenKey() };
}

export async function startUserDataStream(): Promise<UserStreamStatus> {
  if (!hasBinanceCredentials()) {
    status = { ...status, connected: false, lastError: "credentials missing" };
    return getUserStreamStatus();
  }

  try {
    const { listenKey } = await createUserDataListenKey();
    status.listenKey = listenKey;
    const config = getConfig();
    const url = buildUserStreamUrl(listenKey, config.binance.testnet);

    if (typeof WebSocket !== "undefined") {
      ws?.close();
      ws = new WebSocket(url);
      ws.onopen = () => {
        status.connected = true;
        status.lastError = null;
        setUserStreamStatus(true);
        startKeepAlive();
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as { e?: string; a?: Record<string, unknown>; o?: Record<string, unknown> };
          if (data.e === "ACCOUNT_UPDATE" && data.a) handleAccountUpdate(data.a as Record<string, unknown>);
          if (data.e === "ORDER_TRADE_UPDATE" && data.o) handleOrderUpdate(data.o as Record<string, unknown>);
        } catch {
          status.lastError = "invalid user stream payload";
        }
      };
      ws.onerror = () => {
        status.connected = false;
        status.lastError = "websocket error";
        setUserStreamStatus(false);
        startPollingFallback();
      };
      ws.onclose = () => {
        status.connected = false;
        setUserStreamStatus(false);
        status.reconnectCount += 1;
        startPollingFallback();
      };
    } else {
      startPollingFallback();
    }

    return getUserStreamStatus();
  } catch (error) {
    status.lastError = error instanceof Error ? error.message : "user stream start failed";
    appendAuditLog({
      type: "binance_error",
      actor: "userStream",
      message: status.lastError,
      mode: "LIVE",
      correlationId: `uds-${Date.now()}`
    });
    startPollingFallback();
    return getUserStreamStatus();
  }
}

export async function stopUserDataStream(): Promise<void> {
  clearTimers();
  ws?.close();
  ws = null;
  await closeUserDataListenKey().catch(() => undefined);
  status.connected = false;
  status.fallbackPolling = false;
  setUserStreamStatus(false);
}
