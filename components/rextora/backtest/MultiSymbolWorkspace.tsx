"use client";

import { useMemo, useState } from "react";
import { Badge, Card, Metric } from "@/components/ui/primitives";
import type { BacktestReport } from "@/src/lib/rextora/backtest/backtestTypes";
import { formatPct, formatUsdt } from "@/src/lib/rextora/backtest/visualAnalysis";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";
import { BarChart } from "@/components/rextora/charts/BarChart";
import { ReturnDrawdownScatter } from "@/components/rextora/backtest/ReturnDrawdownScatter";

export type SymbolResultStatus = "ok" | "zero_trades" | "failed";

export interface SymbolResultPayload {
  symbol: string;
  status: SymbolResultStatus;
  error?: { code: string; message: string; technicalReason?: string } | null;
  report: BacktestReport | null;
  trades: unknown[];
  equityCurve: number[];
  candles: unknown[];
  chartCandles?: unknown[];
  chartSamplingApplied?: boolean;
  processedCandleCount: number;
}

type SortKey =
  | "symbol"
  | "totalReturn"
  | "netPnl"
  | "mdd"
  | "tradeCount"
  | "winRate"
  | "profitFactor"
  | "totalCost"
  | "bestMonth"
  | "worstMonth"
  | "status";

function statusLabelKo(status: SymbolResultStatus): string {
  if (status === "ok") return "성공";
  if (status === "zero_trades") return "무거래";
  return "실패";
}

function monthExtreme(
  report: BacktestReport | null,
  which: "best" | "worst",
): number | null {
  const rows = report?.monthlyReturns ?? [];
  if (!rows.length) return null;
  const vals = rows.map((r) => r.returnPct);
  return which === "best" ? Math.max(...vals) : Math.min(...vals);
}

function rowMetrics(r: SymbolResultPayload) {
  const report = r.report;
  const netPnl =
    report != null ? report.endingBalance - report.startingBalance : null;
  const totalCost = report?.costs.totalCostUsdt ?? report?.costs.totalTradingCost ?? null;
  return {
    symbol: r.symbol,
    status: r.status,
    totalReturn: report?.totalReturn ?? null,
    netPnl,
    mdd: report?.mdd ?? null,
    tradeCount: report?.tradeCount ?? null,
    winRate: report?.winRate ?? null,
    profitFactor: report?.profitFactor ?? null,
    totalCost,
    bestMonth: monthExtreme(report, "best"),
    worstMonth: monthExtreme(report, "worst"),
    dataPeriod:
      report?.actualFirstCandleTime && report?.actualLastCandleTime
        ? `${report.actualFirstCandleTime.slice(0, 10)} ~ ${report.actualLastCandleTime.slice(0, 10)}`
        : "-",
  };
}

function compareNullable(
  a: number | null,
  b: number | null,
  dir: 1 | -1,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

export function MultiSymbolWorkspace({
  symbolResults,
  selectedSymbol,
  onSelectSymbol,
  combinedReport,
  requestedSymbols,
  successSymbols,
  failedSymbols,
}: {
  symbolResults: SymbolResultPayload[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  combinedReport: BacktestReport | null;
  requestedSymbols: string[];
  successSymbols: string[];
  failedSymbols: string[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("totalReturn");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const rows = useMemo(
    () => symbolResults.map(rowMetrics),
    [symbolResults],
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "symbol" || sortKey === "status") {
        const av = String(a[sortKey]);
        const bv = String(b[sortKey]);
        return av.localeCompare(bv) * sortDir;
      }
      return compareNullable(
        a[sortKey] as number | null,
        b[sortKey] as number | null,
        sortDir,
      );
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const successRows = rows.filter((r) => r.totalReturn != null);

  const rankings = useMemo(() => {
    if (!successRows.length) return null;
    const byReturn = [...successRows].sort(
      (a, b) => (b.totalReturn ?? -Infinity) - (a.totalReturn ?? -Infinity),
    );
    const byMdd = [...successRows].sort(
      (a, b) => (a.mdd ?? Infinity) - (b.mdd ?? Infinity),
    );
    const byPf = [...successRows].sort(
      (a, b) =>
        (b.profitFactor ?? -Infinity) - (a.profitFactor ?? -Infinity),
    );
    const byCost = [...successRows].sort(
      (a, b) => (a.totalCost ?? Infinity) - (b.totalCost ?? Infinity),
    );
    const byStability = [...successRows].sort((a, b) => {
      const aw = Math.abs(a.worstMonth ?? 0);
      const bw = Math.abs(b.worstMonth ?? 0);
      return aw - bw;
    });
    return {
      highestReturn: byReturn[0],
      lowestMdd: byMdd[0],
      bestPf: byPf[0],
      lowestCost: byCost[0],
      mostStable: byStability[0],
    };
  }, [successRows]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(key === "symbol" || key === "status" ? 1 : -1);
    }
  }

  const returnSeries = {
    id: "ret",
    name: "순수익률 %",
    color: CHART_THEME.equity,
    data: successRows.map((r, i) => ({
      x: i,
      y: (r.totalReturn ?? 0) * 100,
      label: r.symbol.replace("USDT", ""),
      color: (r.totalReturn ?? 0) >= 0 ? CHART_THEME.up : CHART_THEME.down,
    })),
  };

  const costSeries = {
    id: "cost",
    name: "총비용 USDT",
    color: CHART_THEME.fee,
    data: successRows.map((r, i) => ({
      x: i,
      y: r.totalCost ?? 0,
      label: r.symbol.replace("USDT", ""),
    })),
  };

  const winSeries = {
    id: "win",
    name: "승률 %",
    color: CHART_THEME.up,
    data: successRows.map((r, i) => ({
      x: i,
      y: (r.winRate ?? 0) * 100,
      label: r.symbol.replace("USDT", ""),
    })),
  };

  const scatterRows = successRows.map((r) => ({
    symbol: r.symbol,
    mdd: r.mdd,
    totalReturn: r.totalReturn,
    tradeCount: r.tradeCount,
    winRate: r.winRate,
    profitFactor: r.profitFactor,
    totalCost: r.totalCost,
  }));

  if (symbolResults.length <= 1) return null;

  return (
    <div className="space-y-4" data-testid="multi-symbol-workspace">
      <Card title="다중 심볼 결과">
        <p className="rx-text-muted mb-3 text-sm">
          요청 {requestedSymbols.length} · 성공 {successSymbols.length} · 실패{" "}
          {failedSymbols.length}
          {failedSymbols.length > 0 && (
            <span className="ml-2 text-rextora-negative">
              ({failedSymbols.join(", ")})
            </span>
          )}
        </p>
        {combinedReport && (
          <div
            className="mb-4 rounded-lg border border-slate-700 bg-slate-950/60 p-3"
            data-testid="combined-portfolio-summary"
          >
            <p className="rx-text-secondary mb-2 text-xs font-medium">
              결합 포트폴리오 (자본 균등 분할 합산 · 수익률 평균 아님)
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Metric
                label="결합 순수익률"
                value={formatPct(combinedReport.totalReturn)}
              />
              <Metric label="결합 낙폭" value={formatPct(combinedReport.mdd)} />
              <Metric label="총 거래" value={combinedReport.tradeCount} />
              <Metric
                label="결합 최종자산"
                value={formatUsdt(combinedReport.endingBalance)}
              />
            </div>
          </div>
        )}

        {/* Desktop: responsive grid; mobile: horizontal scroller with affordance */}
        <div className="relative" data-testid="symbol-result-tabs-wrap">
          <div
            className="hidden gap-2 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            data-testid="symbol-result-tabs"
            role="tablist"
            aria-label="심볼 결과"
          >
            {symbolResults.map((r) => (
              <SymbolTab
                key={r.symbol}
                r={r}
                m={rowMetrics(r)}
                active={r.symbol === selectedSymbol}
                onSelect={onSelectSymbol}
              />
            ))}
          </div>
          <div
            className="flex gap-2 overflow-x-auto pb-2 md:hidden"
            data-testid="symbol-result-tabs-mobile"
            role="tablist"
            aria-label="심볼 결과 (모바일)"
            onWheel={(e) => {
              // Prefer vertical page scroll; only shift+wheel pans the row
              if (!e.shiftKey) return;
              e.currentTarget.scrollLeft += e.deltaY;
              e.preventDefault();
            }}
          >
            {symbolResults.map((r) => (
              <SymbolTab
                key={r.symbol}
                r={r}
                m={rowMetrics(r)}
                active={r.symbol === selectedSymbol}
                onSelect={onSelectSymbol}
                compact
              />
            ))}
          </div>
          <p className="rx-text-muted mt-1 text-[11px] md:hidden">
            좌우로 밀어 심볼을 선택하세요
          </p>
        </div>
      </Card>

      {rankings && (
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          data-testid="symbol-ranking-cards"
        >
          {(
            [
              ["최고 수익률", rankings.highestReturn, "totalReturn"],
              ["최저 낙폭", rankings.lowestMdd, "mdd"],
              ["최고 손익비", rankings.bestPf, "profitFactor"],
              ["최저 비용", rankings.lowestCost, "totalCost"],
              ["월별 안정", rankings.mostStable, "worstMonth"],
            ] as const
          ).map(([label, row, key]) => (
            <button
              key={label}
              type="button"
              className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-left"
              onClick={() => onSelectSymbol(row.symbol)}
            >
              <div className="text-[11px] rx-text-muted">{label}</div>
              <div className="text-sm font-semibold rx-text-primary">
                {row.symbol}
              </div>
              <div className="text-xs rx-text-secondary">
                {key === "totalReturn" && formatPct(row.totalReturn ?? 0)}
                {key === "mdd" && formatPct(row.mdd ?? 0)}
                {key === "profitFactor" &&
                  (row.profitFactor ?? 0).toFixed(2)}
                {key === "totalCost" &&
                  (row.totalCost != null
                    ? formatUsdt(row.totalCost)
                    : "-")}
                {key === "worstMonth" &&
                  formatPct(row.worstMonth ?? 0)}
              </div>
            </button>
          ))}
        </div>
      )}

      <Card title="심볼 비교표">
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[900px] text-left text-sm"
            data-testid="symbol-comparison-table"
          >
            <thead className="rx-text-muted">
              <tr>
                {(
                  [
                    ["symbol", "심볼"],
                    ["totalReturn", "순수익률"],
                    ["netPnl", "순손익"],
                    ["mdd", "최대낙폭"],
                    ["tradeCount", "거래수"],
                    ["winRate", "승률"],
                    ["profitFactor", "손익비"],
                    ["totalCost", "총비용"],
                    ["bestMonth", "최고월"],
                    ["worstMonth", "최악월"],
                    ["status", "상태"],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <th key={key} className="px-2 py-2">
                    <button
                      type="button"
                      className="hover:text-rextora-text"
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      {sortKey === key ? (sortDir < 0 ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.symbol}
                  className={`cursor-pointer border-t border-slate-900 ${
                    r.symbol === selectedSymbol ? "bg-sky-950/30" : ""
                  }`}
                  onClick={() => onSelectSymbol(r.symbol)}
                  data-testid={`comparison-row-${r.symbol}`}
                >
                  <td className="px-2 py-2 font-medium">{r.symbol}</td>
                  <td className="px-2 py-2">
                    {r.totalReturn != null ? formatPct(r.totalReturn) : "-"}
                  </td>
                  <td className="px-2 py-2">
                    {r.netPnl != null ? formatUsdt(r.netPnl) : "-"}
                  </td>
                  <td className="px-2 py-2">
                    {r.mdd != null ? formatPct(r.mdd) : "-"}
                  </td>
                  <td className="px-2 py-2">{r.tradeCount ?? "-"}</td>
                  <td className="px-2 py-2">
                    {r.winRate != null ? formatPct(r.winRate, 1) : "-"}
                  </td>
                  <td className="px-2 py-2">
                    {r.profitFactor != null
                      ? r.profitFactor.toFixed(2)
                      : "-"}
                  </td>
                  <td className="px-2 py-2">
                    {r.totalCost != null ? formatUsdt(r.totalCost) : "-"}
                  </td>
                  <td className="px-2 py-2">
                    {r.bestMonth != null ? formatPct(r.bestMonth) : "-"}
                  </td>
                  <td className="px-2 py-2">
                    {r.worstMonth != null ? formatPct(r.worstMonth) : "-"}
                  </td>
                  <td className="px-2 py-2">{statusLabelKo(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {successRows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2" data-testid="symbol-comparison-charts">
          <Card title="수익률 비교">
            <BarChart title="" series={returnSeries} height={280} diverging />
          </Card>
          <Card title="비용 비교">
            <BarChart title="" series={costSeries} height={280} />
          </Card>
          <Card title="승률 비교">
            <BarChart title="" series={winSeries} height={280} />
          </Card>
          <Card title="수익률 vs 낙폭">
            <ReturnDrawdownScatter
              rows={scatterRows}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={onSelectSymbol}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function SymbolTab({
  r,
  m,
  active,
  onSelect,
  compact = false,
}: {
  r: SymbolResultPayload;
  m: ReturnType<typeof rowMetrics>;
  active: boolean;
  onSelect: (symbol: string) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={`symbol-tab-${r.symbol}`}
      className={`${compact ? "min-w-[148px] shrink-0" : "w-full"} rounded-lg border px-3 py-2 text-left text-sm ${
        active
          ? "border-sky-500 bg-sky-950/40"
          : "border-slate-800 bg-slate-950/40"
      }`}
      onClick={() => onSelect(r.symbol)}
    >
      <div className="font-semibold rx-text-primary">{r.symbol}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        <Badge
          tone={
            r.status === "failed"
              ? "danger"
              : r.status === "zero_trades"
                ? "warning"
                : "success"
          }
        >
          {statusLabelKo(r.status)}
        </Badge>
      </div>
      {m.totalReturn != null ? (
        <div className="mt-1 space-y-0.5 text-[11px] rx-text-secondary">
          <div>수익률 {formatPct(m.totalReturn)}</div>
          <div>낙폭 {formatPct(m.mdd ?? 0)}</div>
          <div>거래 {m.tradeCount}</div>
          <div>승률 {formatPct(m.winRate ?? 0, 1)}</div>
          <div>손익비 {(m.profitFactor ?? 0).toFixed(2)}</div>
          <div>
            비용 {m.totalCost != null ? formatUsdt(m.totalCost) : "-"}
          </div>
          <div className="truncate rx-text-muted">{m.dataPeriod}</div>
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-rextora-negative">
          {r.error?.message ?? "결과 없음"}
        </div>
      )}
    </button>
  );
}
