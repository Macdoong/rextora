import type { OhlcvCandle } from "../../data/ohlcvTypes";

export type OrderBlockZoneBasis =
  | "BODY"
  | "FULL_CANDLE"
  | "BODY_PLUS_WICK_PERCENT";

export const ORDER_BLOCK_ZONE_BASIS_VALUES: readonly OrderBlockZoneBasis[] = [
  "BODY",
  "FULL_CANDLE",
  "BODY_PLUS_WICK_PERCENT",
] as const;

export const ORDER_BLOCK_ZONE_BASIS_LABEL_KO: Record<OrderBlockZoneBasis, string> = {
  BODY: "몸통",
  FULL_CANDLE: "전체 봉",
  BODY_PLUS_WICK_PERCENT: "몸통 + 꼬리 %",
};

/** Resolve stored zone basis; legacy `bodyOnly` maps to BODY / FULL_CANDLE only. */
export function resolveOrderBlockZoneBasis(input: {
  zoneBasis?: unknown;
  bodyOnly?: unknown;
}): OrderBlockZoneBasis {
  const raw = input.zoneBasis;
  if (
    raw === "BODY" ||
    raw === "FULL_CANDLE" ||
    raw === "BODY_PLUS_WICK_PERCENT"
  ) {
    return raw;
  }
  if (input.bodyOnly === false) return "FULL_CANDLE";
  return "BODY";
}

export function computeOrderBlockZoneBounds(
  candle: Pick<OhlcvCandle, "open" | "high" | "low" | "close">,
  basis: OrderBlockZoneBasis,
  wickExtensionPct = 0,
): { high: number; low: number } {
  const bodyHigh = Math.max(candle.open, candle.close);
  const bodyLow = Math.min(candle.open, candle.close);
  if (basis === "FULL_CANDLE") {
    return { high: candle.high, low: candle.low };
  }
  if (basis === "BODY_PLUS_WICK_PERCENT") {
    const pct = Math.max(0, wickExtensionPct) / 100;
    const upperWick = Math.max(0, candle.high - bodyHigh);
    const lowerWick = Math.max(0, bodyLow - candle.low);
    return {
      high: bodyHigh + upperWick * pct,
      low: bodyLow - lowerWick * pct,
    };
  }
  return { high: bodyHigh, low: bodyLow };
}

/** Legacy mirror for persisted strategies that only store `bodyOnly`. */
export function bodyOnlyFromZoneBasis(basis: OrderBlockZoneBasis): boolean {
  return basis === "BODY";
}
