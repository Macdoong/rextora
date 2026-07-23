/**
 * Monthly trade-coverage panel helpers.
 * Reconciles requested/actual candle range with the canonical trade ledger.
 */

export type CoverageStatus = "has_trades" | "no_trades" | "insufficient_data";

export interface MonthlyCoverageRow {
  monthKey: string;
  labelKo: string;
  candleCount: number;
  tradeCount: number;
  longCount: number;
  shortCount: number;
  netPnlUsdt: number;
  returnPctOfInitial: number;
  status: CoverageStatus;
  statusLabelKo: string;
}

export interface TradeCoverageInput {
  entryTime?: number | null;
  exitTime?: number | null;
  side: "LONG" | "SHORT";
  netPnlUsdt: number;
}

export interface CandleCoverageInput {
  openTime: number;
}

function monthKeyUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelKo(key: string): string {
  const [y, m] = key.split("-");
  return `${y}년 ${Number(m)}월`;
}

function monthStartUtc(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, 1);
}

function nextMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return monthKeyUtc(d.getTime());
}

function enumerateMonths(fromMs: number, toMs: number): string[] {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return [];
  }
  const keys: string[] = [];
  let key = monthKeyUtc(fromMs);
  const endKey = monthKeyUtc(toMs);
  // Safety bound
  for (let i = 0; i < 120; i += 1) {
    keys.push(key);
    if (key === endKey) break;
    key = nextMonthKey(key);
  }
  return keys;
}

/**
 * Build one row per calendar month spanning the verified candle (or request) range.
 * Status is deterministic from candle + trade counts — never inferred beyond data.
 */
export function buildMonthlyCoverage(input: {
  candles: CandleCoverageInput[];
  trades: TradeCoverageInput[];
  startingBalance: number;
  /** Prefer actual candle span; fall back to request ISO strings. */
  rangeStartMs?: number | null;
  rangeEndMs?: number | null;
}): MonthlyCoverageRow[] {
  const candleTimes = input.candles
    .map((c) => c.openTime)
    .filter((t) => Number.isFinite(t));
  const tradeTimes = input.trades
    .map((t) => t.exitTime ?? t.entryTime)
    .filter((t): t is number => t != null && Number.isFinite(t));

  const fromMs =
    input.rangeStartMs ??
    (candleTimes.length ? Math.min(...candleTimes) : null) ??
    (tradeTimes.length ? Math.min(...tradeTimes) : null);
  const toMs =
    input.rangeEndMs ??
    (candleTimes.length ? Math.max(...candleTimes) : null) ??
    (tradeTimes.length ? Math.max(...tradeTimes) : null);

  if (fromMs == null || toMs == null) return [];

  const months = enumerateMonths(fromMs, toMs);
  const candleByMonth = new Map<string, number>();
  for (const t of candleTimes) {
    const k = monthKeyUtc(t);
    candleByMonth.set(k, (candleByMonth.get(k) ?? 0) + 1);
  }

  const tradeAgg = new Map<
    string,
    { count: number; long: number; short: number; pnl: number }
  >();
  for (const t of input.trades) {
    const ts = t.exitTime ?? t.entryTime;
    if (ts == null || !Number.isFinite(ts)) continue;
    const k = monthKeyUtc(ts);
    const cur = tradeAgg.get(k) ?? { count: 0, long: 0, short: 0, pnl: 0 };
    cur.count += 1;
    if (t.side === "LONG") cur.long += 1;
    else cur.short += 1;
    cur.pnl += t.netPnlUsdt;
    tradeAgg.set(k, cur);
  }

  const bal = input.startingBalance > 0 ? input.startingBalance : 1;

  return months.map((monthKey) => {
    const candles = candleByMonth.get(monthKey) ?? 0;
    const agg = tradeAgg.get(monthKey) ?? {
      count: 0,
      long: 0,
      short: 0,
      pnl: 0,
    };
    let status: CoverageStatus;
    let statusLabelKo: string;
    if (candles === 0) {
      status = "insufficient_data";
      statusLabelKo = "데이터 부족";
    } else if (agg.count === 0) {
      status = "no_trades";
      statusLabelKo = "거래 없음";
    } else {
      status = "has_trades";
      statusLabelKo = "거래 있음";
    }
    return {
      monthKey,
      labelKo: monthLabelKo(monthKey),
      candleCount: candles,
      tradeCount: agg.count,
      longCount: agg.long,
      shortCount: agg.short,
      netPnlUsdt: Number(agg.pnl.toFixed(6)),
      returnPctOfInitial: agg.pnl / bal,
      status,
      statusLabelKo,
    };
  });
}

/** Count trades whose entry is strictly after the given UTC instant. */
export function countTradesAfter(
  trades: Array<{ entryTime?: number | null }>,
  afterMs: number,
): number {
  return trades.filter(
    (t) => t.entryTime != null && t.entryTime > afterMs,
  ).length;
}

export function lastTradeExitMs(
  trades: Array<{ exitTime?: number | null; entryTime?: number | null }>,
): number | null {
  let max: number | null = null;
  for (const t of trades) {
    const ts = t.exitTime ?? t.entryTime;
    if (ts == null || !Number.isFinite(ts)) continue;
    if (max == null || ts > max) max = ts;
  }
  return max;
}

export function firstTradeEntryMs(
  trades: Array<{ entryTime?: number | null }>,
): number | null {
  let min: number | null = null;
  for (const t of trades) {
    if (t.entryTime == null || !Number.isFinite(t.entryTime)) continue;
    if (min == null || t.entryTime < min) min = t.entryTime;
  }
  return min;
}

/** May 31 2026 23:59:59.999 UTC — used only for audit/tests of the observed cutoff. */
export const MAY_2026_END_UTC = Date.UTC(2026, 4, 31, 23, 59, 59, 999);

export { monthKeyUtc, monthStartUtc };
