"use client";

import { useEffect, useMemo, useState } from "react";
import { MarketWatchTable } from "@/components/rextora/MarketWatcherSummary";
import { PageHeader } from "@/components/rextora/StatusCards";
import { EmptyState } from "@/components/rextora/EmptyState";
import { ErrorState } from "@/components/rextora/ErrorState";
import { LoadingState } from "@/components/rextora/LoadingState";
import { PanelErrorBoundary, StaleDataBadge } from "@/components/rextora/PanelShell";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { displayLabel } from "@/src/lib/rextora/displayLabels";
import { filterMarketCoins, sortMarketCoins } from "@/src/lib/rextora/marketWatcherUtils";
import type { MarketCoin } from "@/lib/types";

const filters = ["전체", "급등", "급락", "거래량 급증", "돌파", "롱 후보", "숏 후보"] as const;
const sorts = ["AI 점수순", "거래량순", "변동성순", "비용 낮은 순"] as const;
const POLL_MS = 12_000;

const sourceTone = (source: string) => (source === "real" ? "success" : source === "stale" ? "warning" : "muted");
const sourceLabel = (source: string) => displayLabel(source === "real" ? "real" : source === "stale" ? "stale" : "mock");

type MarketApiData = { coins?: MarketCoin[]; source?: string };
type ApiEnvelope<T> = { ok: boolean; data: T; meta: { cached: boolean; durationMs: number; source: string } };

export default function MarketWatchPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("전체");
  const [sortBy, setSortBy] = useState<(typeof sorts)[number]>("AI 점수순");
  const [coins, setCoins] = useState<MarketCoin[]>([]);
  const [source, setSource] = useState<string>("mock");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [meta, setMeta] = useState<ApiEnvelope<MarketApiData>["meta"] | null>(null);

  useEffect(() => {
    let active = true;
    const run = async (force = false) => {
      if (force) setRefreshing(true);
      try {
        const response = await fetch(`/api/rextora/market${force ? "?force=true" : ""}`, { cache: "no-store" });
        if (!response.ok || !active) {
          if (active) setError(true);
          return;
        }
        const body = (await response.json()) as ApiEnvelope<MarketApiData>;
        if (body.ok && body.data) {
          if (body.data.coins) setCoins(body.data.coins);
          if (body.data.source) setSource(body.data.source);
          setMeta(body.meta);
          setError(false);
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    const timer = setInterval(() => void run(), POLL_MS);
    void run();

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const displayed = useMemo(() => sortMarketCoins(filterMarketCoins(coins, filter), sortBy), [coins, filter, sortBy]);

  return (
    <>
      <PageHeader
        title="멀티코인 감시"
        description="이 화면은 여러 코인 중 움직임이 큰 코인을 찾는 감시 화면입니다. 진입 가능 여부는 AI 후보 랭킹에서 최종 확인합니다."
      />
      <Card
        title="필터 / 정렬"
        action={
          <div className="flex items-center gap-2">
            <StaleDataBadge cached={meta?.cached} />
            <Badge tone={sourceTone(source)} data-testid="market-source-badge">{sourceLabel(source)}</Badge>
            <Button tone="muted" data-testid="market-refresh" onClick={() => void (async () => {
              setRefreshing(true);
              try {
                const response = await fetch("/api/rextora/market?force=true", { cache: "no-store" });
                if (!response.ok) return;
                const body = (await response.json()) as ApiEnvelope<MarketApiData>;
                if (body.ok && body.data) {
                  if (body.data.coins) setCoins(body.data.coins);
                  if (body.data.source) setSource(body.data.source);
                  setMeta(body.meta);
                }
              } finally {
                setRefreshing(false);
              }
            })()} disabled={refreshing}>
              {refreshing ? "갱신 중…" : "새로고침"}
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rextora-btn-text rounded-lg border px-3 py-1 ${filter === f ? "border-violet-500 bg-violet-500/20" : "border-slate-700"}`}>{f}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {sorts.map((s) => (
            <button key={s} onClick={() => setSortBy(s)} className={`rextora-btn-text rounded-lg border px-3 py-1 ${sortBy === s ? "border-green-500/40 bg-green-500/10" : "border-slate-700"}`}>{s}</button>
          ))}
        </div>
        <div className="mt-3"><Badge tone="purple">{displayed.length}코인 표시</Badge></div>
      </Card>
      <Card title="감시 테이블" className="mt-3">
        <PanelErrorBoundary title="감시 테이블">
          {loading ? (
            <LoadingState lines={8} />
          ) : error ? (
            <ErrorState />
          ) : displayed.length === 0 ? (
            <EmptyState hint="필터를 변경하거나 새로고침을 눌러 보세요." />
          ) : (
            <MarketWatchTable coins={displayed} />
          )}
        </PanelErrorBoundary>
        <p className="rextora-helper mt-3">이 화면은 여러 코인의 움직임을 감시하는 화면입니다. 실제 진입 여부는 AI 후보 랭킹과 비용/리스크 통과 여부로 판단합니다.</p>
      </Card>
    </>
  );
}
