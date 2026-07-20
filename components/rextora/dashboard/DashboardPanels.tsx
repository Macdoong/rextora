"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CurrentPositionsCard } from "@/components/rextora/CurrentPositionsCard";
import { MarketWatcherSummaryCard } from "@/components/rextora/MarketWatcherSummary";
import { QuickControls } from "@/components/rextora/QuickControls";
import { BotStatusCard, TodayPnlRiskCard } from "@/components/rextora/StatusCards";
import { PanelErrorBoundary, PanelSkeleton } from "@/components/rextora/PanelShell";
import { Card, Metric } from "@/components/ui/primitives";
import { formatDataSourceMeta } from "@/src/lib/rextora/displayLabels";
import type { AiCandidate, ApiStatus, BotStatus, MarketWatcherSummary, Position, TodayPnlSummary } from "@/lib/types";

const POLL_MS = 10_000;

type BotStatusPayload = {
  bot: BotStatus;
  runtime: { lastHeartbeat: string; scanInProgress?: boolean; marketSnapshotAgeMs?: number };
  todayPnl: TodayPnlSummary;
  topCandidates: AiCandidate[];
  positions: Position[];
  marketSummary: MarketWatcherSummary;
  api: ApiStatus;
};

type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
  meta: { cached: boolean; durationMs: number; updatedAt: string | null; source: string };
};

export function DashboardPanels() {
  const [data, setData] = useState<BotStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<ApiEnvelope<BotStatusPayload>["meta"] | null>(null);
  const [strategy, setStrategy] = useState<{ name: string; paramsHash: string; lastReturn?: number } | null>(null);
  const [recentTrades, setRecentTrades] = useState<Array<{ time: string; symbol: string; resultLabel: string; pnlPct: number | null }>>([]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const [botRes, stratRes, dashRes] = await Promise.all([
          fetch("/api/rextora/bot/status", { cache: "no-store" }),
          fetch("/api/rextora/strategies", { cache: "no-store" }),
          fetch("/api/rextora/trading/dashboard", { cache: "no-store" })
        ]);
        if (!active) return;
        if (botRes.ok) {
          const body = (await botRes.json()) as ApiEnvelope<BotStatusPayload>;
          if (body.ok) {
            setData(body.data);
            setMeta(body.meta);
          }
        }
        if (stratRes.ok) {
          const body = await stratRes.json();
          const list = body.data ?? [];
          const activeStrat = list.find((s: { paperActive?: boolean; liveActive?: boolean }) => s.paperActive || s.liveActive) ?? list[0];
          if (activeStrat) {
            setStrategy({
              name: activeStrat.name,
              paramsHash: activeStrat.paramsHash,
              lastReturn: activeStrat.lastBacktest?.totalReturn
            });
          }
        }
        if (dashRes.ok) {
          const body = await dashRes.json();
          const trades = body.data?.status?.recentTrades ?? body.status?.recentTrades ?? [];
          setRecentTrades(trades.slice(0, 5));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = setInterval(() => void run(), POLL_MS);
    void run();

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1fr_300px]" data-testid="dashboard-sections">
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div data-section="bot-status">
            <PanelErrorBoundary title="봇 상태">
              {loading || !data ? <PanelSkeleton lines={4} /> : <BotStatusCard bot={data.bot} api={data.api} className="!p-3" />}
            </PanelErrorBoundary>
          </div>
          <div data-section="today-pnl-risk">
            <PanelErrorBoundary title="오늘 손익 / 리스크">
              {loading || !data ? <PanelSkeleton lines={4} /> : <TodayPnlRiskCard summary={data.todayPnl} className="!p-3" />}
            </PanelErrorBoundary>
          </div>
        </div>

        <div data-section="active-strategy">
          <Card title="활성 전략" className="!p-3" data-testid="dashboard-active-strategy">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Metric label="전략" value={strategy?.name ?? "SAFE_v44_i4060"} />
              <Metric label="params_hash" value={strategy?.paramsHash ?? "7893ca3f0e30"} />
              <Metric label="최근 백테스트" value={strategy?.lastReturn != null ? `${(strategy.lastReturn * 100).toFixed(1)}%` : "-"} />
              <Metric label="실전 후보" value="보호 전략" />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <div data-section="current-positions">
            <PanelErrorBoundary title="현재 포지션">
              {loading || !data ? <PanelSkeleton lines={3} /> : <CurrentPositionsCard positions={data.positions} className="!p-3" />}
            </PanelErrorBoundary>
          </div>
          <div data-section="recent-trades">
            <Card title="최근 거래 (5건)" className="!p-3" data-testid="dashboard-recent-trades">
              {recentTrades.length === 0 ? (
                <p className="text-sm text-slate-400">완료 거래 없음</p>
              ) : (
                <ul className="space-y-1 text-sm text-slate-300">
                  {recentTrades.map((t, i) => (
                    <li key={`${t.symbol}-${i}`}>
                      {t.time} · {t.symbol} · {t.resultLabel} · {t.pnlPct ?? 0}%
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <div data-section="market-watcher-summary">
          <PanelErrorBoundary title="멀티코인 감시">
            {loading || !data ? <PanelSkeleton lines={4} /> : <MarketWatcherSummaryCard summary={data.marketSummary} className="!p-3" />}
          </PanelErrorBoundary>
        </div>

        {meta && (
          <p className="rextora-helper text-slate-500" data-testid="dashboard-meta">
            {formatDataSourceMeta(meta.source, meta.cached, meta.durationMs)} · 폴링 {POLL_MS / 1000}s
          </p>
        )}
      </div>
      <div data-section="quick-emergency-controls">
        <PanelErrorBoundary title="긴급 제어">
          <QuickControls className="!p-3" />
        </PanelErrorBoundary>
      </div>
    </div>
  );
}

export const DashboardPanelsLazy = dynamic(() => Promise.resolve({ default: DashboardPanels }), {
  ssr: false,
  loading: () => <PanelSkeleton lines={8} />
});
