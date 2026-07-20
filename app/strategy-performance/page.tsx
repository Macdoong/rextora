"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import type { StoredStrategy } from "@/src/lib/rextora/strategy/strategyTypes";
import type { SavedBacktestResult } from "@/src/lib/rextora/backtest/backtestTypes";

export default function StrategyPerformancePage() {
  const [strategies, setStrategies] = useState<StoredStrategy[]>([]);
  const [saved, setSaved] = useState<SavedBacktestResult[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void Promise.all([fetch("/api/rextora/strategies").then((r) => r.json()), fetch("/api/rextora/backtest/run").then((r) => r.json())]).then(
        ([s, b]) => {
          setStrategies(s.data ?? []);
          setSaved(b.data ?? []);
        }
      );
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const best = [...strategies].sort((a, b) => (b.lastBacktest?.totalReturn ?? -99) - (a.lastBacktest?.totalReturn ?? -99))[0];
  const compare = strategies.filter((s) => selected.includes(s.id)).slice(0, 3);

  return (
    <div className="space-y-4" data-testid="strategy-performance">
      <div>
        <h1 className="text-2xl font-bold text-white">전략 성과</h1>
        <p className="mt-1 text-sm text-slate-400">저장된 백테스트 결과를 비교합니다. AI는 진입을 결정하지 않습니다.</p>
      </div>

      {best && (
        <Card title="실전 후보 1순위" data-testid="best-strategy-card">
          <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-3">
            <div>전략: {best.name}</div>
            <div>hash: {best.paramsHash}</div>
            <div>최근 수익률: {best.lastBacktest ? `${(best.lastBacktest.totalReturn * 100).toFixed(1)}%` : "-"}</div>
            <div>MDD: {best.lastBacktest ? `${(best.lastBacktest.mdd * 100).toFixed(1)}%` : "-"}</div>
            <div>거래 수: {best.lastBacktest?.trades ?? "-"}</div>
            <div>실전 후보: {best.liveEligible ? "가능" : "추가 검증 필요"}</div>
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
                <th>params_hash</th>
                <th>총 수익률</th>
                <th>MDD</th>
                <th>거래 수</th>
                <th>승률</th>
                <th>실전 후보</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => (
                <tr key={s.id} className="border-t border-slate-900">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      onChange={(e) =>
                        setSelected((prev) => (e.target.checked ? [...prev, s.id].slice(0, 3) : prev.filter((id) => id !== s.id)))
                      }
                    />
                  </td>
                  <td>
                    {s.name} {s.locked && <Badge tone="warning">보호</Badge>}
                  </td>
                  <td className="font-mono text-xs">{s.paramsHash}</td>
                  <td>{s.lastBacktest ? `${(s.lastBacktest.totalReturn * 100).toFixed(2)}%` : "-"}</td>
                  <td>{s.lastBacktest ? `${(s.lastBacktest.mdd * 100).toFixed(2)}%` : "-"}</td>
                  <td>{s.lastBacktest?.trades ?? "-"}</td>
                  <td>{s.lastBacktest ? `${(s.lastBacktest.winRate * 100).toFixed(1)}%` : "-"}</td>
                  <td>{s.liveEligible ? "예" : "아니오"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {compare.length >= 2 && (
        <Card title="전략 비교 (2~3개)">
          <div className="grid gap-3 md:grid-cols-3">
            {compare.map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-800 p-3 text-sm text-slate-300">
                <div className="font-semibold text-white">{s.name}</div>
                <div>수익 {(s.lastBacktest?.totalReturn ?? 0) * 100}%</div>
                <div>MDD {(s.lastBacktest?.mdd ?? 0) * 100}%</div>
                <div>거래 {s.lastBacktest?.trades ?? 0}</div>
                <div>승률 {((s.lastBacktest?.winRate ?? 0) * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-400">
            AI 조언: MDD가 작고 거래 수가 충분한 전략이 더 안전합니다. 비용 스트레스(x1.5/x2)에서 무너지면 추가 백테스트가 필요합니다. AI는 실전 진입을 결정하지 않습니다.{" "}
            <a className="text-violet-300 underline" href="/ai-reports">
              AI 분석 보고
            </a>
          </p>
        </Card>
      )}

      <Card title="저장된 백테스트">
        <p className="text-sm text-slate-400">저장 건수: {saved.length} (없으면 백테스트에서 결과 저장)</p>
      </Card>
    </div>
  );
}
