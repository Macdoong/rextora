import crypto from "node:crypto";

/**
 * Formats a number as a fixed-precision decimal string, as required by Binance
 * quantity/price fields. Avoids floating point artifacts like "1.2300000000001".
 */
export function toDecimalString(value: number, precision: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(Math.max(0, precision));
}

/** Builds a Binance-style query string (insertion order preserved, matches signature input). */
export function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  return search.toString();
}

/** HMAC-SHA256 signs a query string using the Binance API secret. The secret never leaves this process. */
export function signQueryString(queryString: string, apiSecret: string): string {
  return crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");
}

/** Builds a fully-signed query string, appending timestamp/recvWindow/signature. */
export function buildSignedQuery(
  params: Record<string, string | number | boolean | undefined>,
  apiSecret: string,
  recvWindowMs = 5000
): string {
  const withTimestamp = buildQueryString({ ...params, recvWindow: recvWindowMs, timestamp: Date.now() });
  const signature = signQueryString(withTimestamp, apiSecret);
  return `${withTimestamp}&signature=${signature}`;
}
