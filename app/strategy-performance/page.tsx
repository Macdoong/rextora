"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import type { StoredStrategy } from "@/src/lib/rextora/strategy/strategyTypes";
import type { SavedBacktestResult } from "@/src/lib/rextora/backtest/backtestTypes";
import {
  EquityCurveChart,
  ScatterChart,
  BarChart,
} from "@/components/rextora/charts";
import { strategyScatter } from "@/src/lib/rextora/charts/adapters";
import { CHART_THEME, SERIES_PALETTE } from "@/src/lib/rextora/charts/theme";
import type { ChartSeries } from "@/src/lib/rextora/charts/types";
import { displayParamsHashLabel } from "@/src/lib/rextora/displayLabels";

export default function StrategyPerformancePage() {
  const [strategies, setStrategies] = useState<StoredStrategy[]>([]);
  const [saved, setSaved] = useState<SavedBacktestResult[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void Promise.all([
        fetch("/api/rextora/strategies").then((r) => r.json()),
        fetch("/api/rextora/backtest/run").then((r) => r.json()),
      ]).then(([s, b]) => {
        setStrategies(s.data ?? []);
        setSaved(b.data ?? []);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const latestSavedByStrategy = useMemo(() => {
    const map = new Map<string, SavedBacktestResult>();
    for (const row of saved) {
      const previous = map.get(row.config.strategyId);
      if (!previous || row.createdAt > previous.createdAt)
        map.set(row.config.strategyId, row);
    }
    return map;
  }, [saved]);
  const performanceRows = useMemo(
    () =>
      strategies.flatMap((strategy) => {
        const result = latestSavedByStrategy.get(strategy.id);
        return result ? [{ strategy, report: result.report }] : [];
      }),
    [latestSavedByStrategy, strategies],
  );
  const best = [...performanceRows].sort(
    (a, b) => b.report.totalReturn - a.report.totalReturn,
  )[0];
  const compare = strategies.filter((s) => selected.includes(s.id)).slice(0, 3);

  const scatter = useMemo(
    () =>
      strategyScatter(
        performanceRows.map(({ strategy, report }) => ({
          name: strategy.name,
          totalReturn: report.totalReturn,
          mdd: report.mdd,
          trades: report.tradeCount,
        })),
      ),
    [performanceRows],
  );

  const compareEquity: ChartSeries[] = useMemo(
    () =>
      compare.map((s, i) => ({
        id: s.id,
        name: s.name,
        color: SERIES_PALETTE[i % SERIES_PALETTE.length],
        data: [
          { x: 0, y: 100 },
          {
            x: 1,
            y:
              100 *
              (1 + (latestSavedByStrategy.get(s.id)?.report.totalReturn ?? 0)),
          },
        ],
      })),
    [compare, latestSavedByStrategy],
  );

  const winRateSeries: ChartSeries = useMemo(
    () => ({
      id: "wr",
      name: "승률 %",
      color: CHART_THEME.up,
      data: performanceRows.map(({ strategy, report }, i) => ({
        x: i,
        y: report.winRate * 100,
        label: strategy.name,
      })),
    }),
    [performanceRows],
  );

  const profitFactorSeries: ChartSeries = useMemo(
    () => ({
      id: "pf",
      name: "손익비",
      color: CHART_THEME.accent,
      data: [...latestSavedByStrategy.entries()].map(([id, row], i) => {
        const name = strategies.find((s) => s.id === id)?.name ?? id;
        return { x: i, y: row.report.profitFactor, label: name };
      }),
    }),
    [latestSavedByStrategy, strategies],
  );

  const tradeCountSeries: ChartSeries = useMemo(
    () => ({
      id: "tc",
      name: "거래 수",
      color: CHART_THEME.equity,
      data: performanceRows.map(({ strategy, report }, i) => ({
        x: i,
        y: report.tradeCount,
        label: strategy.name,
      })),
    }),
    [performanceRows],
  );

  const drawdownCompare: ChartSeries[] = useMemo(
    () =>
      compare.map((s, i) => {
        const savedRow = latestSavedByStrategy.get(s.id);
        const mdd = Math.abs(savedRow?.report.mdd ?? 0) * 100;
        return {
          id: `${s.id}-dd`,
          name: s.name,
          color: SERIES_PALETTE[i % SERIES_PALETTE.length],
          data: [
            { x: 0, y: 0 },
            { x: 1, y: -mdd },
          ],
        };
      }),
    [compare, latestSavedByStrategy],
  );

  const monthlyCompare: ChartSeries[] = useMemo(() => {
    const out: ChartSeries[] = [];
    compare.forEach((s, i) => {
      const months =
        latestSavedByStrategy.get(s.id)?.report.monthlyReturns ?? [];
      if (!months.length) return;
      out.push({
        id: `${s.id}-monthly`,
        name: s.name,
        color: SERIES_PALETTE[i % SERIES_PALETTE.length],
        data: months.map((m, idx) => ({
          x: idx,
          y: m.returnPct * 100,
          label: m.month,
        })),
      });
    });
    return out;
  }, [compare, latestSavedByStrategy]);

  return (
    <div className="space-y-4" data-testid="strategy-performance">
      <div>
        <h1 className="text-2xl font-bold text-white">전략 성과</h1>
        <p className="mt-1 text-sm text-slate-400">
          저장된 백테스트 결과를 비교합니다. AI는 진입을 결정하지 않습니다.
        </p>
      </div>
      <p className="text-xs text-slate-500">
        데이터 출처: 저장된 백테스트 결과 · 과거 데이터 시뮬레이션
      </p>

      {best && (
        <Card title="실전 후보 1순위" data-testid="best-strategy-card">
          <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-3">
            <div>전략: {best.strategy.name}</div>
            <div>
              {displayParamsHashLabel()}: {best.strategy.paramsHash}
            </div>
            <div>
              최근 수익률: {(best.report.totalReturn * 100).toFixed(1)}%
            </div>
            <div title="자산 최고점에서 이후 최저점까지의 가장 큰 하락률">
              최대 낙폭 ⓘ: {(best.report.mdd * 100).toFixed(1)}%
            </div>
            <div title="백테스트 기간에 완료된 전체 거래 건수">
              거래 수 ⓘ: {best.report.tradeCount}
            </div>
            <div>
              실전 후보:{" "}
              {best.strategy.liveEligible ? "가능" : "추가 검증 필요"}
            </div>
          </div>
        </Card>
      )}

      <Card title="전략 성과 테이블">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th>비교</th>
                <th>전략명</th>
                <th>{displayParamsHashLabel()}</th>
                <th>총 수익률</th>
                <th title="자산 최고점에서 이후 최저점까지의 가장 큰 하락률">
                  최대 낙폭 ⓘ
                </th>
                <th>거래 수</th>
                <th>승률</th>
                <th>실전 후보</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => {
                const report = latestSavedByStrategy.get(s.id)?.report;
                return (
                  <tr key={s.id} className="border-t border-slate-900">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, s.id].slice(0, 3)
                              : prev.filter((id) => id !== s.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      {s.name} {s.locked && <Badge tone="warning">보호</Badge>}
                    </td>
                    <td className="font-mono text-xs">{s.paramsHash}</td>
                    <td>
                      {report
                        ? `${(report.totalReturn * 100).toFixed(2)}%`
                        : "-"}
                    </td>
                    <td>
                      {report ? `${(report.mdd * 100).toFixed(2)}%` : "-"}
                    </td>
                    <td>{report?.tradeCount ?? "-"}</td>
                    <td>
                      {report ? `${(report.winRate * 100).toFixed(1)}%` : "-"}
                    </td>
                    <td>{s.liveEligible ? "예" : "아니오"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {compare.length >= 2 && (
        <Card title="전략 비교 (2~3개)">
          <div className="grid gap-3 md:grid-cols-3">
            {compare.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-slate-800 p-3 text-sm text-slate-300"
              >
                <div className="font-semibold text-white">{s.name}</div>
                <div>
                  수익{" "}
                  {(
                    (latestSavedByStrategy.get(s.id)?.report.totalReturn ?? 0) *
                    100
                  ).toFixed(2)}
                  %
                </div>
                <div>
                  최대 낙폭{" "}
                  {(
                    (latestSavedByStrategy.get(s.id)?.report.mdd ?? 0) * 100
                  ).toFixed(2)}
                  %
                </div>
                <div>
                  거래 {latestSavedByStrategy.get(s.id)?.report.tradeCount ?? 0}
                </div>
                <div>
                  승률{" "}
                  {(
                    (latestSavedByStrategy.get(s.id)?.report.winRate ?? 0) * 100
                  ).toFixed(1)}
                  %
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <EquityCurveChart
              title="자산 변화 비교"
              series={compareEquity}
              height={200}
              area={false}
            />
            <ScatterChart
              title="위험 대비 수익"
              points={scatter.filter((p) =>
                compare.some((c) => c.name === p.label),
              )}
              height={200}
            />
          </div>
          {drawdownCompare.length > 0 && (
            <div className="mt-4">
              <EquityCurveChart
                title="낙폭 비교"
                series={drawdownCompare}
                height={160}
                area
              />
            </div>
          )}
          {monthlyCompare.length > 0 && (
            <div className="mt-4">
              <EquityCurveChart
                title="월별 수익률 비교"
                series={monthlyCompare}
                height={180}
                area={false}
              />
            </div>
          )}
          <p className="mt-3 text-sm text-slate-400">
            AI 조언: MDD가 작고 거래 수가 충분한 전략이 더 안전합니다. 비용
            스트레스(x1.5/x2)에서 무너지면 추가 백테스트가 필요합니다. AI는 실전
            진입을 결정하지 않습니다.{" "}
            <a className="text-violet-300 underline" href="/ai-reports">
              AI 분석 보고
            </a>
          </p>
        </Card>
      )}

      {performanceRows.length > 0 ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ScatterChart
              title="전체 전략 · 위험 대비 수익"
              points={scatter}
              height={240}
            />
            <BarChart title="전략별 승률" series={winRateSeries} height={240} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BarChart
              title="전략별 손익비"
              series={profitFactorSeries}
              height={200}
            />
            <BarChart
              title="전략별 거래 수"
              series={tradeCountSeries}
              height={200}
            />
          </div>
        </>
      ) : (
        <Card title="성과 차트" className="!p-3">
          <p className="text-sm text-slate-400">
            저장된 결과가 없습니다. 백테스트를 실행하고 결과를 저장하면 전략
            비교 차트가 표시됩니다.
          </p>
        </Card>
      )}

      <Card title="저장된 백테스트">
        <p className="text-sm text-slate-400">
          저장 건수: {saved.length} (없으면 백테스트에서 결과 저장)
        </p>
      </Card>
    </div>
  );
}
