"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  Metric,
  SectionHeader,
  Skeleton,
  StatusBanner,
} from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import { isTestResearchJob } from "@/src/lib/rextora/strategySearch/testJobFilter";
import { fetchJsonCached } from "@/src/lib/rextora/client/requestCache";

type ResearchJob = {
  id: string;
  searchName?: string;
  status: string;
  symbols?: string[];
  timeframe?: string;
  uniqueEvaluatedCount?: number;
  qualifiedCount?: number;
  elapsedMs?: number;
  remainingMs?: number | null;
  maxRuntimeMs?: number | null;
  generationCount?: number;
  currentBestName?: string | null;
  improvementCount?: number;
  pipelineStageLabelKo?: string | null;
  latestWeaknessKo?: string | null;
};

type DashStatus = {
  liveAllowed?: boolean;
  canStartLive?: boolean;
  liveBlockReason?: string | null;
  botStatusLabel?: string;
  modeLabel?: string;
  activeStrategy?: { name: string; paramsHash: string };
  positions?: unknown[];
  todayStats?: {
    realizedPnlUsdt?: number;
    unrealizedPnlUsdt?: number;
    trades?: number;
  };
  metrics?: {
    todayRealizedPnlUsdt?: number;
    todayUnrealizedPnlUsdt?: number;
    accountEquity?: number;
  };
  emergencyActive?: boolean;
};

function formatMs(
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

function formatUsdt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)} USDT`;
}

function historyStatusLabel(status: string): string {
  if (status === "completed") return "완료";
  if (status === "cancelled") return "취소";
  if (status === "failed") return "실패";
  return status;
}

export function LifecycleDashboard() {
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
          "/api/rextora/strategy-search",
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
      setJobs(
        Array.isArray(list)
          ? list.filter((j) => !isTestResearchJob(j))
          : [],
      );
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

      const activeJob = (Array.isArray(list) ? list : []).find((j) =>
        ["running", "queued", "pause_requested", "paused"].includes(j.status),
      );
      if (activeJob?.id) {
        try {
          const g = await fetch(
            `/api/rextora/strategy-search/${encodeURIComponent(activeJob.id)}/generations`,
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

  const activeResearch = jobs.find((j) =>
    ["running", "queued", "pause_requested", "paused"].includes(j.status),
  );
  const completedRecent = jobs.filter((j) =>
    ["completed", "cancelled", "failed"].includes(j.status),
  )[0];

  type ReviewItem = {
    what: string;
    why: string;
    href: string;
    actionLabel: string;
  };
  const reviewItems: ReviewItem[] = [];
  if (completedRecent && completedRecent.status === "completed") {
    reviewItems.push({
      what: `완료된 탐색: ${completedRecent.searchName || completedRecent.id}`,
      why: "합격 전략을 검토하고 백테스트·모의 매매로 이어갈지 결정이 필요합니다.",
      href: `/results?jobId=${encodeURIComponent(completedRecent.id)}`,
      actionLabel: "탐색 결과 확인",
    });
  }
  if (!status?.canStartLive && status?.liveBlockReason) {
    reviewItems.push({
      what: `실전 차단: ${status.liveBlockReason}`,
      why: "실전 게이트·승인·위험 조건을 충족해야 합니다.",
      href: "/live-trading",
      actionLabel: "실전 게이트 확인",
    });
  }
  if (status?.emergencyActive) {
    reviewItems.push({
      what: "긴급 정지 활성",
      why: "수동 재활성화 전까지 신규 실전 진입이 차단됩니다.",
      href: "/settings",
      actionLabel: "설정에서 확인",
    });
  }

  const primaryAction = activeResearch
    ? {
        href: `/strategy-search?jobId=${encodeURIComponent(activeResearch.id)}`,
        label: "진행 중인 탐색 보기",
      }
    : completedRecent?.status === "completed"
      ? {
          href: `/results?jobId=${encodeURIComponent(completedRecent.id)}`,
          label: "완료된 결과 검토",
        }
      : { href: "/strategy-search", label: "새 탐색 시작" };

  return (
    <div className="space-y-5" data-testid="lifecycle-dashboard">
      <SectionHeader
        title="운영 현황"
        description="현재 연구와 승인이 필요한 항목을 먼저 확인하세요."
        action={
          <Link href={primaryAction.href}>
            <Button data-testid="dash-start-research">{primaryAction.label}</Button>
          </Link>
        }
      />
      <StatusBanner
        status={error ? "error" : initialLoading ? "loading" : "info"}
        message={
          error
            ? "최신 운영 상태를 불러오지 못했습니다. 기존 화면은 유지됩니다."
            : initialLoading
              ? "운영 상태를 확인하고 있습니다."
              : status?.liveAllowed
                ? "실전 거래 권한이 설정되어 있습니다. 주문은 별도 승인 전까지 실행되지 않습니다."
                : "모의 거래 모드이며 실전 주문은 승인 게이트에서 차단됩니다."
        }
        data-testid="dashboard-operational-status"
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card title="현재 연구" data-testid="dash-current-research">
          {initialLoading ? (
            <div className="grid gap-3 sm:grid-cols-3" aria-label="현재 연구 불러오는 중">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : !activeResearch ? (
            <EmptyState
              message="진행 중인 탐색이 없습니다."
              hint="새 탐색을 시작하세요."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">{activeResearch.status}</Badge>
                <Badge>{activeResearch.searchName || activeResearch.id}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Metric
                  label="시장"
                  value={(activeResearch.symbols ?? []).join(", ") || "—"}
                />
                <Metric label="시간봉" value={activeResearch.timeframe ?? "—"} />
                <Metric
                  label={
                    activeResearch.status === "paused"
                      ? "활성 경과"
                      : "경과"
                  }
                  value={formatMs(activeResearch.elapsedMs, {
                    legacyLabel: "시간 정보 없음",
                  })}
                />
                <Metric
                  label={
                    activeResearch.status === "paused"
                      ? "재개 후 남은 시간"
                      : "남은 시간"
                  }
                  value={formatMs(activeResearch.remainingMs ?? null, {
                    legacyLabel: "시간 정보 없음",
                  })}
                />
                <Metric
                  label="평가한 전략"
                  value={activeResearch.uniqueEvaluatedCount ?? 0}
                />
                <Metric
                  label="합격"
                  value={activeResearch.qualifiedCount ?? 0}
                />
              </div>
              {generationHint ? (
                <p className="text-xs text-amber-200">약점/세대: {generationHint}</p>
              ) : null}
              <Link
                href={`/strategy-search?jobId=${encodeURIComponent(activeResearch.id)}`}
              >
                <Button size="sm">탐색 상세 보기</Button>
              </Link>
            </div>
          )}
        </Card>

        <Card
          title="확인이 필요한 항목"
          className={reviewItems.length ? "border-amber-500/30" : ""}
          data-testid="dash-review-required"
        >
          {initialLoading ? (
            <div className="space-y-3" aria-label="확인 항목 불러오는 중">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : reviewItems.length === 0 ? (
            <EmptyState
              message="지금 확인할 항목이 없습니다."
              hint="탐색이 끝나면 여기에 다음 단계가 표시됩니다."
            />
          ) : (
            <ul className="space-y-3 text-sm text-slate-200">
              {reviewItems.map((item) => (
                <li
                  key={item.what}
                  className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2"
                >
                  <p className="font-medium text-amber-50">{item.what}</p>
                  <p className="mt-1 text-xs text-slate-300">{item.why}</p>
                  <Link
                    href={item.href}
                    className="mt-2 inline-flex text-xs font-semibold text-sky-300 hover:text-sky-200"
                  >
                    권장 다음 단계: {item.actionLabel} →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

      </div>

      <SectionHeader
        title="현재 단계 요약"
        description="연구·모의·실전 단계를 서로 섞지 않고 확인합니다."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="연구" data-testid="dash-research-summary">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="상태" value={activeResearch ? "진행 중" : "대기"} />
            <Metric label="최근 완료" value={completedRecent ? historyStatusLabel(completedRecent.status) : "없음"} />
          </div>
          <Link
            href={activeResearch ? `/strategy-search?jobId=${encodeURIComponent(activeResearch.id)}` : "/strategy-search"}
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-sky-300 hover:text-sky-200"
          >
            연구 화면 열기 →
          </Link>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/results"
              className="inline-flex min-h-11 items-center text-sm text-slate-300 hover:text-white"
              data-testid="dash-open-results"
            >
              탐색 결과
            </Link>
            <Link
              href="/backtest"
              className="inline-flex min-h-11 items-center text-sm text-slate-300 hover:text-white"
              data-testid="dash-open-backtest"
            >
              백테스트
            </Link>
          </div>
        </Card>

        <Card title="모의 매매" data-testid="dash-paper-summary">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="세션 전략" value={paperName ?? "없음"} />
            <Metric
              label="세션 상태"
              value={paperSessionStatus ?? status?.botStatusLabel ?? "없음"}
            />
            <Metric
              label="실현 손익"
              value={formatUsdt(
                status?.todayStats?.realizedPnlUsdt ??
                  status?.metrics?.todayRealizedPnlUsdt,
              )}
            />
            <Metric
              label="미실현 손익"
              value={formatUsdt(
                status?.todayStats?.unrealizedPnlUsdt ??
                  status?.metrics?.todayUnrealizedPnlUsdt,
              )}
            />
          </div>
          <p className="mt-2 text-xs rx-text-muted">
            모의 매매는 실제 주문 없이 세션 기록만 따릅니다. 시뮬레이션 전용이며
            거래소 주문은 전송되지 않습니다.
          </p>
          <Link
            href="/paper-trading"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-sky-300 hover:text-sky-200"
            data-testid="dash-open-paper"
          >
            모의 매매 확인 →
          </Link>
        </Card>

        <Card title="실전 매매" data-testid="dash-live-summary">
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="실전 허용"
              value={status?.liveAllowed ? "허용" : "비활성"}
              tone={status?.liveAllowed ? "danger" : "success"}
            />
            <Metric
              label="시작 가능"
              value={status?.canStartLive ? "예" : "아니오"}
            />
            <Metric
              label="포지션"
              value={Array.isArray(status?.positions) ? status!.positions!.length : 0}
            />
            <Metric
              label="긴급 정지"
              value={status?.emergencyActive ? "활성" : "정상"}
              tone={status?.emergencyActive ? "danger" : "default"}
            />
          </div>
          {status?.liveBlockReason ? (
            <p className="mt-2 text-xs text-amber-200">{status.liveBlockReason}</p>
          ) : (
            <p className="mt-2 text-xs rx-text-muted">
              아직 실전 주문이 전송되지 않습니다. 승인·안전 조건을 모두 통과한
              뒤에만 시작할 수 있습니다.
            </p>
          )}
          <Link
            href="/live-trading"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-sky-300 hover:text-sky-200"
            data-testid="dash-open-live"
          >
            승인 게이트 확인 →
          </Link>
        </Card>
      </div>
    </div>
  );
}
