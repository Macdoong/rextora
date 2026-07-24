"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import { isTestResearchJob } from "@/src/lib/rextora/strategySearch/testJobFilter";

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
    return opts?.legacyLabel ?? "레거시 타이밍 없음";
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

export function LifecycleDashboard() {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [status, setStatus] = useState<DashStatus | null>(null);
  const [paperName, setPaperName] = useState<string | null>(null);
  const [generationHint, setGenerationHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [jRes, dRes, sRes] = await Promise.all([
        fetch("/api/rextora/strategy-search").then((r) => r.json()),
        fetch("/api/rextora/trading/dashboard").then((r) => r.json()),
        fetch("/api/rextora/strategies").then((r) => r.json()),
      ]);
      const list: ResearchJob[] = jRes.data?.jobs ?? jRes.data ?? [];
      setJobs(
        Array.isArray(list)
          ? list.filter((j) => !isTestResearchJob(j))
          : [],
      );
      setStatus(dRes.data?.status ?? dRes.status ?? null);
      const active = (sRes.data ?? []).find(
        (s: { paperActive?: boolean; name?: string }) => s.paperActive,
      );
      setPaperName(active?.name ?? null);

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
      why: "합격 후보를 검토하고 백테스트·모의 매매로 이어갈지 결정이 필요합니다.",
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

  return (
    <div className="space-y-5" data-testid="lifecycle-dashboard">
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2" data-testid="dashboard-primary-actions">
        <Link href="/strategy-search">
          <Button data-testid="dash-start-research">새 탐색 시작</Button>
        </Link>
        <Link href="/results">
          <Button variant="outline" data-testid="dash-open-results">
            탐색 결과 확인
          </Button>
        </Link>
        <Link href="/backtest">
          <Button variant="outline" data-testid="dash-open-backtest">
            백테스트 확인
          </Button>
        </Link>
        <Link href="/paper-trading">
          <Button variant="outline" data-testid="dash-open-paper">
            모의매매 확인
          </Button>
        </Link>
        <Link href="/live-trading">
          <Button variant="outline" data-testid="dash-open-live">
            실전매매 확인
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="현재 연구" data-testid="dash-current-research">
          {!activeResearch ? (
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
                    legacyLabel: "레거시 타이밍 없음",
                  })}
                />
                <Metric
                  label={
                    activeResearch.status === "paused"
                      ? "재개 후 남은 시간"
                      : "남은 시간"
                  }
                  value={formatMs(activeResearch.remainingMs ?? null, {
                    legacyLabel: "레거시 타이밍 없음",
                  })}
                />
                <Metric
                  label="평가 후보"
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
          title="대표님 확인 필요 · 검토"
          data-testid="dash-review-required"
        >
          {reviewItems.length === 0 ? (
            <EmptyState message="지금 당장 승인할 항목이 없습니다." />
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

        <Card title="모의 매매 요약" data-testid="dash-paper-summary">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="활성 전략" value={paperName ?? "없음"} />
            <Metric label="봇 상태" value={status?.botStatusLabel ?? "—"} />
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
            모의 실행 엔진은 활성 모의 전략(선택 후보)을 실행합니다. SAFE는
            명시적으로 선택된 경우에만 사용됩니다.
          </p>
        </Card>

        <Card title="실전 매매 요약" data-testid="dash-live-summary">
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
              실전은 게이트·승인·위험 제한을 모두 통과해야 합니다.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
