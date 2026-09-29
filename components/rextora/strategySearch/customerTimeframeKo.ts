/** Customer-facing Korean candle labels (API values stay e.g. 15m). */

const TIMEFRAME_KO: Record<string, string> = {
  "1m": "1분봉",
  "3m": "3분봉",
  "5m": "5분봉",
  "15m": "15분봉",
  "1h": "1시간봉",
};

export function formatTimeframeCustomerKo(tf: string | null | undefined): string {
  if (!tf) return "—";
  return TIMEFRAME_KO[tf] ?? tf;
}
