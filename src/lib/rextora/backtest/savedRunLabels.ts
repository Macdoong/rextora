/**
 * Beginner-facing labels for saved Backtest Run selectors.
 */

import type { BacktestRunStatus } from "./backtestTypes";

export function backtestStatusLabelKo(
  status: BacktestRunStatus | string | null | undefined,
): string {
  switch (status) {
    case "running":
      return "실행 중";
    case "failed":
      return "실패";
    case "cancelled":
      return "취소";
    case "queued":
      return "대기 중";
    case "completed":
    default:
      return "완료";
  }
}

export function dataVersionLabelKo(
  dataVersion: string | null | undefined,
): string {
  if (!dataVersion) return "—";
  if (dataVersion === "binance" || dataVersion === "binance_futures") {
    return "Binance Futures";
  }
  if (dataVersion === "synthetic-test") return "테스트용 합성 데이터";
  return dataVersion;
}

export interface SavedRunLabelInput {
  id: string;
  createdAt: string;
  status?: BacktestRunStatus | string | null;
  report: {
    fromDate?: string | null;
    toDate?: string | null;
    symbol?: string | null;
  };
  config?: {
    symbols?: string[] | null;
  };
}

function runSymbol(run: SavedRunLabelInput): string {
  return (
    run.report.symbol ??
    run.config?.symbols?.[0] ??
    "?"
  ).toUpperCase();
}

function executionTimeLabel(
  createdAt: string,
  includeSeconds: boolean,
): string | null {
  const d = new Date(createdAt);
  if (!Number.isFinite(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (!includeSeconds) return `${hh}:${mm} 실행`;
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} 실행`;
}

function sameMinuteKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
}

/** Compact primary option label — never uses raw ISO timestamps. */
export function formatSavedRunOptionLabel(
  run: SavedRunLabelInput,
  peers: SavedRunLabelInput[],
): string {
  const symbol = runSymbol(run);
  const from = run.report.fromDate ?? "?";
  const to = run.report.toDate ?? "?";
  const status = backtestStatusLabelKo(run.status);
  const samePeriod = peers.filter(
    (p) =>
      runSymbol(p) === symbol &&
      (p.report.fromDate ?? null) === (run.report.fromDate ?? null) &&
      (p.report.toDate ?? null) === (run.report.toDate ?? null),
  );
  if (samePeriod.length <= 1) {
    return `${symbol} · ${from} ~ ${to} · ${status}`;
  }
  const minutePeers = samePeriod.filter(
    (p) => sameMinuteKey(p.createdAt) === sameMinuteKey(run.createdAt),
  );
  const includeSeconds = minutePeers.length > 1;
  const time = executionTimeLabel(run.createdAt, includeSeconds);
  if (time) return `${symbol} · ${from} ~ ${to} · ${time} · ${status}`;
  return `${symbol} · ${from} ~ ${to} · ${status}`;
}
