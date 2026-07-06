import { getConfig } from "../config";
import { getEnv } from "../env";
import { buildQueryString, buildSignedQuery } from "./binanceSigner";

export class BinanceHttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: number
  ) {
    super(message);
    this.name = "BinanceHttpError";
  }
}

function requireCredentials(): { apiKey: string; apiSecret: string } {
  const env = getEnv();
  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    throw new BinanceHttpError("Binance API credentials are not configured");
  }
  return { apiKey: env.BINANCE_API_KEY, apiSecret: env.BINANCE_API_SECRET };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof (payload as { msg?: string })?.msg === "string" ? (payload as { msg: string }).msg : `HTTP ${response.status}`;
    const code = typeof (payload as { code?: number })?.code === "number" ? (payload as { code: number }).code : undefined;
    throw new BinanceHttpError(message, response.status, code);
  }
  return payload as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET a public (unauthenticated) market-data endpoint. Retries on transient failures.
 * Never used for account or order data.
 */
export async function publicGet<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const config = getConfig();
  const query = buildQueryString(params);
  const url = `${config.binance.futuresBaseUrl}${path}${query ? `?${query}` : ""}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= config.binance.maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, { method: "GET" }, config.binance.timeoutMs);
      return await parseJson<T>(response);
    } catch (error) {
      lastError = error;
      if (attempt < config.binance.maxRetries) await sleep(250 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new BinanceHttpError("Binance public request failed");
}

/**
 * GET a signed, API-key-authenticated read-only endpoint (account/balance/position info).
 * Retries on transient failures — safe because reads have no side effects.
 */
export async function signedGet<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const { apiKey, apiSecret } = requireCredentials();
  const config = getConfig();
  const query = buildSignedQuery(params, apiSecret, config.binance.recvWindowMs);
  const url = `${config.binance.futuresBaseUrl}${path}?${query}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= config.binance.maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, { method: "GET", headers: { "X-MBX-APIKEY": apiKey } }, config.binance.timeoutMs);
      return await parseJson<T>(response);
    } catch (error) {
      lastError = error;
      if (attempt < config.binance.maxRetries) await sleep(250 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new BinanceHttpError("Binance signed read request failed");
}

/**
 * Signed, state-changing request (order placement/cancellation, leverage, margin type).
 * INTENTIONALLY has NO retry logic — a retried order/cancel request could duplicate or
 * race a real trade action. Callers (binanceTradeService.ts) are additionally required to
 * hold a verified LiveExecutionContext before this function is ever reached.
 */
export async function signedRequest<T>(
  method: "POST" | "DELETE" | "PUT",
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const { apiKey, apiSecret } = requireCredentials();
  const config = getConfig();
  const query = buildSignedQuery(params, apiSecret, config.binance.recvWindowMs);
  const url = `${config.binance.futuresBaseUrl}${path}?${query}`;

  const response = await fetchWithTimeout(url, { method, headers: { "X-MBX-APIKEY": apiKey } }, config.binance.timeoutMs);
  return parseJson<T>(response);
}

/** API-key-only request (no signature) used for user data stream listen keys. */
export async function keyOnlyRequest<T>(method: "POST" | "PUT" | "DELETE", path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const { apiKey } = requireCredentials();
  const config = getConfig();
  const query = buildQueryString(params);
  const url = `${config.binance.futuresBaseUrl}${path}${query ? `?${query}` : ""}`;

  const response = await fetchWithTimeout(url, { method, headers: { "X-MBX-APIKEY": apiKey } }, config.binance.timeoutMs);
  return parseJson<T>(response);
}
