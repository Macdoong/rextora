"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import { CurrentResearchResultsPanel } from "@/components/rextora/results/CurrentResearchResultsPanel";
import { historyStatusLabelKo } from "@/components/rextora/strategySearch/formatters";
import type { StrategySearchJobStatus } from "@/components/rextora/strategySearch/types";
import { SAFE_STRATEGY_ID } from "@/src/lib/rextora/strategy/strategyTypes";
import {
  recommendStrategyAction,
  type StrategyRecommendation,
} from "@/src/lib/rextora/results/recommendation";
import {
  evaluateHighlightEligibility,
  metricStatusKo,
} from "@/src/lib/rextora/results/eligibility";
import { evaluateLiveCandidateRegistration } from "@/src/lib/rextora/results/liveCandidateEligibility";
import { isTestStrategyRecord } from "@/src/lib/rextora/strategy/strategyTestFilter";
import {
  classificationLabelKo,
  filterBulkArchiveCandidates,
  filterBulkDeleteCandidates,
  selectFailedJobIds,
  selectOldJobIds,
  selectUserStoppedJobIds,
} from "@/components/rextora/results/researchHistoryBulk";
import {
  countLibraryCategories,
  filterLibraryStrategies,
  libraryCategoryOf,
  parseLibraryProvenance,
  LIBRARY_FILTER_BUTTONS,
  type LibraryCategory,
} from "@/components/rextora/results/libraryFilterUtils";

function parseSourceResearchJobId(
  description: string | null | undefined,
): string | null {
  return parseLibraryProvenance(description).sourceResearchJobId;
}

type StrategyRow = {
  id: string;
  name: string;
  paramsHash: string;
  paperActive?: boolean;
  liveActive?: boolean;
  liveEligible?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastBacktest?: {
    totalReturn?: number;
    mdd?: number;
    tradeCount?: number;
    /** Legacy / store field used by strategyStore updates */
    trades?: number;
    winRate?: number;
    profitFactor?: number;
    passed?: boolean;
  } | null;
  sourceStatus?: string;
  description?: string;
};

type JobSummary = {
  id: string;
  searchName?: string;
  status: StrategySearchJobStatus;
  completionReason?: string | null;
  qualifiedCount?: number | null;
  uniqueEvaluatedCount?: number | null;
  registeredCount?: number | null;
  elapsedMs?: number | null;
  symbols?: string[];
  timeframe?: string | null;
  currentSearchFamily?: string | null;
  bestScore?: number | null;
  bestReturn?: number | null;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  isArchived?: boolean;
};

type DeletionImpactPreview = {
  classification: "deletable" | "archive_only" | "protected";
  reasonsKo: string[];
  researchJobCount: number;
  trialCount: number;
  top10Count: number;
  registeredStrategyRefs: string[];
  backtestRefs: string[];
  paperRefs: string[];
  liveRefs: string[];
  bytesToRemove: number;
  protectedItems: string[];
};

type StorageSummaryView = {
  totalJobs: number;
  activeJobs: number;
  archivedJobs: number;
  totalTrialFiles: number;
  top10Files: number;
  totalBytes: number;
  rawTrialRetentionPolicy: string;
};

type RawTrialPreview = {
  jobId: string;
  policy: string;
  retainedTrialCount: number;
  protectedTrialCount: number;
  deletableTrialCount: number;
  storageBytes: number;
  deleted?: number;
};

type Category = Exclude<
  LibraryCategory,
  "all" | "current" | "newest" | "recommended"
>;

const RESULTS_NAV_ITEMS = [
  { id: "results-section-outcome", label: "탐색 결과" },
  { id: "results-section-summary", label: "요약" },
  { id: "results-section-top3", label: "TOP 3" },
  { id: "results-section-top10", label: "TOP 10" },
  { id: "results-section-backtest-rec", label: "백테스트" },
  { id: "results-section-rank-history", label: "순위 변동" },
  { id: "results-section-library", label: "라이브러리" },
  { id: "results-section-history", label: "연구 이력" },
  { id: "results-section-raw-mgmt", label: "원본 후보 관리" },
  { id: "results-raw-candidates", label: "원본 trial" },
  { id: "results-section-safe", label: "SAFE" },
] as const;

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

function categoryOf(s: StrategyRow): Category {
  return libraryCategoryOf(s);
}

function tradeCountOf(s: StrategyRow): number | null {
  const bt = s.lastBacktest;
  if (!bt) return null;
  const n = bt.tradeCount ?? bt.trades;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function strengthWeakness(s: StrategyRow): { strength: string; weakness: string } {
  const bt = s.lastBacktest;
  if (!bt) {
    return { strength: "백테스트 대기", weakness: "성과 데이터 없음" };
  }
  const trades = tradeCountOf(s) ?? 0;
  const strength =
    (bt.totalReturn ?? 0) > 0
      ? `순수익 ${formatPct(bt.totalReturn)}`
      : `거래 ${trades}건`;
  const weakness =
    Math.abs(bt.mdd ?? 0) > 0.2
      ? `낙폭 ${formatPct(bt.mdd)}`
      : trades < 10
        ? "거래 수 부족"
        : "추가 검증 권장";
  return { strength, weakness };
}

export function ResultsWorkbench() {
  const searchParams = useSearchParams();
  const jobIdFromUrl = searchParams.get("jobId");
  const [selectedJobIdOverride, setSelectedJobIdOverride] = useState<
    string | null | undefined
  >(undefined);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [category, setCategory] = useState<LibraryCategory>("newest");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [storageSummary, setStorageSummary] = useState<StorageSummaryView | null>(
    null,
  );
  const [historyImpact, setHistoryImpact] = useState<
    Record<string, DeletionImpactPreview | null>
  >({});
  const [historyBusyJobId, setHistoryBusyJobId] = useState<string | null>(null);
  const [historyView, setHistoryView] = useState<"default" | "archived">(
    "default",
  );
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState<
    "newest" | "evaluated" | "qualified" | "name"
  >("newest");
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const impactsFetchedRef = useRef(new Set<string>());
  const [rawPreview, setRawPreview] = useState<RawTrialPreview | null>(null);
  const [rawBusy, setRawBusy] = useState(false);

  const selectedJobId =
    selectedJobIdOverride !== undefined
      ? selectedJobIdOverride
      : jobIdFromUrl ?? jobs[0]?.id ?? null;

  const refresh = useCallback(async (viewOverride?: "default" | "archived") => {
    const view = viewOverride ?? historyView;
    try {
      const historyQuery =
        view === "archived"
          ? "?limit=100&archivedOnly=true"
          : "?limit=100";
      const [sRes, jRes, storageRes] = await Promise.all([
        fetch("/api/rextora/strategies").then((r) => r.json()),
        fetch(`/api/rextora/strategy-search${historyQuery}`).then((r) =>
          r.json(),
        ),
        fetch("/api/rextora/strategy-search/storage-summary").then((r) =>
          r.json(),
        ),
      ]);
      const raw = Array.isArray(sRes.data) ? sRes.data : [];
      setStrategies(
        raw.filter(
          (s: StrategyRow & { testData?: boolean; metadata?: { testData?: boolean } }) =>
            !isTestStrategyRecord(s as never),
        ),
      );
      const list = jRes.data?.jobs ?? jRes.data ?? [];
      const jobList: JobSummary[] = Array.isArray(list) ? list : [];
      setJobs(jobList);
      if (storageRes.ok && storageRes.data) {
        setStorageSummary(storageRes.data as StorageSummaryView);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "결과 로드 실패");
    } finally {
      setLoading(false);
      setLoadingTimedOut(false);
    }
  }, [historyView]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void refresh();
    }, 0);
    const t = setInterval(() => void refresh(), 12_000);
    return () => {
      window.clearTimeout(boot);
      clearInterval(t);
    };
  }, [refresh]);

  useEffect(() => {
    if (!loading) return;
    const failsafe = window.setTimeout(() => {
      setLoading(false);
      setLoadingTimedOut(true);
      setError((prev) => prev ?? "결과 로드가 지연되어 중단했습니다. 새로고침하세요.");
    }, 20_000);
    return () => window.clearTimeout(failsafe);
  }, [loading]);

  useEffect(() => {
    if (jobs.length === 0) return;
    const pending = jobs
      .map((j) => j.id)
      .filter((id) => !impactsFetchedRef.current.has(id));
    if (pending.length === 0) return;
    for (const id of pending) impactsFetchedRef.current.add(id);
    void (async () => {
      const results = await Promise.all(
        pending.map(async (jobId) => {
          try {
            const res = await fetch(
              `/api/rextora/strategy-search/${encodeURIComponent(jobId)}/deletion-impact`,
            );
            const json = await res.json();
            return {
              jobId,
              impact: json.ok ? (json.data as DeletionImpactPreview) : null,
            };
          } catch {
            return { jobId, impact: null };
          }
        }),
      );
      setHistoryImpact((prev) => {
        const next = { ...prev };
        for (const { jobId, impact } of results) {
          next[jobId] = impact;
        }
        return next;
      });
    })();
  }, [jobs]);

  function switchHistoryView(view: "default" | "archived") {
    if (view === historyView) return;
    impactsFetchedRef.current.clear();
    setHistoryImpact({});
    setSelectedHistoryIds(new Set());
    setHistoryView(view);
    void refresh(view);
  }

  const ranked = useMemo(() => {
    const withBt = strategies.filter(
      (s) => s.id !== SAFE_STRATEGY_ID && s.lastBacktest,
    );
    const baseEligible = withBt.filter((s) => {
      const bt = s.lastBacktest!;
      return evaluateHighlightEligibility({
        hasBacktest: true,
        totalReturn: bt.totalReturn,
        mdd: bt.mdd,
        tradeCount: tradeCountOf(s),
        passed: bt.passed ?? true,
        strategyId: s.id,
        strategyHash: s.paramsHash,
        hasCostEvidence:
          (s as StrategyRow & { lastBacktest?: { totalCost?: number | null } })
            .lastBacktest?.totalCost != null ||
          (s as StrategyRow & {
            robustness?: { stressPassed?: boolean; stressEnabled?: boolean };
          }).robustness?.stressEnabled === true ||
          (s as StrategyRow & {
            robustness?: { stressPassed?: boolean };
          }).robustness?.stressPassed != null,
      }).eligible;
    });
    // Final recommendation requires robustness/overfitting evidence.
    // Empty overfittingInput → unavailable → not recommended (no fabrication).
    const recommendEligible = withBt.filter((s) => {
      const bt = s.lastBacktest!;
      const meta = s as StrategyRow & {
        robustness?: {
          jitterPassed?: boolean;
          stressPassed?: boolean;
          jitterEnabled?: boolean;
          stressEnabled?: boolean;
        };
        lastBacktest?: { totalCost?: number | null };
      };
      const rob = meta.robustness;
      const hasCostEvidence =
        meta.lastBacktest?.totalCost != null ||
        rob?.stressEnabled === true ||
        rob?.stressPassed != null;
      return evaluateHighlightEligibility({
        hasBacktest: true,
        totalReturn: bt.totalReturn,
        mdd: bt.mdd,
        tradeCount: tradeCountOf(s),
        passed: bt.passed ?? true,
        strategyId: s.id,
        strategyHash: s.paramsHash,
        hasCostEvidence,
        overfittingInput: rob
          ? {
              jitterEnabled: rob.jitterEnabled ?? true,
              jitterPassed: rob.jitterPassed ?? null,
              stressEnabled: rob.stressEnabled ?? true,
              stressPassed: rob.stressPassed ?? null,
              tradeCount: tradeCountOf(s),
              minTradeCount: 5,
            }
          : {},
      }).eligible;
    });
    const byReturn = [...withBt].sort(
      (a, b) =>
        (b.lastBacktest?.totalReturn ?? -Infinity) -
        (a.lastBacktest?.totalReturn ?? -Infinity),
    );
    const byStability = [...baseEligible].sort((a, b) => {
      const ma = Math.abs(a.lastBacktest?.mdd ?? 1);
      const mb = Math.abs(b.lastBacktest?.mdd ?? 1);
      if (ma !== mb) return ma - mb;
      return (b.lastBacktest?.profitFactor ?? 0) - (a.lastBacktest?.profitFactor ?? 0);
    });
    const recommended = [...recommendEligible].sort((a, b) => {
      const score = (s: StrategyRow) => {
        const r = s.lastBacktest?.totalReturn ?? 0;
        const mdd = Math.abs(s.lastBacktest?.mdd ?? 1);
        const pf = s.lastBacktest?.profitFactor ?? 0;
        return r * 2 - mdd + pf * 0.1 + 1;
      };
      return score(b) - score(a);
    });
    const topProfit = byReturn[0] ?? null;
    const topStable = byStability[0] ?? null;
    const topRecommend = recommended[0] ?? null;
    const roleIds = [topProfit?.id, topStable?.id, topRecommend?.id].filter(
      Boolean,
    ) as string[];
    const duplicateId =
      roleIds.length >= 2 && new Set(roleIds).size < roleIds.length
        ? roleIds.find((id, i) => roleIds.indexOf(id) !== i) ?? null
        : null;
    return {
      topProfit,
      topStable,
      topRecommend,
      eligibleCount: recommendEligible.length,
      stabilityBlockReason:
        !loading && recommendEligible.length === 0
          ? "추천 가능한 안정 전략 없음 — 거래 안정성·과거 데이터 편중 증거가 있는 합격 전략이 없습니다."
          : null,
      duplicateId,
    };
  }, [strategies, loading]);

  const libraryStrategies = useMemo(() => {
    return strategies.filter(
      (s) => s.id !== SAFE_STRATEGY_ID || category === "safe",
    );
  }, [strategies, category]);

  const libraryCategoryCounts = useMemo(
    () =>
      countLibraryCategories(strategies, {
        selectedJobId,
        parseSourceResearchJobId,
      }),
    [strategies, selectedJobId],
  );

  const filtered = useMemo(() => {
    return filterLibraryStrategies(libraryStrategies, category, {
      selectedJobId,
      parseSourceResearchJobId,
    });
  }, [libraryStrategies, category, selectedJobId]);

  async function setPaper(id: string) {
    if (id === SAFE_STRATEGY_ID) {
      setMessage("SAFE는 모의 활성으로 덮어쓰지 않습니다. 복사본을 사용하세요.");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_paper", id }),
      });
      const json = await res.json();
      setMessage(json.ok ? "모의매매에 등록했습니다." : (json.error ?? "실패"));
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteStrategy(id: string) {
    if (id === SAFE_STRATEGY_ID) {
      setMessage("SAFE 전략은 삭제할 수 없습니다.");
      return;
    }
    const s = strategies.find((x) => x.id === id);
    if (s?.liveActive) {
      setMessage("실전 활성 전략은 삭제할 수 없습니다. 먼저 비활성화하세요.");
      return;
    }
    let impact: {
      classification?: string;
      reasonsKo?: string[];
      nextActionKo?: string;
      backtestRefs?: string[];
      paperRefs?: string[];
    } | null = null;
    try {
      const prev = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deletion_impact", id }),
      }).then((r) => r.json());
      if (prev.ok) impact = prev.data;
    } catch {
      /* continue */
    }
    if (impact?.classification === "absolute_protect") {
      setMessage(
        `${impact.reasonsKo?.[0] ?? "삭제할 수 없습니다."} ${impact.nextActionKo ?? ""}`,
      );
      return;
    }
    const needsDetach =
      impact?.classification === "detach_then_delete" ||
      (impact?.backtestRefs?.length ?? 0) > 0 ||
      (impact?.paperRefs?.length ?? 0) > 0 ||
      Boolean(s?.paperActive);
    if (needsDetach) {
      const choice = window.prompt(
        `${impact?.reasonsKo?.[0] ?? "참조가 있습니다."}\n` +
          `다음 중 입력: 보관 | 해제후삭제 | 취소\n` +
          `(Backtest ${impact?.backtestRefs?.length ?? 0} · Paper ${impact?.paperRefs?.length ?? 0})`,
        "해제후삭제",
      );
      if (!choice || choice.trim() === "취소") return;
      if (choice.trim() === "보관") {
        setMessage("전략 보관은 삭제하지 않고 목록 필터(보관)에서 관리하세요.");
        return;
      }
      if (choice.trim() !== "해제후삭제") {
        setMessage("지원하지 않는 선택입니다.");
        return;
      }
      setBusyId(id);
      try {
        await fetch("/api/rextora/strategies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "detach_research_provenance", id }),
        });
        const res = await fetch("/api/rextora/strategies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", id, detachRefsFirst: true }),
        });
        const json = await res.json();
        setMessage(
          json.ok ? "연결 해제 후 삭제했습니다." : (json.error ?? "삭제 실패"),
        );
        await refresh();
      } finally {
        setBusyId(null);
      }
      return;
    }
    if (!window.confirm("이 전략을 삭제할까요?")) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await res.json();
      setMessage(json.ok ? "삭제했습니다." : (json.error ?? "삭제 실패"));
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  function renderHighlight(
    title: string,
    s: StrategyRow | null,
    tone: "success" | "warning" | "default",
    emptyMessage?: string | null,
  ) {
    if (!s) {
      return (
        <Card title={title} data-testid={`highlight-${title}`}>
          <EmptyState
            message={
              emptyMessage ??
              (loading && !loadingTimedOut
                ? "결과를 불러오는 중입니다…"
                : "아직 해당 전략이 없습니다.")
            }
            hint={
              loading && !loadingTimedOut
                ? "잠시만 기다려 주세요."
                : "전략 탐색을 완료하거나 백테스트를 통과한 전략을 등록하세요."
            }
          />
        </Card>
      );
    }
    const { strength, weakness } = strengthWeakness(s);
    const trades = tradeCountOf(s);
    const rec: StrategyRecommendation = recommendStrategyAction({
      totalReturn: s.lastBacktest?.totalReturn ?? null,
      mdd: s.lastBacktest?.mdd ?? null,
      tradeCount: trades,
      passed: s.lastBacktest?.passed ?? null,
      paperActive: Boolean(s.paperActive),
      liveActive: Boolean(s.liveActive),
      isSafe: s.id === SAFE_STRATEGY_ID,
    });
    const metricState = metricStatusKo({
      hasBacktest: Boolean(s.lastBacktest),
      totalReturn: s.lastBacktest?.totalReturn,
      tradeCount: trades,
      passed: s.lastBacktest?.passed ?? (trades != null ? true : null),
    });
    const isDuplicateRole =
      ranked.duplicateId != null && s.id === ranked.duplicateId;
    const paperLabel = s.paperActive ? "모의매매 보기" : "모의매매 등록";
    const liveGate = evaluateLiveCandidateRegistration({
      strategyId: s.id,
      isSafe: s.id === SAFE_STRATEGY_ID,
      paperActive: Boolean(s.paperActive),
      liveActive: Boolean(s.liveActive),
      liveEligible: s.liveEligible,
      hasBacktest: Boolean(s.lastBacktest),
      totalReturn: s.lastBacktest?.totalReturn,
      mdd: s.lastBacktest?.mdd,
      tradeCount: trades,
      passed: s.lastBacktest?.passed,
    });
    const liveLabel = s.liveActive
      ? "실전매매 검토 대상 보기"
      : "실전매매 검토 대상 등록";
    return (
      <Card title={title} data-testid={`highlight-${title}`}>
        <div className="space-y-2">
          <div className="text-lg font-semibold text-slate-100">{s.name}</div>
          <div className="flex flex-wrap gap-2">
            <Badge>{rec.labelKo}</Badge>
            <Badge tone={metricState === "합격" ? "success" : "muted"}>
              {metricState}
            </Badge>
            {isDuplicateRole ? (
              <Badge tone="success">다중 역할</Badge>
            ) : null}
          </div>
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer select-none">전략 식별값</summary>
            <p className="mt-1 font-mono">{s.paramsHash.slice(0, 12)}</p>
          </details>
          {isDuplicateRole ? (
            <p
              className="text-xs text-sky-200"
              data-testid="results-duplicate-role-note"
            >
              수익성과 종합 점수가 모두 가장 높아 최종 추천에도 동일하게
              선정됐습니다.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="순수익"
              value={
                s.lastBacktest?.totalReturn == null
                  ? metricState
                  : formatPct(s.lastBacktest.totalReturn)
              }
            />
            <Metric
              label="최대 낙폭"
              value={
                s.lastBacktest?.mdd == null
                  ? metricState
                  : formatPct(s.lastBacktest.mdd)
              }
            />
            <Metric
              label="거래 수"
              value={trades == null ? metricState : trades}
            />
          </div>
          <p className="text-xs text-emerald-200">강점: {strength}</p>
          <p className="text-xs text-amber-200">약점: {weakness}</p>
          <p className="text-xs text-slate-400">
            권장 다음 단계: {rec.labelKo}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/backtest?strategyId=${encodeURIComponent(s.id)}&strategyHash=${encodeURIComponent(s.paramsHash)}&symbol=${encodeURIComponent(
                (s as { symbols?: string[] }).symbols?.[0] ?? "BTCUSDT",
              )}&timeframe=${encodeURIComponent(
                (s as { timeframe?: string }).timeframe ?? "15m",
              )}&sourceResearchJobId=${encodeURIComponent(jobs[0]?.id ?? "")}`}
              data-testid="results-backtest-handoff"
            >
              <Button size="sm">새 기간으로 백테스트</Button>
            </Link>
            {s.paperActive ? (
              <Link href="/paper-trading">
                <Button size="sm" tone="success">
                  {paperLabel}
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                tone="success"
                disabled={busyId === s.id || s.id === SAFE_STRATEGY_ID}
                onClick={() => void setPaper(s.id)}
              >
                {paperLabel}
              </Button>
            )}
            {s.liveActive || liveGate.allowed ? (
              <Link
                href={`/live-trading?candidate=${encodeURIComponent(s.id)}`}
              >
                <Button size="sm" variant="outline">
                  {liveLabel}
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled
                title={liveGate.reasonKo ?? undefined}
                data-testid="results-live-disabled"
              >
                {liveLabel}
              </Button>
            )}
            {!liveGate.allowed && !s.liveActive ? (
              <p className="w-full text-xs text-amber-200/90">
                실전매매 검토 불가: {liveGate.reasonKo}
              </p>
            ) : null}
            <Link
              href={`/strategy-search?followUp=${encodeURIComponent(s.id)}`}
            >
              <Button size="sm" variant="outline">
                이 전략으로 재탐색
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const historyJobs = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const filtered = jobs.filter((j) => {
      if (!q) return true;
      const hay = [
        j.id,
        j.searchName,
        j.status,
        j.timeframe,
        ...(j.symbols ?? []),
        j.currentSearchFamily,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    const sorted = [...filtered].sort((a, b) => {
      if (historySort === "name") {
        return (a.searchName || a.id).localeCompare(b.searchName || b.id, "ko");
      }
      if (historySort === "evaluated") {
        return (b.uniqueEvaluatedCount ?? 0) - (a.uniqueEvaluatedCount ?? 0);
      }
      if (historySort === "qualified") {
        return (b.qualifiedCount ?? 0) - (a.qualifiedCount ?? 0);
      }
      const ta = Date.parse(b.updatedAt || b.createdAt || "") || 0;
      const tb = Date.parse(a.updatedAt || a.createdAt || "") || 0;
      return ta - tb;
    });
    return sorted;
  }, [jobs, historySearch, historySort]);
  const safe = strategies.find((s) => s.id === SAFE_STRATEGY_ID) ?? null;
  const nonSafe = strategies.filter((s) => s.id !== SAFE_STRATEGY_ID);
  const paperCount = nonSafe.filter((s) => s.paperActive).length;
  const liveCount = nonSafe.filter((s) => s.liveActive || s.liveEligible).length;

  async function previewJobImpact(jobId: string) {
    setHistoryBusyJobId(jobId);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/${encodeURIComponent(jobId)}/deletion-impact`,
      );
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.error ?? "영향 미리보기 실패");
        return;
      }
      setHistoryImpact((prev) => ({
        ...prev,
        [jobId]: json.data as DeletionImpactPreview,
      }));
    } finally {
      setHistoryBusyJobId(null);
    }
  }

  async function archiveJob(jobId: string) {
    if (
      !window.confirm(
        "이 탐색 작업을 보관할까요? 데이터는 유지되며 기본 이력 목록에서 숨겨집니다.",
      )
    ) {
      return;
    }
    setHistoryBusyJobId(jobId);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/${encodeURIComponent(jobId)}/archive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "results_history_archive" }),
        },
      );
      const json = await res.json();
      setMessage(json.ok ? "탐색 작업을 보관했습니다." : (json.error ?? "보관 실패"));
      setSelectedHistoryIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      await refresh();
    } finally {
      setHistoryBusyJobId(null);
    }
  }

  async function restoreJob(jobId: string) {
    setHistoryBusyJobId(jobId);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/${encodeURIComponent(jobId)}/restore`,
        { method: "POST" },
      );
      const json = await res.json();
      setMessage(
        json.ok ? "보관된 탐색 작업을 복원했습니다." : (json.error ?? "복원 실패"),
      );
      setSelectedHistoryIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      await refresh();
    } finally {
      setHistoryBusyJobId(null);
    }
  }

  async function previewRawTrials(jobId: string) {
    setRawBusy(true);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/${encodeURIComponent(jobId)}/raw-trials`,
      );
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.error ?? "원본 후보 미리보기 실패");
        return;
      }
      setRawPreview(json.data as RawTrialPreview);
    } finally {
      setRawBusy(false);
    }
  }

  async function cleanupRawTrials(jobId: string, dryRun: boolean) {
    if (
      !dryRun &&
      !window.confirm(
        "보호되지 않은 원본 trial만 삭제합니다. TOP 10·등록·참조 trial은 유지됩니다. 계속할까요?",
      )
    ) {
      return;
    }
    setRawBusy(true);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/${encodeURIComponent(jobId)}/raw-trials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cleanup", dryRun }),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.error ?? "원본 후보 정리 실패");
        return;
      }
      setRawPreview(json.data as RawTrialPreview);
      setMessage(
        dryRun
          ? `미리보기: 삭제 가능 ${json.data.deletableTrialCount}개 · 보호 ${json.data.protectedTrialCount}개`
          : `정리 완료: ${json.data.deleted ?? 0}개 삭제 · 보호 ${json.data.protectedTrialCount}개 유지`,
      );
      await refresh();
    } finally {
      setRawBusy(false);
    }
  }

  async function deleteJob(jobId: string) {
    const impact = historyImpact[jobId];
    if (!impact) {
      await previewJobImpact(jobId);
      setMessage("삭제 영향을 확인한 뒤 다시 시도하세요.");
      return;
    }
    if (impact.classification === "protected") {
      setMessage(impact.reasonsKo[0] ?? "삭제할 수 없는 작업입니다.");
      return;
    }
    if (impact.classification === "archive_only") {
      setMessage("참조가 있어 삭제 대신 보관만 가능합니다.");
      return;
    }
    if (
      !window.confirm(
        `trial ${impact.trialCount}개 · TOP 10 ${impact.top10Count}개 · ${formatBytes(impact.bytesToRemove)}를 삭제할까요?`,
      )
    ) {
      return;
    }
    setHistoryBusyJobId(jobId);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/${encodeURIComponent(jobId)}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      setMessage(json.ok ? "탐색 작업을 삭제했습니다." : (json.error ?? "삭제 실패"));
      if (json.ok) {
        setHistoryImpact((prev) => {
          const next = { ...prev };
          delete next[jobId];
          return next;
        });
        impactsFetchedRef.current.delete(jobId);
        setSelectedHistoryIds((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
        if (typeof window !== "undefined") {
          try {
            const url = new URL(window.location.href);
            if (url.searchParams.get("jobId") === jobId) {
              url.searchParams.delete("jobId");
              window.history.replaceState({}, "", url.pathname + url.search);
            }
            for (const key of Object.keys(window.sessionStorage)) {
              if (key.includes(jobId)) window.sessionStorage.removeItem(key);
            }
            for (const key of Object.keys(window.localStorage)) {
              if (key.includes(jobId)) window.localStorage.removeItem(key);
            }
          } catch {
            /* ignore */
          }
        }
      }
      if (json.ok && selectedJobId === jobId) {
        setSelectedJobIdOverride(null);
      }
      await refresh();
    } finally {
      setHistoryBusyJobId(null);
    }
  }

  const jobsById = useMemo(
    () => new Map(jobs.map((j) => [j.id, j])),
    [jobs],
  );

  function toggleHistorySelection(jobId: string) {
    setSelectedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  async function bulkArchiveSelected() {
    const ids = filterBulkArchiveCandidates(
      [...selectedHistoryIds],
      jobsById,
      historyImpact,
    );
    if (ids.length === 0) {
      setMessage("보관 가능한 선택 작업이 없습니다.");
      return;
    }
    if (
      !window.confirm(
        `선택한 ${ids.length}개 탐색 작업을 보관할까요? 기본 이력에서 숨겨집니다.`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    try {
      for (const jobId of ids) {
        const res = await fetch(
          `/api/rextora/strategy-search/${encodeURIComponent(jobId)}/archive`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "results_history_bulk_archive" }),
          },
        );
        const json = await res.json();
        if (json.ok) ok += 1;
      }
      setMessage(`${ok}/${ids.length}개 작업을 보관했습니다.`);
      setSelectedHistoryIds(new Set());
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDeleteSelected() {
    const ids = filterBulkDeleteCandidates(
      [...selectedHistoryIds],
      jobsById,
      historyImpact,
    );
    if (ids.length === 0) {
      setMessage("삭제 가능한 선택 작업이 없습니다. 실행 중·보호·참조 작업은 제외됩니다.");
      return;
    }
    const totalBytes = ids.reduce(
      (sum, id) => sum + (historyImpact[id]?.bytesToRemove ?? 0),
      0,
    );
    if (
      !window.confirm(
        `삭제 가능 ${ids.length}개 · ${formatBytes(totalBytes)} — 영구 삭제할까요? 등록 전략·Backtest·Paper·Live 기록은 유지됩니다.`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    try {
      for (const jobId of ids) {
        const res = await fetch(
          `/api/rextora/strategy-search/${encodeURIComponent(jobId)}`,
          { method: "DELETE" },
        );
        const json = await res.json();
        if (json.ok) ok += 1;
      }
      setMessage(`${ok}/${ids.length}개 탐색 작업을 삭제했습니다.`);
      setSelectedHistoryIds(new Set());
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  function selectHistoryPreset(
    preset: "failed" | "user_stopped" | "old",
  ) {
    let ids: string[];
    if (preset === "failed") ids = selectFailedJobIds(jobs);
    else if (preset === "user_stopped") ids = selectUserStoppedJobIds(jobs);
    else ids = selectOldJobIds(jobs, 30);
    setSelectedHistoryIds(new Set(ids));
    setMessage(`${ids.length}개 작업을 선택했습니다.`);
  }

  const [libraryOpen, setLibraryOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [safeOpen, setSafeOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("results-section-outcome");

  useEffect(() => {
    const ids = RESULTS_NAV_ITEMS.map((n) => n.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.35, 0.6] },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [selectedJobId, libraryOpen, historyOpen, safeOpen, loading]);

  function goToSection(id: string) {
    if (id === "results-section-library") setLibraryOpen(true);
    if (id === "results-section-history") setHistoryOpen(true);
    if (id === "results-section-safe") setSafeOpen(true);
    if (id === "results-raw-candidates") {
      window.setTimeout(() => {
        const details = document.querySelector<HTMLDetailsElement>(
          '[data-testid="results-raw-candidates"] details',
        );
        if (details) details.open = true;
      }, 0);
    }
    window.setTimeout(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      const focusable = el?.querySelector<HTMLElement>(
        "button, a, input, select, [tabindex]:not([tabindex='-1'])",
      );
      focusable?.focus({ preventScroll: true });
      setActiveSection(id);
    }, 0);
  }

  return (
    <div className="space-y-5" data-testid="results-workbench">
      {message ? (
        <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <nav
        className="sticky top-0 z-30 -mx-1 overflow-x-auto border-b border-slate-800/80 bg-[rgba(8,14,26,0.92)] px-1 py-2 backdrop-blur-md"
        data-testid="results-section-nav"
        aria-label="결과 섹션 바로가기"
      >
        <div className="flex min-w-max gap-1">
          {RESULTS_NAV_ITEMS.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={activeSection === item.id ? "primary" : "outline"}
              onClick={() => goToSection(item.id)}
              data-testid={`nav-${item.id}`}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </nav>

      {storageSummary ? (
        <Card title="저장소 요약" data-testid="results-storage-summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="탐색 작업" value={storageSummary.activeJobs} />
            <Metric label="보관됨" value={storageSummary.archivedJobs} />
            <Metric label="trial 파일" value={storageSummary.totalTrialFiles} />
            <Metric
              label="디스크 사용"
              value={formatBytes(storageSummary.totalBytes)}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            TOP 10 {storageSummary.top10Files}개 · 원본 trial 보존 정책{" "}
            {storageSummary.rawTrialRetentionPolicy}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => goToSection("results-section-history")}
              data-testid="storage-link-history"
            >
              연구 이력 관리
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => goToSection("results-section-raw-mgmt")}
              data-testid="storage-link-raw"
            >
              원본 후보 관리
            </Button>
            <Link href="/strategy-search#ss-section-config">
              <Button size="sm" variant="outline" data-testid="storage-link-config">
                설정 관리
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      <CurrentResearchResultsPanel
        jobId={selectedJobId}
        onMessage={setMessage}
      />

      {!selectedJobId ? (
        <div className="grid gap-4 lg:grid-cols-3" id="results-section-top3-fallback">
          {renderHighlight("최고 수익 전략", ranked.topProfit, "success")}
          {renderHighlight(
            "최고 안정 전략",
            ranked.topStable,
            "warning",
            ranked.stabilityBlockReason,
          )}
          {renderHighlight(
            "최종 추천 전략",
            ranked.topRecommend,
            "default",
            ranked.stabilityBlockReason
              ? "추천 가능한 안정 전략 없음 — 최종 추천도 동일 자격 규칙을 적용합니다."
              : null,
          )}
        </div>
      ) : null}

      <section id="results-section-library" data-testid="results-full-ranking">
        <Card
          title="기존 전략 라이브러리"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLibraryOpen((v) => !v)}
              data-testid="library-toggle"
              aria-expanded={libraryOpen}
            >
              {libraryOpen ? "접기" : "펼치기"}
            </Button>
          }
        >
          <p className="text-xs text-slate-400" data-testid="library-summary">
            등록 전략 {nonSafe.length}개 · 모의매매 {paperCount}개 · 실전 검토{" "}
            {liveCount}개 · 백테스트 완료 {libraryCategoryCounts.backtested}개 ·
            검토 대기 {libraryCategoryCounts.review}개 · 보관{" "}
            {libraryCategoryCounts.archive}개
          </p>
          {!libraryOpen ? (
            <p className="mt-2 text-xs text-slate-500">
              이미 등록된 전략입니다. 이번 탐색의 합격 trial과는 별도입니다.
            </p>
          ) : (
            <>
              <p className="mb-3 mt-2 text-xs text-slate-400">
                이미 등록된 전략입니다. 이번 탐색의 합격 trial과는 별도입니다.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {LIBRARY_FILTER_BUTTONS.map(({ id, label }) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={category === id ? "primary" : "outline"}
                    onClick={() => setCategory(id)}
                    data-testid={`library-filter-${id}`}
                  >
                    {label} ({libraryCategoryCounts[id]})
                  </Button>
                ))}
              </div>
              {filtered.length === 0 ? (
                <EmptyState message="표시할 전략이 없습니다." />
              ) : (
                <div className="space-y-2" data-testid="library-compact-list">
                  {filtered.map((s) => {
                    const trades = tradeCountOf(s);
                    const provenance = parseLibraryProvenance(s.description);
                    const metricState = metricStatusKo({
                      hasBacktest: Boolean(s.lastBacktest),
                      totalReturn: s.lastBacktest?.totalReturn,
                      tradeCount: trades,
                      passed:
                        s.lastBacktest?.passed ?? (trades != null ? true : null),
                    });
                    return (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                        data-testid={`result-card-${s.id}`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-100">
                            {s.name}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                            <Badge tone="muted">{metricState}</Badge>
                            <span>
                              수익{" "}
                              {s.lastBacktest?.totalReturn == null
                                ? metricState
                                : formatPct(s.lastBacktest.totalReturn)}
                            </span>
                            <span>거래 {trades ?? "없음"}</span>
                            {s.createdAt ? (
                              <span>
                                생성{" "}
                                {new Date(s.createdAt).toLocaleString("ko-KR")}
                              </span>
                            ) : null}
                            {provenance.sourceResearchJobId ? (
                              <span>
                                연구 {provenance.sourceResearchJobId.slice(0, 12)}…
                              </span>
                            ) : null}
                            {provenance.searchFamily ? (
                              <span>패밀리 {provenance.searchFamily}</span>
                            ) : null}
                            {provenance.pattern ? (
                              <span>패턴 {provenance.pattern}</span>
                            ) : null}
                            {provenance.leverage ? (
                              <span>레버리지 {provenance.leverage}</span>
                            ) : null}
                            <span>
                              {s.paperActive
                                ? "모의"
                                : s.liveActive
                                  ? "실전 후보"
                                  : s.lastBacktest
                                    ? "백테스트"
                                    : "등록"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/backtest?strategyId=${encodeURIComponent(s.id)}&strategyHash=${encodeURIComponent(s.paramsHash)}`}
                            data-testid="results-row-backtest-handoff"
                          >
                            <Button size="sm">새 기간으로 백테스트</Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              busyId === s.id ||
                              s.id === SAFE_STRATEGY_ID ||
                              Boolean(s.paperActive)
                            }
                            onClick={() => void setPaper(s.id)}
                          >
                            {s.paperActive ? "모의매매 보기" : "모의매매 등록"}
                          </Button>
                          <Button
                            size="sm"
                            tone="muted"
                            disabled={
                              busyId === s.id ||
                              s.id === SAFE_STRATEGY_ID ||
                              Boolean(s.paperActive) ||
                              Boolean(s.liveActive)
                            }
                            onClick={() => void deleteStrategy(s.id)}
                          >
                            삭제
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Card>
      </section>

      <section id="results-section-raw-mgmt" data-testid="results-raw-trial-mgmt">
        <Card title="원본 후보 관리">
          <p className="mb-3 text-sm text-slate-400">
            원본 trial은 재현용 증거입니다. 기본 화면에는 TOP 10만 표시하며, 정리는
            미리보기 후 보호되지 않은 항목만 삭제합니다. 기본 보존 정책:{" "}
            <span className="text-slate-200">
              {storageSummary?.rawTrialRetentionPolicy ?? "keep_30_days"}
            </span>
          </p>
          {selectedJobId ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rawBusy}
                  onClick={() => void previewRawTrials(selectedJobId)}
                  data-testid="raw-trial-preview"
                >
                  정리 미리보기
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rawBusy || !rawPreview}
                  onClick={() => void cleanupRawTrials(selectedJobId, true)}
                  data-testid="raw-trial-dry-run"
                >
                  dry-run 실행
                </Button>
                <Button
                  size="sm"
                  tone="muted"
                  disabled={
                    rawBusy ||
                    !rawPreview ||
                    (rawPreview.deletableTrialCount ?? 0) <= 0
                  }
                  onClick={() => void cleanupRawTrials(selectedJobId, false)}
                  data-testid="raw-trial-cleanup"
                >
                  정리 실행
                </Button>
              </div>
              {rawPreview ? (
                <div
                  className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
                  data-testid="raw-trial-preview-stats"
                >
                  <Metric label="유지 trial" value={rawPreview.retainedTrialCount} />
                  <Metric label="보호 trial" value={rawPreview.protectedTrialCount} />
                  <Metric
                    label="삭제 가능"
                    value={rawPreview.deletableTrialCount}
                  />
                  <Metric
                    label="저장 용량"
                    value={formatBytes(rawPreview.storageBytes)}
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  선택한 연구 작업의 원본 trial 정리 미리보기를 실행하세요.
                </p>
              )}
            </div>
          ) : (
            <EmptyState message="연구를 선택한 뒤 원본 후보를 관리하세요." />
          )}
        </Card>
      </section>

      <section id="results-section-history" data-testid="results-research-history">
        <Card
          title={historyView === "archived" ? "보관된 연구 이력" : "연구 이력 관리"}
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={historyView === "default" ? "primary" : "outline"}
                onClick={() => switchHistoryView("default")}
                data-testid="history-view-default"
              >
                기본 이력
              </Button>
              <Button
                size="sm"
                variant={historyView === "archived" ? "primary" : "outline"}
                onClick={() => switchHistoryView("archived")}
                data-testid="history-view-archived"
              >
                보관됨 ({storageSummary?.archivedJobs ?? 0})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setHistoryOpen((v) => !v)}
                data-testid="history-toggle"
                aria-expanded={historyOpen}
              >
                {historyOpen ? "접기" : "펼치기"}
              </Button>
            </div>
          }
        >
          <div
            className="mb-3 flex flex-wrap gap-2"
            data-testid="history-bulk-actions"
          >
            <input
              type="search"
              className="min-w-[12rem] flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
              placeholder="이력 검색 (이름·심볼·상태)"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              data-testid="history-search"
            />
            <select
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
              value={historySort}
              onChange={(e) =>
                setHistorySort(
                  e.target.value as "newest" | "evaluated" | "qualified" | "name",
                )
              }
              data-testid="history-sort"
            >
              <option value="newest">최신순</option>
              <option value="evaluated">평가 수</option>
              <option value="qualified">합격 수</option>
              <option value="name">이름</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy || selectedHistoryIds.size === 0}
              onClick={() => void bulkArchiveSelected()}
              data-testid="bulk-archive"
            >
              선택 보관
            </Button>
            <Button
              size="sm"
              tone="muted"
              disabled={bulkBusy || selectedHistoryIds.size === 0}
              onClick={() => void bulkDeleteSelected()}
              data-testid="bulk-delete"
            >
              선택 삭제
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => selectHistoryPreset("failed")}
              data-testid="select-failed-jobs"
            >
              실패 작업 선택
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => selectHistoryPreset("user_stopped")}
              data-testid="select-cancelled-jobs"
            >
              사용자 중지 작업 선택
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => selectHistoryPreset("old")}
              data-testid="select-old-jobs"
            >
              오래된 작업 선택
            </Button>
          </div>
          {historyJobs.length === 0 ? (
            <EmptyState
              message={
                historyView === "archived"
                  ? "보관된 탐색이 없습니다."
                  : "표시할 탐색 이력이 없습니다."
              }
              hint={
                historyView === "archived"
                  ? "기본 이력에서 작업을 보관하면 여기에 표시됩니다."
                  : "전략 탐색에서 연구를 시작하세요."
              }
            />
          ) : (
            <>
              <ul className="space-y-2" data-testid="history-preview">
                {historyJobs
                  .slice(0, historyOpen ? historyJobs.length : 3)
                  .map((j) => {
                    const impact = historyImpact[j.id];
                    const busy = historyBusyJobId === j.id || bulkBusy;
                    const deleteDisabled =
                      busy ||
                      !impact ||
                      impact.classification !== "deletable";
                    const archiveDisabled =
                      busy ||
                      historyView === "archived" ||
                      impact?.classification === "protected";
                    const classification = impact?.classification;
                    const badgeTone =
                      classification === "deletable"
                        ? "success"
                        : classification === "protected"
                          ? "danger"
                          : "warning";
                    return (
                      <li
                        key={j.id}
                        className="rounded-lg border border-slate-800 px-3 py-2"
                        data-testid={`history-row-${j.id}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={selectedHistoryIds.has(j.id)}
                              onChange={() => toggleHistorySelection(j.id)}
                              data-testid={`select-history-${j.id}`}
                              aria-label={`${j.searchName || j.id} 선택`}
                            />
                            <div className="min-w-0">
                              <div className="text-sm text-slate-100">
                                {j.searchName || j.id}
                              </div>
                              <div className="text-xs rx-text-muted">
                                {historyStatusLabelKo(j.status, {
                                  completionReason: j.completionReason ?? null,
                                })}{" "}
                                · 평가 {j.uniqueEvaluatedCount ?? 0} · 합격{" "}
                                {j.qualifiedCount ?? 0} · TOP 10{" "}
                                {impact?.top10Count ?? "—"} · 등록 전략{" "}
                                {impact?.registeredStrategyRefs.length ?? "—"}
                                {j.elapsedMs != null
                                  ? ` · 연구 ${Math.round(j.elapsedMs / 60_000)}분`
                                  : ""}
                                {j.currentSearchFamily
                                  ? ` · ${j.currentSearchFamily}`
                                  : ""}
                                {j.bestReturn != null &&
                                Number.isFinite(j.bestReturn)
                                  ? ` · 최고 ${(j.bestReturn * 100).toFixed(1)}%`
                                  : ""}
                                {j.bestScore != null &&
                                Number.isFinite(j.bestScore)
                                  ? ` · 점수 ${j.bestScore.toFixed(2)}`
                                  : ""}{" "}
                                ·{" "}
                                {impact
                                  ? formatBytes(impact.bytesToRemove)
                                  : "용량 계산 중…"}
                              </div>
                              {impact ? (
                                <div className="mt-1">
                                  <Badge tone={badgeTone}>
                                    {classificationLabelKo(classification)}
                                  </Badge>
                                </div>
                              ) : (
                                <p className="mt-1 text-xs text-slate-500">
                                  분류 확인 중…
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {historyView === "archived" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void restoreJob(j.id)}
                                data-testid={`restore-job-${j.id}`}
                              >
                                복원
                              </Button>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant={
                                    selectedJobId === j.id ? "primary" : "outline"
                                  }
                                  onClick={() => setSelectedJobIdOverride(j.id)}
                                  data-testid={`select-job-${j.id}`}
                                >
                                  이번 탐색으로 보기
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => void previewJobImpact(j.id)}
                                  data-testid={`impact-job-${j.id}`}
                                >
                                  영향 미리보기
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={archiveDisabled}
                                  title={
                                    impact?.classification === "protected"
                                      ? "실행 중·보호 작업은 보관할 수 없습니다."
                                      : undefined
                                  }
                                  onClick={() => void archiveJob(j.id)}
                                  data-testid={`archive-job-${j.id}`}
                                >
                                  보관
                                </Button>
                                <Button
                                  size="sm"
                                  tone="muted"
                                  disabled={deleteDisabled}
                                  title={
                                    impact?.classification === "archive_only"
                                      ? `삭제 불가 — 참조: ${impact.registeredStrategyRefs.join(", ") || impact.protectedItems.join(", ")}`
                                      : impact?.classification === "protected"
                                        ? impact.reasonsKo[0]
                                        : undefined
                                  }
                                  onClick={() => void deleteJob(j.id)}
                                  data-testid={`delete-job-${j.id}`}
                                >
                                  삭제
                                </Button>
                              </>
                            )}
                            <Link
                              href={`/strategy-search?jobId=${encodeURIComponent(j.id)}`}
                            >
                              <Button size="sm" variant="outline">
                                상세
                              </Button>
                            </Link>
                          </div>
                        </div>
                        {impact ? (
                          <div
                            className="mt-2 rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-400"
                            data-testid={`impact-preview-${j.id}`}
                          >
                            <p>{impact.reasonsKo.join(" ")}</p>
                            {impact.classification === "archive_only" &&
                            impact.registeredStrategyRefs.length > 0 ? (
                              <p className="mt-1 text-amber-200/90">
                                차단 참조:{" "}
                                {impact.registeredStrategyRefs.join(", ")}
                              </p>
                            ) : null}
                            <p className="mt-1">
                              작업 {impact.researchJobCount} · trial{" "}
                              {impact.trialCount} · TOP 10 {impact.top10Count} ·
                              등록 전략 {impact.registeredStrategyRefs.length} ·
                              Backtest {impact.backtestRefs.length} · Paper{" "}
                              {impact.paperRefs.length} · Live{" "}
                              {impact.liveRefs.length} · 삭제 가능 용량{" "}
                              {formatBytes(impact.bytesToRemove)}
                            </p>
                            {impact.protectedItems.length > 0 ? (
                              <p className="mt-1">
                                보호 레코드: {impact.protectedItems.join(", ")}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
              {!historyOpen && historyJobs.length > 3 ? (
                <p className="mt-2 text-xs text-slate-500">
                  최근 3건 미리보기 · 전체 {historyJobs.length}건은 펼쳐서 확인
                </p>
              ) : null}
            </>
          )}
          <div className="mt-3">
            <Link href="/strategy-search">
              <Button size="sm">새 탐색 시작</Button>
            </Link>
          </div>
        </Card>
      </section>

      <section id="results-section-safe" data-testid="results-safe-baseline">
        <Card
          title="SAFE 기준 전략"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSafeOpen((v) => !v)}
              data-testid="safe-toggle"
              aria-expanded={safeOpen}
            >
              {safeOpen ? "접기" : "펼치기"}
            </Button>
          }
        >
          <p className="text-xs text-slate-400">
            보호 기준선 · 읽기 전용 · 자동 탐색/수정 금지
          </p>
          {safeOpen ? (
            loading && !safe ? (
              <EmptyState
                message="보호 전략을 확인하는 중입니다…"
                hint="잠시만 기다려 주세요."
              />
            ) : safe ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{safe.name}</div>
                  <details className="mt-1 text-xs text-slate-500">
                    <summary className="cursor-pointer select-none">기술 정보</summary>
                    <p className="mt-1">해시 {safe.paramsHash}</p>
                  </details>
                </div>
                <Link href={`/backtest?strategyId=${SAFE_STRATEGY_ID}`}>
                  <Button size="sm" variant="outline">
                    기준 백테스트
                  </Button>
                </Link>
              </div>
            ) : (
              <EmptyState
                message="보호 전략(SAFE)을 불러오지 못했습니다."
                hint="페이지를 새로고침하거나 시스템 설정의 데이터 상태를 확인하세요."
              />
            )
          ) : null}
        </Card>
      </section>
    </div>
  );
}
