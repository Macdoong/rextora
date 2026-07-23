import { getKlinesRange } from "../binance/binanceReadOnlyService";
import {
  candlesFromBinanceKlines,
  type OhlcvCandle,
} from "./ohlcvTypes";
import {
  resolveTimeframe,
  validateCandleSpacing,
  type SupportedTimeframe,
} from "./timeframes";

/** Binance USD-M futures max klines per request */
export const BINANCE_KLINES_PAGE_LIMIT = 1500;

export type HistoricalLoadErrorCode =
  | "TIMEFRAME_UNSUPPORTED"
  | "RANGE_INVALID"
  | "BINANCE_FETCH_FAILED"
  | "EMPTY_CANDLES"
  | "MALFORMED_CANDLES"
  | "SPACING_INCONSISTENT"
  | "INSUFFICIENT_CANDLES";

export class HistoricalCandleLoadError extends Error {
  readonly code: HistoricalLoadErrorCode;
  readonly userMessage: string;
  readonly technicalReason: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly requestedFrom: string | null;
  readonly requestedTo: string | null;
  readonly candlesReceived: number;

  constructor(input: {
    code: HistoricalLoadErrorCode;
    userMessage: string;
    technicalReason: string;
    symbol: string;
    timeframe: string;
    requestedFrom: string | null;
    requestedTo: string | null;
    candlesReceived: number;
  }) {
    super(input.userMessage);
    this.name = "HistoricalCandleLoadError";
    this.code = input.code;
    this.userMessage = input.userMessage;
    this.technicalReason = input.technicalReason;
    this.symbol = input.symbol;
    this.timeframe = input.timeframe;
    this.requestedFrom = input.requestedFrom;
    this.requestedTo = input.requestedTo;
    this.candlesReceived = input.candlesReceived;
  }

  toJSON() {
    return {
      code: this.code,
      userMessage: this.userMessage,
      technicalReason: this.technicalReason,
      symbol: this.symbol,
      timeframe: this.timeframe,
      requestedFrom: this.requestedFrom,
      requestedTo: this.requestedTo,
      candlesReceived: this.candlesReceived,
    };
  }
}

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function isValidCandle(c: OhlcvCandle): boolean {
  return (
    Number.isFinite(c.openTime) &&
    c.openTime > 0 &&
    isFinitePositive(c.open) &&
    isFinitePositive(c.high) &&
    isFinitePositive(c.low) &&
    isFinitePositive(c.close) &&
    Number.isFinite(c.volume) &&
    c.volume >= 0 &&
    c.high >= Math.max(c.open, c.close) &&
    c.low <= Math.min(c.open, c.close)
  );
}

function dedupeSort(candles: OhlcvCandle[]): OhlcvCandle[] {
  const byTime = new Map<number, OhlcvCandle>();
  for (const c of candles) {
    byTime.set(c.openTime, c);
  }
  return [...byTime.values()].sort((a, b) => a.openTime - b.openTime);
}

export interface LoadHistoricalCandlesInput {
  symbol: string;
  timeframe: string;
  fromOpenTime: number;
  toOpenTime: number;
  /** Soft upper bound to avoid runaway pagination (default 20_000) */
  maxCandles?: number;
  /** Injected fetch for unit tests */
  fetchPage?: typeof getKlinesRange;
}

export interface LoadHistoricalCandlesResult {
  candles: OhlcvCandle[];
  source: "binance";
  symbol: string;
  timeframe: SupportedTimeframe;
  intervalMs: number;
  requestedFrom: string;
  requestedTo: string;
  actualFirstCandleTime: string | null;
  actualLastCandleTime: string | null;
}

/**
 * Load paginated Binance USD-M Futures OHLCV for an exact open-time range.
 * Never substitutes synthetic candles.
 */
export async function loadHistoricalCandles(
  input: LoadHistoricalCandlesInput,
): Promise<LoadHistoricalCandlesResult> {
  const symbol = input.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const requestedFrom = new Date(input.fromOpenTime).toISOString();
  const requestedTo = new Date(input.toOpenTime).toISOString();

  let spec;
  try {
    spec = resolveTimeframe(input.timeframe);
  } catch {
    throw new HistoricalCandleLoadError({
      code: "TIMEFRAME_UNSUPPORTED",
      userMessage: `지원하지 않는 시간봉입니다 (${input.timeframe}).`,
      technicalReason: `unsupported timeframe: ${input.timeframe}`,
      symbol,
      timeframe: input.timeframe,
      requestedFrom,
      requestedTo,
      candlesReceived: 0,
    });
  }

  if (
    !Number.isFinite(input.fromOpenTime) ||
    !Number.isFinite(input.toOpenTime) ||
    input.toOpenTime < input.fromOpenTime
  ) {
    throw new HistoricalCandleLoadError({
      code: "RANGE_INVALID",
      userMessage: "요청한 날짜 범위가 올바르지 않습니다.",
      technicalReason: `invalid range from=${input.fromOpenTime} to=${input.toOpenTime}`,
      symbol,
      timeframe: spec.id,
      requestedFrom,
      requestedTo,
      candlesReceived: 0,
    });
  }

  const fetchPage = input.fetchPage ?? getKlinesRange;
  const maxCandles = input.maxCandles ?? 20_000;
  const collected: OhlcvCandle[] = [];
  let cursor = input.fromOpenTime;
  let pages = 0;
  const maxPages = Math.ceil(maxCandles / BINANCE_KLINES_PAGE_LIMIT) + 2;

  while (cursor <= input.toOpenTime && pages < maxPages && collected.length < maxCandles) {
    pages += 1;
    const result = await fetchPage(
      symbol,
      spec.binanceInterval,
      BINANCE_KLINES_PAGE_LIMIT,
      cursor,
      input.toOpenTime,
    );

    if (!result.ok || !Array.isArray(result.data)) {
      throw new HistoricalCandleLoadError({
        code: "BINANCE_FETCH_FAILED",
        userMessage:
          "Binance 선물 과거 캔들을 불러오지 못했습니다. 네트워크와 심볼을 확인한 뒤 다시 시도하세요.",
        technicalReason: result.message || "klines fetch failed",
        symbol,
        timeframe: spec.id,
        requestedFrom,
        requestedTo,
        candlesReceived: collected.length,
      });
    }

    if (result.data.length === 0) break;

    const pageCandles = candlesFromBinanceKlines(
      result.data as Array<Array<string | number>>,
    );
    collected.push(...pageCandles);

    const lastOpen = pageCandles[pageCandles.length - 1]?.openTime;
    if (lastOpen == null || lastOpen <= cursor) break;
    // Advance past last open so we do not re-fetch the same candle
    cursor = lastOpen + 1;
    if (pageCandles.length < BINANCE_KLINES_PAGE_LIMIT) break;
  }

  const inRange = collected.filter(
    (c) => c.openTime >= input.fromOpenTime && c.openTime <= input.toOpenTime,
  );
  const valid = inRange.filter(isValidCandle);
  if (valid.length < inRange.length) {
    throw new HistoricalCandleLoadError({
      code: "MALFORMED_CANDLES",
      userMessage: "수신한 캔들 데이터에 손상된 값이 포함되어 있습니다.",
      technicalReason: `malformed ${inRange.length - valid.length} of ${inRange.length}`,
      symbol,
      timeframe: spec.id,
      requestedFrom,
      requestedTo,
      candlesReceived: inRange.length,
    });
  }

  const candles = dedupeSort(valid);

  if (candles.length === 0) {
    throw new HistoricalCandleLoadError({
      code: "EMPTY_CANDLES",
      userMessage:
        "선택한 기간에 Binance 선물 캔들이 없습니다. 기간·심볼·시간봉을 확인하세요.",
      technicalReason: "zero candles after range filter",
      symbol,
      timeframe: spec.id,
      requestedFrom,
      requestedTo,
      candlesReceived: 0,
    });
  }

  const spacingError = validateCandleSpacing(
    candles.map((c) => c.openTime),
    spec.intervalMs,
  );
  if (spacingError) {
    throw new HistoricalCandleLoadError({
      code: "SPACING_INCONSISTENT",
      userMessage: "수신한 캔들 간격이 선택한 시간봉과 일치하지 않습니다.",
      technicalReason: spacingError,
      symbol,
      timeframe: spec.id,
      requestedFrom,
      requestedTo,
      candlesReceived: candles.length,
    });
  }

  return {
    candles,
    source: "binance",
    symbol,
    timeframe: spec.id,
    intervalMs: spec.intervalMs,
    requestedFrom,
    requestedTo,
    actualFirstCandleTime: new Date(candles[0].openTime).toISOString(),
    actualLastCandleTime: new Date(
      candles[candles.length - 1].openTime,
    ).toISOString(),
  };
}
