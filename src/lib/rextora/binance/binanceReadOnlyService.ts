import { getConfig } from "../config";
import { getEnv, hasBinanceCredentials } from "../env";
import { publicGet, signedGet } from "./binanceHttpClient";
import type {
  BinanceBookTicker,
  BinanceExchangeInfo,
  BinanceFuturesAccountInfo,
  BinanceFuturesBalance,
  BinanceKline,
  BinanceOrderResponse,
  BinancePositionRisk,
  BinancePremiumIndex,
  BinanceTicker24hr
} from "./binanceTypes";

export type BinanceStatus = {
  configured: boolean;
  testnet: boolean;
  baseUrl: string;
  readPermission: "정상" | "오류" | "미확인";
  futuresAccountRead: "정상" | "오류" | "미확인";
  orderPermissionBlocked: true;
  realOrderEngineConnected: false;
  serviceState: "mock" | "read-only";
  message: string;
};

export type ReadOnlyResult<T> = {
  ok: boolean;
  configured: boolean;
  serviceState: "mock" | "read-only";
  data?: T;
  source: "mock" | "Binance read-only" | "Binance public market data";
  message: string;
};

function sanitizeSymbol(symbol = "BTCUSDT"): string {
  const cleaned = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || "BTCUSDT";
}

function sanitizeInterval(interval = "1h"): string {
  return /^[0-9]+[mhdwM]$/.test(interval) ? interval : "1h";
}

function sanitizeLimit(limit = 100): number {
  return Math.max(1, Math.min(500, Number.isFinite(limit) ? Math.floor(limit) : 100));
}

export function getBinanceConfigStatus(): BinanceStatus {
  const config = getConfig();
  const env = getEnv();
  const configured = hasBinanceCredentials();

  return {
    configured,
    testnet: env.BINANCE_TESTNET,
    baseUrl: config.binance.futuresBaseUrl,
    readPermission: configured ? "미확인" : "미확인",
    futuresAccountRead: configured ? "미확인" : "미확인",
    orderPermissionBlocked: true,
    realOrderEngineConnected: false,
    serviceState: configured ? "read-only" : "mock",
    message: configured ? "Binance API 키가 설정되어 읽기 전용 확인 준비됨" : "Binance API 키가 없어 mock/read-only 상태입니다."
  };
}

export async function getFuturesAccountBalanceReadOnly(): Promise<ReadOnlyResult<BinanceFuturesBalance[]>> {
  if (!hasBinanceCredentials()) {
    return {
      ok: true,
      configured: false,
      serviceState: "mock",
      source: "mock",
      message: "mock 잔고",
      data: [{ accountAlias: "mock", asset: "USDT", balance: "10254.32", availableBalance: "10012.10", crossWalletBalance: "10254.32" }]
    };
  }

  try {
    const data = await signedGet<BinanceFuturesBalance[]>("/fapi/v2/balance");
    return { ok: true, configured: true, serviceState: "read-only", source: "Binance read-only", message: "읽기 전용 실제 잔고", data };
  } catch {
    return { ok: false, configured: true, serviceState: "read-only", source: "mock", message: "Binance 잔고 조회 실패, mock 잔고 사용" };
  }
}

export async function getFuturesAccountInfoReadOnly(): Promise<ReadOnlyResult<BinanceFuturesAccountInfo>> {
  if (!hasBinanceCredentials()) {
    return { ok: true, configured: false, serviceState: "mock", source: "mock", message: "Binance account mock status" };
  }

  try {
    const data = await signedGet<BinanceFuturesAccountInfo>("/fapi/v2/account");
    return { ok: true, configured: true, serviceState: "read-only", source: "Binance read-only", message: "Futures 계정 읽기 성공", data };
  } catch {
    return { ok: false, configured: true, serviceState: "read-only", source: "mock", message: "Futures 계정 읽기 실패" };
  }
}

export async function getServerTime(): Promise<ReadOnlyResult<{ serverTime: number }>> {
  try {
    const data = await publicGet<{ serverTime: number }>("/fapi/v1/time");
    return { ok: true, configured: hasBinanceCredentials(), serviceState: "read-only", source: "Binance public market data", message: "Binance 서버 시간 조회 성공", data };
  } catch {
    return { ok: false, configured: hasBinanceCredentials(), serviceState: hasBinanceCredentials() ? "read-only" : "mock", source: "mock", message: "Binance 서버 시간 조회 실패" };
  }
}

export async function getMarketTicker(symbol = "BTCUSDT"): Promise<ReadOnlyResult<BinanceTicker24hr>> {
  try {
    const data = await publicGet<BinanceTicker24hr>("/fapi/v1/ticker/24hr", { symbol: sanitizeSymbol(symbol) });
    return { ok: true, configured: hasBinanceCredentials(), serviceState: "read-only", source: "Binance public market data", message: "Binance public market data", data };
  } catch {
    return { ok: false, configured: hasBinanceCredentials(), serviceState: hasBinanceCredentials() ? "read-only" : "mock", source: "mock", message: "mock market data" };
  }
}

export async function getAllMarketTickers(): Promise<ReadOnlyResult<BinanceTicker24hr[]>> {
  try {
    const data = await publicGet<BinanceTicker24hr[]>("/fapi/v1/ticker/24hr");
    return { ok: true, configured: hasBinanceCredentials(), serviceState: "read-only", source: "Binance public market data", message: "Binance public market data", data };
  } catch {
    return { ok: false, configured: hasBinanceCredentials(), serviceState: hasBinanceCredentials() ? "read-only" : "mock", source: "mock", message: "mock market data" };
  }
}

export async function getKlines(symbol = "BTCUSDT", interval = "1h", limit = 100): Promise<ReadOnlyResult<BinanceKline[]>> {
  try {
    const data = await publicGet<BinanceKline[]>("/fapi/v1/klines", {
      symbol: sanitizeSymbol(symbol),
      interval: sanitizeInterval(interval),
      limit: sanitizeLimit(limit)
    });
    return { ok: true, configured: hasBinanceCredentials(), serviceState: "read-only", source: "Binance public market data", message: "Binance public market data", data };
  } catch {
    return { ok: false, configured: hasBinanceCredentials(), serviceState: hasBinanceCredentials() ? "read-only" : "mock", source: "mock", message: "mock market data" };
  }
}

export async function getBookTicker(symbol: string): Promise<ReadOnlyResult<BinanceBookTicker>> {
  try {
    const data = await publicGet<BinanceBookTicker>("/fapi/v1/ticker/bookTicker", { symbol: sanitizeSymbol(symbol) });
    return { ok: true, configured: hasBinanceCredentials(), serviceState: "read-only", source: "Binance public market data", message: "book ticker", data };
  } catch {
    return { ok: false, configured: hasBinanceCredentials(), serviceState: "mock", source: "mock", message: "book ticker failed" };
  }
}

export async function getPremiumIndex(symbol: string): Promise<ReadOnlyResult<BinancePremiumIndex>> {
  try {
    const data = await publicGet<BinancePremiumIndex>("/fapi/v1/premiumIndex", { symbol: sanitizeSymbol(symbol) });
    return { ok: true, configured: hasBinanceCredentials(), serviceState: "read-only", source: "Binance public market data", message: "funding index", data };
  } catch {
    return { ok: false, configured: hasBinanceCredentials(), serviceState: "mock", source: "mock", message: "funding index failed" };
  }
}

/** Batch premium index for all symbols — avoids per-symbol funding calls during market refresh. */
export async function getAllPremiumIndexes(): Promise<ReadOnlyResult<BinancePremiumIndex[]>> {
  try {
    const data = await publicGet<BinancePremiumIndex[]>("/fapi/v1/premiumIndex");
    return {
      ok: true,
      configured: hasBinanceCredentials(),
      serviceState: "read-only",
      source: "Binance public market data",
      message: "all premium indexes",
      data
    };
  } catch {
    return {
      ok: false,
      configured: hasBinanceCredentials(),
      serviceState: hasBinanceCredentials() ? "read-only" : "mock",
      source: "mock",
      message: "all premium indexes failed"
    };
  }
}

export async function getExchangeInfo(): Promise<ReadOnlyResult<BinanceExchangeInfo>> {
  try {
    const data = await publicGet<BinanceExchangeInfo>("/fapi/v1/exchangeInfo");
    return { ok: true, configured: hasBinanceCredentials(), serviceState: "read-only", source: "Binance public market data", message: "exchange info", data };
  } catch {
    return { ok: false, configured: hasBinanceCredentials(), serviceState: "mock", source: "mock", message: "exchange info failed" };
  }
}

export async function getPositionRisk(symbol?: string): Promise<ReadOnlyResult<BinancePositionRisk[]>> {
  if (!hasBinanceCredentials()) {
    return { ok: true, configured: false, serviceState: "mock", source: "mock", message: "mock positions", data: [] };
  }
  try {
    const params = symbol ? { symbol: sanitizeSymbol(symbol) } : {};
    const data = await signedGet<BinancePositionRisk[]>("/fapi/v2/positionRisk", params);
    return { ok: true, configured: true, serviceState: "read-only", source: "Binance read-only", message: "position risk", data };
  } catch {
    return { ok: false, configured: true, serviceState: "read-only", source: "mock", message: "position risk failed" };
  }
}

export async function getOpenOrders(symbol?: string): Promise<ReadOnlyResult<BinanceOrderResponse[]>> {
  if (!hasBinanceCredentials()) {
    return { ok: true, configured: false, serviceState: "mock", source: "mock", message: "mock open orders", data: [] };
  }
  try {
    const params = symbol ? { symbol: sanitizeSymbol(symbol) } : {};
    const data = await signedGet<BinanceOrderResponse[]>("/fapi/v1/openOrders", params);
    return { ok: true, configured: true, serviceState: "read-only", source: "Binance read-only", message: "open orders", data };
  } catch {
    return { ok: false, configured: true, serviceState: "read-only", source: "mock", message: "open orders failed" };
  }
}

export async function getReadOnlyHealth() {
  const [serverTime, balance, account, market] = await Promise.all([
    getServerTime(),
    getFuturesAccountBalanceReadOnly(),
    getFuturesAccountInfoReadOnly(),
    getMarketTicker("BTCUSDT")
  ]);
  const configured = hasBinanceCredentials();

  return {
    ...getBinanceConfigStatus(),
    readPermission: configured && balance.ok ? "정상" : configured ? "오류" : "미확인",
    futuresAccountRead: configured && account.ok ? "정상" : configured ? "오류" : "미확인",
    balance,
    account,
    serverTime,
    market,
    orderPermissionBlocked: true,
    realOrderEngineConnected: false,
    liveExecutionBlocked: true
  };
}
