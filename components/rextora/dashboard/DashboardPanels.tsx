"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AiCandidateTopTable } from "@/components/rextora/AiCandidateTopTable";
import { CurrentPositionsCard } from "@/components/rextora/CurrentPositionsCard";
import { MarketWatcherSummaryCard } from "@/components/rextora/MarketWatcherSummary";
import { QuickControls } from "@/components/rextora/QuickControls";
import { BotStatusCard, TodayPnlRiskCard } from "@/components/rextora/StatusCards";
import { PanelErrorBoundary, PanelSkeleton } from "@/components/rextora/PanelShell";
import { LoadingState } from "@/components/rextora/LoadingState";
import { formatDataSourceMeta } from "@/src/lib/rextora/displayLabels";
import type { AiCandidate, ApiStatus, BotStatus, MarketWatcherSummary, Position, TodayPnlSummary } from "@/lib/types";

const POLL_MS = 8_000;

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

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const response = await fetch("/api/rextora/bot/status", { cache: "no-store" });
        if (!response.ok || !active) return;
        const body = (await response.json()) as ApiEnvelope<BotStatusPayload>;
        if (body.ok) {
          setData(body.data);
          setMeta(body.meta);
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
        <div data-section="ai-candidates-top5">
          <PanelErrorBoundary title="AI 후보">
            {loading || !data ? <PanelSkeleton lines={6} /> : <AiCandidateTopTable candidates={data.topCandidates} compact className="!p-3" />}
          </PanelErrorBoundary>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <div data-section="current-positions">
            <PanelErrorBoundary title="현재 포지션">
              {loading || !data ? <PanelSkeleton lines={3} /> : <CurrentPositionsCard positions={data.positions} className="!p-3" />}
            </PanelErrorBoundary>
          </div>
          <div data-section="market-watcher-summary">
            <PanelErrorBoundary title="멀티코인 감시">
              {loading || !data ? <PanelSkeleton lines={4} /> : <MarketWatcherSummaryCard summary={data.marketSummary} className="!p-3" />}
            </PanelErrorBoundary>
          </div>
        </div>
        {meta && (
          <p className="rextora-helper text-slate-500" data-testid="dashboard-meta">
            {formatDataSourceMeta(meta.source, meta.cached, meta.durationMs)}
          </p>
        )}
      </div>
      <div data-section="quick-emergency-controls" className="xl:sticky xl:top-2 xl:self-start">
        <QuickControls className="!p-3" />
      </div>
    </div>
  );
}

export const DashboardPanelsLazy = dynamic(() => Promise.resolve({ default: DashboardPanels }), {
  loading: () => <LoadingState lines={8} className="min-h-[320px]" />
});
