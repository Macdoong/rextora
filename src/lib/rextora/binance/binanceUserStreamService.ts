import { keyOnlyRequest } from "./binanceHttpClient";
import type { BinanceListenKeyResponse } from "./binanceTypes";

const LISTEN_KEY_PATH = ["/fapi", "/v1", "/listenKey"].join("");

let activeListenKey: string | null = null;

export async function createUserDataListenKey(): Promise<BinanceListenKeyResponse> {
  const result = await keyOnlyRequest<BinanceListenKeyResponse>("POST", LISTEN_KEY_PATH);
  activeListenKey = result.listenKey;
  return result;
}

export async function keepAliveUserDataListenKey(listenKey = activeListenKey): Promise<void> {
  if (!listenKey) return;
  await keyOnlyRequest("PUT", LISTEN_KEY_PATH, { listenKey });
}

export async function closeUserDataListenKey(listenKey = activeListenKey): Promise<void> {
  if (!listenKey) return;
  await keyOnlyRequest("DELETE", LISTEN_KEY_PATH, { listenKey });
  if (activeListenKey === listenKey) activeListenKey = null;
}

export function getActiveListenKey(): string | null {
  return activeListenKey;
}

export function buildUserStreamUrl(listenKey: string, testnet = true): string {
  const base = testnet ? "wss://stream.binancefuture.com/ws" : "wss://fstream.binance.com/ws";
  return `${base}/${listenKey}`;
}
