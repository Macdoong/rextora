"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { TradingChartsPanel } from "@/components/rextora/charts/TradingChartsPanel";
import type { UnifiedMetricsSnapshot } from "@/src/lib/rextora/metrics/types";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import { EmptyState } from "@/components/rextora/EmptyState";
import {
  displayParamsHashLabel,
  formatDataSourceMeta,
} from "@/src/lib/rextora/displayLabels";

type Metrics = UnifiedMetricsSnapshot;

export default function PaperTradingPage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [strategy, setStrategy] = useState<{
    name: string;
    paramsHash: string;
  } | null>(null);
  const [riskView, setRiskView] = useState<UnifiedRiskView | null>(null);
  const [origin, setOrigin] = useState("");

  async function refresh() {
    const [dash, strategies, bot] = await Promise.all([
      fetch("/api/rextora/trading/dashboard").then((r) => r.json()),
      fetch("/api/rextora/strategies").then((r) => r.json()),
      fetch("/api/rextora/bot/status").then((r) => r.json()),
    ]);
    setStatus(dash.data?.status ?? dash.status ?? null);
    if (dash.meta)
      setOrigin(
        formatDataSourceMeta(
          dash.meta.source,
          dash.meta.cached,
          dash.meta.durationMs,
        ),
      );
    setRiskView(bot.data?.riskView ?? null);
    const active = (strategies.data ?? []).find(
      (s: { paperActive?: boolean }) => s.paperActive,
    );
    if (active)
      setStrategy({ name: active.name, paramsHash: active.paramsHash });
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    const t = setInterval(() => void refresh(), 8000);
    return () => {
      clearTimeout(timer);
      clearInterval(t);
    };
  }, []);

  async function run(path: string, mode = "PAPER") {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const json = await res.json();
    setMessage(
      json.message ?? json.data?.message ?? (json.ok ? "완료" : "실패"),
    );
    await refresh();
  }

  const s = status as {
    modeLabel?: string;
    botStatusLabel?: string;
    todayStats?: {
      realizedPnlPct: number;
      trades: number;
      realizedPnlUsdt?: number;
      unrealizedPnlUsdt?: number;
      feeUsdt?: number;
      fundingUsdt?: number;
      slippageUsdt?: number;
      accountEquity?: number;
      accountReturnPct?: number;
    };
    metrics?: Metrics;
    operations?: { watchedSymbolCount: number; openPositionCount: number };
    positions?: Array<Record<string, unknown>>;
    recentTrades?: Array<Record<string, unknown>>;
    activeStrategy?: { name: string; paramsHash: string };
  } | null;

  const m = s?.metrics;
  const ts = s?.todayStats;

  return (
    <div className="space-y-4" data-testid="paper-trading-page">
      <div>
        <h1 className="text-2xl font-bold text-white">모의 매매</h1>
        <p className="mt-1 text-sm text-slate-400">
          실제 주문 없음. SAFE 수학 시그널로만 모의 진입합니다.
        </p>
      </div>

      <Card title="활성 모의 전략">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric
            label="전략"
            value={
              strategy?.name ?? s?.activeStrategy?.name ?? "SAFE_v44_i4060"
            }
          />
          <Metric
            label={displayParamsHashLabel()}
            value={strategy?.paramsHash ?? s?.activeStrategy?.paramsHash ?? "-"}
          />
          <Metric
            label="감시 코인"
            value={String(s?.operations?.watchedSymbolCount ?? 0)}
          />
          <Metric
            label="오늘 실현 손익"
            value={`${m?.todayRealizedPnlUsdt ?? ts?.realizedPnlUsdt ?? 0} USDT (${ts?.realizedPnlPct ?? 0}%)`}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Metric
            label="오늘 미실현"
            value={`${m?.todayUnrealizedPnlUsdt ?? ts?.unrealizedPnlUsdt ?? 0} USDT`}
          />
          <Metric
            label="순수익(계정)"
            value={`${m?.accountReturnPct ?? ts?.accountReturnPct ?? 0}%`}
          />
          <Metric
            label="현재 자본"
            value={`${m?.accountEquity ?? ts?.accountEquity ?? "-"} USDT`}
          />
          <Metric
            label="오늘 거래"
            value={String(ts?.trades ?? m?.todayTradeCount ?? 0)}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Metric
            label="수수료"
            value={`${m?.todayFeeUsdt ?? ts?.feeUsdt ?? 0} USDT`}
          />
          <Metric
            label="펀딩"
            value={`${m?.todayFundingUsdt ?? ts?.fundingUsdt ?? 0} USDT`}
          />
          <Metric
            label="슬리피지"
            value={`${m?.todaySlippageUsdt ?? ts?.slippageUsdt ?? 0} USDT`}
          />
        </div>
      </Card>
      {origin && (
        <p className="text-xs text-slate-500">{origin} · 모의 거래 데이터</p>
      )}

      <Card title="제어">
        <div className="flex flex-wrap gap-2">
          <Button
            tone="success"
            data-testid="paper-start"
            onClick={() => void run("/api/bot/start", "PAPER")}
          >
            모의 매매 시작
          </Button>
          <Button
            tone="warning"
            data-testid="paper-stop"
            onClick={() => void run("/api/bot/stop", "PAPER")}
          >
            모의 매매 중지
          </Button>
        </div>
        {message && <p className="mt-3 text-sm text-slate-300">{message}</p>}
        <p className="mt-2 text-xs text-slate-500">
          상태: {s?.botStatusLabel ?? "-"} · 모드: {s?.modeLabel ?? "모의 거래"}
        </p>
      </Card>

      <TradingChartsPanel
        mode="PAPER"
        metrics={(s?.metrics as Metrics) ?? null}
        riskView={riskView}
        symbol={
          typeof s?.positions?.[0]?.symbol === "string"
            ? String(s.positions[0].symbol)
            : undefined
        }
      />

      <Card title="현재 모의 포지션">
        {(s?.positions?.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th>코인</th>
                  <th>방향</th>
                  <th>진입가</th>
                  <th>현재가</th>
                  <th>손절가</th>
                  <th>익절가</th>
                  <th>수익률</th>
                  <th>보유 시간</th>
                  <th>레버리지</th>
                  <th>증거금</th>
                  <th>청산가</th>
                  <th>위험 비율</th>
                  <th>현재 신호</th>
                  <th>진입 사유</th>
                </tr>
              </thead>
              <tbody>
                {s?.positions?.map((p) => (
                  <tr
                    key={String(p.symbol)}
                    className="border-t border-slate-900"
                  >
                    <td className="py-2">{String(p.symbol)}</td>
                    <td>{String(p.side)}</td>
                    <td>{String(p.entryPrice)}</td>
                    <td>{String(p.currentPrice)}</td>
                    <td>{String(p.stopLoss)}</td>
                    <td>{String(p.takeProfit)}</td>
                    <td>{String(p.pnlPct)}%</td>
                    <td>{String(p.holdTimeLabel)}</td>
                    <td>
                      {p.leverage != null ? `${String(p.leverage)}배` : "-"}
                    </td>
                    <td>
                      {p.margin != null
                        ? `${Number(p.margin).toFixed(2)} USDT`
                        : "-"}
                    </td>
                    <td>
                      {p.liquidationPrice != null
                        ? String(p.liquidationPrice)
                        : "제공되지 않음"}
                    </td>
                    <td>
                      {p.riskPct != null
                        ? `${String(p.riskPct)}%`
                        : "계산 정보 없음"}
                    </td>
                    <td>{String(p.currentSignal ?? "-")}</td>
                    <td className="max-w-[280px] whitespace-normal">
                      {String(p.entryReason ?? "-")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="열린 모의 포지션이 없습니다. 모의 매매를 시작하면 진입 조건을 통과한 포지션이 여기에 표시됩니다." />
        )}
      </Card>

      <Card title="최근 모의 거래">
        {(s?.recentTrades?.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th>시간</th>
                  <th>코인</th>
                  <th>방향</th>
                  <th>결과</th>
                  <th>순손익</th>
                  <th>청산 이유</th>
                </tr>
              </thead>
              <tbody>
                {s?.recentTrades?.slice(0, 20).map((t, i) => (
                  <tr key={i} className="border-t border-slate-900">
                    <td className="py-2">{String(t.time)}</td>
                    <td>{String(t.symbol)}</td>
                    <td>{String(t.direction)}</td>
                    <td>
                      <Badge>{String(t.resultLabel)}</Badge>
                    </td>
                    <td>
                      {t.netPnl != null ? `${t.netPnl} USDT` : ""}{" "}
                      {t.pnlPct != null ? `(${t.pnlPct}%)` : ""}
                    </td>
                    <td>{String(t.exitReasonLabel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="완료된 모의 거래가 없습니다. 모의 포지션이 청산되면 거래 결과가 표시됩니다." />
        )}
      </Card>
    </div>
  );
}
