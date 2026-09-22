"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isTestResearchJob } from "@/src/lib/rextora/strategySearch/testJobFilter";
import { observeSearchTerminalJobs } from "@/src/lib/rextora/strategySearch/searchTerminalNotification";
import { fetchJsonCached } from "@/src/lib/rextora/client/requestCache";
import {
  DASHBOARD_RESEARCH_LIST_LIMIT,
  buildDashboardAttentionItems,
  buildDashboardPrimaryAction,
  selectDashboardResearch,
  shouldFetchDashboardGenerationHint,
  type DashboardPrimaryAction,
  type DashboardResearchSelection,
  type DashboardReviewItem,
} from "./dashboardResearchSelection";

export type ResearchJob = {
  id: string;
  searchName?: string;
  status: string;
  executionActive?: boolean;
  symbols?: string[];
  timeframe?: string;
  uniqueEvaluatedCount?: number;
  qualifiedCount?: number;
  statistics?: { passed?: number | null };
  elapsedMs?: number;
  remainingMs?: number | null;
  maxRuntimeMs?: number | null;
  generationCount?: number;
  currentBestName?: string | null;
  improvementCount?: number;
  pipelineStageLabelKo?: string | null;
  latestWeaknessKo?: string | null;
};

export type DashPosition = {
  symbol?: string;
  side?: string;
  unrealizedPnl?: number;
  pnlPct?: number;
  leverage?: number;
  entryPrice?: number;
  currentPrice?: number;
  protectionLabel?: string;
};

export type DashRecentTrade = {
  realizedUsdt?: number;
  time?: string;
};

export type DashStatus = {
  liveAllowed?: boolean;
  canStartLive?: boolean;
  liveBlockReason?: string | null;
  botStatusLabel?: string;
  modeLabel?: string;
  safetyLabel?: string;
  lastUpdatedAt?: string;
  activeStrategy?: { name: string; paramsHash: string } | null;
  positions?: DashPosition[];
  recentTrades?: DashRecentTrade[];
  todayStats?: {
    realizedPnlUsdt?: number;
    unrealizedPnlUsdt?: number;
    trades?: number;
    winRate?: number;
    accountEquity?: number;
    feeUsdt?: number;
    fundingUsdt?: number;
    slippageUsdt?: number;
  };
  metrics?: {
    todayRealizedPnlUsdt?: number;
    todayUnrealizedPnlUsdt?: number;
    accountEquity?: number;
    winRate?: number;
  };
  operations?: {
    watchedSymbolCount?: number;
    eligibleCandidateCount?: number;
    openPositionCount?: number;
    queueStatusLabel?: string;
  };
  emergencyActive?: boolean;
  risk?: {
    dailyLossLimitPct?: number;
    currentDailyLossPct?: number;
    usagePct?: number;
    accountDrawdownPct?: number;
    accountLossLimitPct?: number;
    consecutiveLosses?: number;
    consecutiveLossLimit?: number;
    dailyTrades?: number;
    maxDailyTrades?: number;
    openPositions?: number;
    maxPositions?: number;
    currentLeverage?: number;
    maxLeverage?: number;
    riskState?: string;
  };
};

export type ReviewItem = DashboardReviewItem;

export type PrimaryAction = DashboardPrimaryAction;

export function formatMs(
  ms: number | null | undefined,
  opts?: { legacyLabel?: string },
): string {
  if (ms == null || !Number.isFinite(ms)) {
    return opts?.legacyLabel ?? "시간 정보 없음";
  }
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

export function formatUsdt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)} USDT`;
}

export function historyStatusLabel(status: string): string {
  if (status === "completed") return "완료";
  if (status === "cancelled") return "취소";
  if (status === "failed") return "실패";
  return status;
}

export function useDashboardData() {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [status, setStatus] = useState<DashStatus | null>(null);
  const [paperName, setPaperName] = useState<string | null>(null);
  const [paperSessionStatus, setPaperSessionStatus] = useState<string | null>(
    null,
  );
  const [generationHint, setGenerationHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [jRes, dRes, sRes, pRes] = await Promise.all([
        fetchJsonCached<{ data?: { jobs?: ResearchJob[] } | ResearchJob[] }>(
          `/api/rextora/strategy-search?limit=${DASHBOARD_RESEARCH_LIST_LIMIT}`,
          { ttlMs: 2_000 },
        ),
        fetchJsonCached<{ data?: { status?: DashStatus }; status?: DashStatus }>(
          "/api/rextora/trading/dashboard",
          { ttlMs: 5_000 },
        ),
        fetchJsonCached<{ data?: Array<{ paperActive?: boolean; name?: string }> }>(
          "/api/rextora/strategies",
          { ttlMs: 2_000 },
        ),
        fetchJsonCached<{
          data?: {
            active?: {
              strategyName?: string;
              strategyId?: string;
              status?: string;
              exchangeCalled?: boolean;
            } | null;
          };
        }>("/api/rextora/paper/session?active=1", { ttlMs: 2_000 }),
      ]);
      const list: ResearchJob[] = Array.isArray(jRes.data)
        ? jRes.data
        : (jRes.data?.jobs ?? []);
      const visible = Array.isArray(list)
        ? list.filter((j) => !isTestResearchJob(j))
        : [];
      setJobs(visible);
      setStatus(dRes.data?.status ?? dRes.status ?? null);
      const session = pRes.data?.active ?? null;
      if (session?.status) {
        setPaperName(session.strategyName ?? session.strategyId ?? null);
        setPaperSessionStatus(session.status);
      } else {
        const active = (sRes.data ?? []).find(
          (s: { paperActive?: boolean; name?: string }) => s.paperActive,
        );
        setPaperName(active?.name ?? null);
        setPaperSessionStatus(null);
      }

      const research = selectDashboardResearch(visible);
      if (shouldFetchDashboardGenerationHint(research) && research.executingResearch?.id) {
        try {
          const g = await fetch(
            `/api/rextora/strategy-search/${encodeURIComponent(research.executingResearch.id)}/generations`,
          ).then((r) => r.json());
          const latest = g.data?.latestWeakness;
          const findings = latest?.findings as
            | Array<{ messageKo?: string }>
            | undefined;
          setGenerationHint(
            findings?.[0]?.messageKo ??
              (g.data?.generationCount
                ? `세대 ${g.data.generationCount}`
                : null),
          );
        } catch {
          setGenerationHint(null);
        }
      } else {
        setGenerationHint(null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "대시보드 로드 실패");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void refresh();
    }, 0);
    const t = setInterval(() => void refresh(), 8000);
    return () => {
      window.clearTimeout(boot);
      clearInterval(t);
    };
  }, [refresh]);

  const researchSelection: DashboardResearchSelection<ResearchJob> = useMemo(
    () => selectDashboardResearch(jobs),
    [jobs],
  );
  const completedRecent = jobs.filter((j) =>
    ["completed", "cancelled", "failed"].includes(j.status),
  )[0];
  const terminalResearch = useMemo(
    () => jobs.filter((j) => j.status === "completed" || j.status === "failed"),
    [jobs],
  );

  useEffect(() => {
    observeSearchTerminalJobs(terminalResearch);
  }, [terminalResearch]);

  const reviewItems = useMemo(() => {
    const items: ReviewItem[] = [
      ...buildDashboardAttentionItems(
        researchSelection.visibleAttentionResearch,
      ),
    ];
    if (completedRecent && completedRecent.status === "completed") {
      items.push({
        what: `완료된 탐색: ${completedRecent.searchName || completedRecent.id}`,
        why: "합격 전략을 검토하고 백테스트·모의 매매로 이어갈지 결정이 필요합니다.",
        href: `/results?jobId=${encodeURIComponent(completedRecent.id)}`,
        actionLabel: "탐색 결과 확인",
      });
    }
    if (!status?.canStartLive && status?.liveBlockReason) {
      items.push({
        what: `실전 차단: ${status.liveBlockReason}`,
        why: "실전 게이트·승인·위험 조건을 충족해야 합니다.",
        href: "/live-trading",
        actionLabel: "실전 게이트 확인",
      });
    }
    if (status?.emergencyActive) {
      items.push({
        what: "긴급 정지 활성",
        why: "수동 재활성화 전까지 신규 실전 진입이 차단됩니다.",
        href: "/settings",
        actionLabel: "설정에서 확인",
      });
    }
    return items;
  }, [completedRecent, researchSelection.visibleAttentionResearch, status]);

  const primaryAction = useMemo(
    () => buildDashboardPrimaryAction(researchSelection, completedRecent),
    [researchSelection, completedRecent],
  );

  return {
    jobs,
    status,
    paperName,
    paperSessionStatus,
    generationHint,
    error,
    initialLoading,
    researchSelection,
    executingResearch: researchSelection.executingResearch,
    pendingResearch: researchSelection.pendingResearch,
    attentionResearch: researchSelection.attentionResearch,
    allAttentionResearch: researchSelection.allAttentionResearch,
    visibleAttentionResearch: researchSelection.visibleAttentionResearch,
    attentionTotal: researchSelection.attentionTotal,
    attentionHiddenCount: researchSelection.attentionHiddenCount,
    activeResearch: researchSelection.currentResearch,
    completedRecent,
    terminalResearch,
    reviewItems,
    primaryAction,
  };
}
