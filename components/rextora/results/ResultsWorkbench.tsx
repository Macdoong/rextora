"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, ConfirmDialog, Metric, RenameDialog, Skeleton, StatusBanner } from "@/components/ui/primitives";
import type { StatusBannerStatus } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import { CurrentResearchResultsPanel } from "@/components/rextora/results/CurrentResearchResultsPanel";
import { historyStatusLabelKo } from "@/components/rextora/strategySearch/formatters";
import { buildSearchCompareHref } from "@/components/rextora/strategySearch/searchJobComparison";
import { SearchJobExportMenu } from "@/components/rextora/strategySearch/SearchJobExportMenu";
import type { StrategySearchJobStatus } from "@/components/rextora/strategySearch/types";
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
  isLibraryArchived,
  LIBRARY_FILTER_BUTTONS,
  type LibraryCategory,
} from "@/components/rextora/results/libraryFilterUtils";
import type { SavedBacktestResult } from "@/src/lib/rextora/backtest/backtestTypes";
import { DemoDataBadge } from "@/components/rextora/DemoDataBadge";
import {
  isDemoJobId,
  isDemoSearchName,
} from "@/src/lib/rextora/firstRun/demoIdentity";

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
  symbols?: string[];
  timeframe?: string;
  strategyHash?: string;
};

type PaperSessionSummary = {
  id: string;
  strategyId: string;
  status:
    | "pending_approval"
    | "ready"
    | "active"
    | "paused"
    | "stopped"
    | "failed";
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
  rankingGroups?: unknown[] | null;
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
  { id: "results-section-final-recommendation", label: "최종 추천" },
  { id: "results-section-top3", label: "TOP 3" },
  { id: "results-section-top10", label: "TOP 10" },
  { id: "results-section-library", label: "라이브러리" },
  { id: "results-section-history", label: "연구·저장소 관리" },
] as const;

type ResultsTabId =
  | "summary"
  | "explorer"
  | "library"
  | "history"
  | "advanced";

const RESULTS_TABS: ReadonlyArray<{
  id: ResultsTabId;
  label: string;
  section: string;
}> = [
  { id: "summary", label: "요약", section: "results-section-outcome" },
  { id: "explorer", label: "후보 탐색", section: "results-section-top10" },
  { id: "library", label: "전략 보관함", section: "results-section-library" },
  { id: "history", label: "탐색 이력", section: "results-section-history" },
  { id: "advanced", label: "고급", section: "results-storage-summary" },
];

function sectionToTab(id: string): ResultsTabId {
  if (id === "results-section-library") return "library";
  if (id === "results-section-history") return "history";
  if (
    id === "results-section-raw-mgmt" ||
    id === "results-storage-summary"
  ) {
    return "advanced";
  }
  if (
    id === "results-section-top10" ||
    id === "results-raw-candidates" ||
    id === "results-section-rank-history"
  ) {
    return "explorer";
  }
  return "summary";
}

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

type LibraryLoadState =
  | "loading"
  | "loaded"
  | "true_empty"
  | "partial"
  | "error";

function deriveMessageStatus(msg: string | null): StatusBannerStatus {
  if (!msg) return "idle";
  const m = msg.toLowerCase();
  if (
    m.includes("실패") ||
    m.includes("오류") ||
    m.includes("못했습니다") ||
    m.includes("할 수 없습니다") ||
    m.includes("않습니다") ||
    m.includes("없습니다")
  )
    return "error";
  if (
    m.includes("등록했습니다") ||
    m.includes("저장했습니다") ||
    m.includes("삭제했습니다") ||
    m.includes("보관했습니다") ||
    m.includes("복원했습니다") ||
    m.includes("처리했습니다") ||
    m.includes("적용했습니다")
  )
    return "success";
  return "info";
}

function paperSessionForStrategy(
  session: PaperSessionSummary | null,
  strategyId: string,
): PaperSessionSummary | null {
  if (!session || session.strategyId !== strategyId) return null;
  return session;
}

function paperActionForStrategy(
  session: PaperSessionSummary | null,
  strategyId: string,
): {
  label: string;
  href?: string;
  kind: "link" | "prepare";
} {
  const match = paperSessionForStrategy(session, strategyId);
  if (match?.status === "pending_approval" || match?.status === "ready") {
    return {
      label: "승인 대기 · 모의매매",
      href: `/paper-trading?strategyId=${encodeURIComponent(strategyId)}&sessionId=${encodeURIComponent(match.id)}`,
      kind: "link",
    };
  }
  if (match?.status === "active" || match?.status === "paused") {
    return {
      label: "모의매매 보기",
      href: `/paper-trading?strategyId=${encodeURIComponent(strategyId)}`,
      kind: "link",
    };
  }
  if (match?.status === "stopped" || match?.status === "failed") {
    return {
      label: "모의매매 재준비",
      kind: "prepare",
    };
  }
  return {
    label: "모의매매 준비",
    kind: "prepare",
  };
}

function paperStatusLabel(
  session: PaperSessionSummary | null,
  strategy: StrategyRow,
): string {
  const match = paperSessionForStrategy(session, strategy.id);
  if (match?.status === "pending_approval") return "모의 승인 대기";
  if (match?.status === "ready") return "모의 준비됨";
  if (match?.status === "active") return "모의 활성";
  if (match?.status === "paused") return "모의 일시정지";
  if (match?.status === "stopped") return "모의 종료";
  if (match?.status === "failed") return "모의 오류";
  if (strategy.paperActive) return "모의 등록(세션 없음)";
  if (strategy.liveActive) return "실전 후보";
  if (strategy.lastBacktest) return "백테스트";
  return "등록";
}

export function ResultsWorkbench() {
  const searchParams = useSearchParams();
  const jobIdFromUrl = searchParams.get("jobId");
  const [selectedJobIdOverride, setSelectedJobIdOverride] = useState<
    string | null | undefined
  >(undefined);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [paperSession, setPaperSession] = useState<PaperSessionSummary | null>(
    null,
  );
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [category, setCategory] = useState<LibraryCategory>("newest");
  const [librarySearch, setLibrarySearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [libraryLoadState, setLibraryLoadState] =
    useState<LibraryLoadState>("loading");
  const strategiesAuthoritativeRef = useRef(false);
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
  const HISTORY_PREVIEW_LIMIT = 8;
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [resultsTab, setResultsTab] = useState<ResultsTabId>("summary");
  const [libraryShowAll, setLibraryShowAll] = useState(false);
  const [runsPanelStrategyId, setRunsPanelStrategyId] = useState<string | null>(
    null,
  );
  const [relatedRuns, setRelatedRuns] = useState<SavedBacktestResult[]>([]);
  const [relatedRunsBusy, setRelatedRunsBusy] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("results-section-outcome");
  const LIBRARY_PREVIEW_LIMIT = 5;

  // ── Confirm dialog state ──────────────────────────────────────────────────
  type ConfirmState = {
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
  };
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function runConfirmedAction(state: ConfirmState) {
    setConfirmBusy(true);
    try {
      await state.onConfirm();
    } finally {
      setConfirmBusy(false);
      setConfirmState(null);
    }
  }

  // ── Rename dialog state ───────────────────────────────────────────────────
  type RenameState = {
    id: string;
    currentValue: string;
    onConfirm: (next: string) => Promise<void>;
  };
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  async function runRenameAction(state: RenameState, next: string) {
    setRenameBusy(true);
    try {
      await state.onConfirm(next);
    } finally {
      setRenameBusy(false);
      setRenameState(null);
    }
  }

  // ── Strategy-delete 3-way choice dialog ──────────────────────────────────
  type DeleteChoiceState = {
    strategyId: string;
    reasonKo: string;
    backtestCount: number;
    paperCount: number;
  };
  const [deleteChoiceState, setDeleteChoiceState] = useState<DeleteChoiceState | null>(null);
  const [deleteChoiceBusy, setDeleteChoiceBusy] = useState(false);

  const selectedJobId =
    selectedJobIdOverride !== undefined
      ? selectedJobIdOverride
      : jobIdFromUrl ?? jobs[0]?.id ?? null;
  const selectedJob =
    selectedJobId == null
      ? null
      : jobs.find((j) => j.id === selectedJobId) ?? null;

  const refreshSeqRef = useRef(0);
  const refreshAbortRef = useRef<AbortController | null>(null);

  const refreshPrimary = useCallback(async (viewOverride?: "default" | "archived") => {
    const view = viewOverride ?? historyView;
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    const seq = ++refreshSeqRef.current;
    try {
      const historyQuery =
        view === "archived"
          ? "?limit=40&archivedOnly=true"
          : "?limit=40";
      // Primary shell: jobs + strategies only (storage-summary is deferred).
      const [sRes, jRes, pRes] = await Promise.all([
        fetch("/api/rextora/strategies", { signal: controller.signal }).then(
          (r) => r.json(),
        ),
        fetch(`/api/rextora/strategy-search${historyQuery}`, {
          signal: controller.signal,
        }).then((r) => r.json()),
        fetch("/api/rextora/paper/session?active=1", {
          signal: controller.signal,
        }).then((r) => r.json()),
      ]);
      if (seq !== refreshSeqRef.current) return;
      // Never wipe existing lists on failed/partial polls (avoids empty flash).
      if (sRes?.ok && Array.isArray(sRes.data)) {
        strategiesAuthoritativeRef.current = true;
        const next = sRes.data.filter(
          (s: StrategyRow & { testData?: boolean; metadata?: { testData?: boolean } }) =>
            !isTestStrategyRecord(s as never),
        );
        setStrategies(next);
        setLibraryLoadState(next.length === 0 ? "true_empty" : "loaded");
      } else if (!strategiesAuthoritativeRef.current && !(sRes?.ok)) {
        setLibraryLoadState("error");
      }
      if (jRes?.ok) {
        const list = jRes.data?.jobs ?? jRes.data ?? [];
        const jobList: JobSummary[] = Array.isArray(list) ? list : [];
        setJobs(jobList);
      }
      if (pRes?.ok) {
        const active = pRes.data?.active ?? null;
        if (
          active &&
          typeof active.id === "string" &&
          typeof active.strategyId === "string" &&
          typeof active.status === "string"
        ) {
          setPaperSession({
            id: active.id,
            strategyId: active.strategyId,
            status: active.status,
          });
        } else {
          setPaperSession(null);
        }
      }
      if (sRes?.ok || jRes?.ok) setError(null);
    } catch (e) {
      if (seq !== refreshSeqRef.current) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "결과 로드 실패");
    } finally {
      if (seq === refreshSeqRef.current) {
        setLoading(false);
        setLoadingTimedOut(false);
      }
    }
  }, [historyView]);

  const refreshStorageSummary = useCallback(async () => {
    try {
      const storageRes = await fetch(
        "/api/rextora/strategy-search/storage-summary",
      ).then((r) => r.json());
      if (storageRes?.ok && storageRes.data) {
        setStorageSummary(storageRes.data as StorageSummaryView);
      }
    } catch {
      /* non-blocking */
    }
  }, []);

  const refresh = refreshPrimary;

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void refreshPrimary();
    }, 0);
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refreshPrimary();
    }, 30_000);
    return () => {
      window.clearTimeout(boot);
      clearInterval(t);
      refreshAbortRef.current?.abort();
    };
  }, [refreshPrimary]);

  useEffect(() => {
    if (!loading) return;
    const failsafe = window.setTimeout(() => {
      setLoading(false);
      setLoadingTimedOut(true);
      setError((prev) => prev ?? "결과 로드가 지연되어 중단했습니다. 새로고침하세요.");
    }, 20_000);
    return () => window.clearTimeout(failsafe);
  }, [loading]);

  // Close "더보기" dropdown when clicking outside any open card menu.
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close, { capture: true });
    return () => document.removeEventListener("click", close, { capture: true });
  }, [openMenuId]);

  // Deletion-impact is expensive — only hydrate when research history is opened.
  useEffect(() => {
    if ((!historyOpen && resultsTab !== "history") || jobs.length === 0) return;
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
  }, [jobs, historyOpen, resultsTab]);

  function switchHistoryView(view: "default" | "archived") {
    if (view === historyView) return;
    impactsFetchedRef.current.clear();
    setHistoryImpact({});
    setSelectedHistoryIds(new Set());
    setHistoryView(view);
    void refresh(view);
  }

  const ranked = useMemo(() => {
    const withBt = strategies.filter((s) => s.lastBacktest);
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

  const libraryStrategies = useMemo(() => strategies, [strategies]);

  const libraryCategoryCounts = useMemo(
    () =>
      countLibraryCategories(strategies, {
        selectedJobId,
        parseSourceResearchJobId,
      }),
    [strategies, selectedJobId],
  );

  const filtered = useMemo(() => {
    const categoryFiltered = filterLibraryStrategies(libraryStrategies, category, {
      selectedJobId,
      parseSourceResearchJobId,
    });
    const query = librarySearch.trim().toLocaleLowerCase("ko-KR");
    if (!query) return categoryFiltered;
    return categoryFiltered.filter((strategy) => {
      const display =
        (strategy as { displayAlias?: string | null; displayName?: string | null })
          .displayAlias ||
        (strategy as { displayName?: string | null }).displayName ||
        strategy.name;
      return `${display} ${strategy.name}`.toLocaleLowerCase("ko-KR").includes(query);
    });
  }, [libraryStrategies, category, selectedJobId, librarySearch]);

  async function setPaper(id: string) {
    const row = strategies.find((s) => s.id === id);
    const provenance = parseLibraryProvenance(row?.description);
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_paper",
          id,
          symbol: row?.symbols?.[0] ?? "BTCUSDT",
          timeframe: row?.timeframe ?? "15m",
          sourceResearchJobId: provenance.sourceResearchJobId,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        const session = json.data?.session as PaperSessionSummary | undefined;
        if (session?.id && session.strategyId) {
          setPaperSession({
            id: session.id,
            strategyId: session.strategyId,
            status: session.status,
          });
        }
        const link = json.data?.paperApprovalDeepLink as string | undefined;
        setMessage(
          link
            ? `모의매매 승인 대기 세션을 준비했습니다. Paper 화면에서 시작을 승인하세요.`
            : "모의매매 승인 대기 세션을 준비했습니다.",
        );
      } else {
        setMessage(json.error ?? "실패");
      }
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  function renameDisplay(id: string) {
    const s = strategies.find((x) => x.id === id);
    const current =
      (s as { displayAlias?: string | null } | undefined)?.displayAlias ||
      s?.name ||
      "";
    setRenameState({
      id,
      currentValue: current,
      onConfirm: async (trimmed) => {
        setBusyId(id);
        try {
          const beforeHash = s?.paramsHash;
          const res = await fetch("/api/rextora/strategies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "rename_display",
              id,
              displayAlias: trimmed,
              displayName: trimmed,
            }),
          });
          const json = await res.json();
          if (!json.ok) {
            setMessage(json.error ?? "이름 변경 실패");
            return;
          }
          if (beforeHash && json.data?.paramsHash !== beforeHash) {
            setMessage("오류: 이름 변경이 해시를 바꿨습니다.");
            return;
          }
          setMessage(`별칭을 "${trimmed}"(으)로 저장했습니다.`);
          await refresh();
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  async function updateAutomaticAlias(
    id: string,
    action: "restore_alias" | "regenerate_auto_name",
  ) {
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const json = await res.json();
      setMessage(
        json.ok
          ? action === "restore_alias"
            ? "사용자 별칭을 복원했습니다. 표시 이름은 유지됩니다."
            : "자동 이름을 다시 생성했습니다. 사용자 표시 이름은 덮어쓰지 않았습니다."
          : (json.error ?? "별칭 변경 실패"),
      );
      if (json.ok) await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function setLibraryArchive(id: string, archived: boolean) {
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: archived ? "library_archive" : "library_restore",
          id,
        }),
      });
      const json = await res.json();
      setMessage(
        json.ok
          ? archived
            ? "전략을 보관함으로 옮겼습니다."
            : "전략을 보관함에서 복원했습니다."
          : (json.error ?? "보관 처리 실패"),
      );
      if (json.ok) await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function loadRelatedRuns(strategyId: string) {
    if (runsPanelStrategyId === strategyId) {
      setRunsPanelStrategyId(null);
      setRelatedRuns([]);
      return;
    }
    setRunsPanelStrategyId(strategyId);
    setRelatedRunsBusy(true);
    try {
      const res = await fetch(
        `/api/rextora/backtest/run?strategyId=${encodeURIComponent(strategyId)}&allSymbols=1`,
        { cache: "no-store" },
      );
      const json = await res.json();
      setRelatedRuns(Array.isArray(json.data) ? json.data : []);
    } catch {
      setRelatedRuns([]);
      setMessage("관련 백테스트 실행을 불러오지 못했습니다.");
    } finally {
      setRelatedRunsBusy(false);
    }
  }

  function deleteRelatedRun(runId: string, strategyId: string) {
    void strategyId;
    setConfirmState({
      title: "백테스트 실행 삭제",
      description: `실행 ${runId}을(를) 삭제할까요? 전략·모의·실전 기록은 유지됩니다.`,
      confirmLabel: "삭제",
      onConfirm: async () => {
        setRelatedRunsBusy(true);
        try {
          const res = await fetch(
            `/api/rextora/backtest/run?runId=${encodeURIComponent(runId)}`,
            { method: "DELETE" },
          );
          const json = await res.json();
          setMessage(
            json.ok
              ? `실행 ${runId}을(를) 삭제했습니다.`
              : (json.error ?? "실행 삭제 실패"),
          );
          if (json.ok) {
            setRelatedRuns((prev) => prev.filter((r) => r.id !== runId));
            await refresh();
          }
        } finally {
          setRelatedRunsBusy(false);
        }
      },
    });
  }

  async function deleteStrategy(id: string) {
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
      // Show 3-way choice dialog: archive | detach-then-delete | cancel
      setDeleteChoiceState({
        strategyId: id,
        reasonKo: impact?.reasonsKo?.[0] ?? "참조가 있어 단순 삭제가 불가합니다.",
        backtestCount: impact?.backtestRefs?.length ?? 0,
        paperCount: impact?.paperRefs?.length ?? 0,
      });
      return;
    }
    setConfirmState({
      title: "전략 삭제",
      description: "이 전략을 삭제할까요? 이 작업은 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      onConfirm: async () => {
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
      },
    });
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
    });
    const metricState = metricStatusKo({
      hasBacktest: Boolean(s.lastBacktest),
      totalReturn: s.lastBacktest?.totalReturn,
      tradeCount: trades,
      passed: s.lastBacktest?.passed ?? (trades != null ? true : null),
    });
    const isDuplicateRole =
      ranked.duplicateId != null && s.id === ranked.duplicateId;
    const paperAction = paperActionForStrategy(paperSession, s.id);
    const liveGate = evaluateLiveCandidateRegistration({
      strategyId: s.id,
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
              href={`/backtest?strategyId=${encodeURIComponent(s.id)}&strategyHash=${encodeURIComponent(
                (s as StrategyRow & { strategyHash?: string }).strategyHash ??
                  s.paramsHash,
              )}&symbol=${encodeURIComponent(
                (s as { symbols?: string[] }).symbols?.[0] ?? "BTCUSDT",
              )}&timeframe=${encodeURIComponent(
                (s as { timeframe?: string }).timeframe ?? "15m",
              )}&sourceResearchJobId=${encodeURIComponent(jobs[0]?.id ?? "")}`}
              data-testid="results-backtest-handoff"
            >
              <Button size="sm">새 기간으로 백테스트</Button>
            </Link>
            {paperAction.kind === "link" && paperAction.href ? (
              <Link href={paperAction.href}>
                <Button size="sm" tone="success">
                  {paperAction.label}
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                tone="success"
                disabled={busyId === s.id}
                onClick={() => void setPaper(s.id)}
              >
                {paperAction.label}
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
  const paperCount = strategies.filter((s) => s.paperActive).length;
  const liveCount = strategies.filter((s) => s.liveActive || s.liveEligible).length;

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

  function archiveJob(jobId: string) {
    setConfirmState({
      title: "탐색 작업 보관",
      description: "이 탐색 작업을 보관할까요? 데이터는 유지되며 기본 이력 목록에서 숨겨집니다.",
      confirmLabel: "보관",
      onConfirm: async () => {
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
      },
    });
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

  function cleanupRawTrials(jobId: string, dryRun: boolean) {
    if (dryRun) {
      void _doCleanupRawTrials(jobId, true);
      return;
    }
    setConfirmState({
      title: "원본 후보 정리",
      description: "보호되지 않은 원본 평가 기록만 삭제합니다. TOP 10·등록·참조 후보는 유지됩니다. 계속할까요?",
      confirmLabel: "정리 실행",
      onConfirm: async () => {
        await _doCleanupRawTrials(jobId, false);
      },
    });
  }

  async function _doCleanupRawTrials(jobId: string, dryRun: boolean) {
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
    setConfirmState({
      title: "탐색 작업 삭제",
      description: `평가 기록 ${impact.trialCount}개 · TOP 10 ${impact.top10Count}개 · ${formatBytes(impact.bytesToRemove)}를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      onConfirm: async () => {
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
      },
    });
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

  function bulkArchiveSelected() {
    const ids = filterBulkArchiveCandidates(
      [...selectedHistoryIds],
      jobsById,
      historyImpact,
    );
    if (ids.length === 0) {
      setMessage("보관 가능한 선택 작업이 없습니다.");
      return;
    }
    setConfirmState({
      title: "선택 작업 보관",
      description: `선택한 ${ids.length}개 탐색 작업을 보관합니다. 데이터는 유지되며 기본 이력에서 숨겨집니다.`,
      confirmLabel: "보관",
      onConfirm: async () => {
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
      },
    });
  }

  function bulkDeleteSelected() {
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
    setConfirmState({
      title: "선택 작업 삭제",
      description: `삭제 가능 ${ids.length}개 · ${formatBytes(totalBytes)} — 영구 삭제합니다. 등록 전략·Backtest·Paper·Live 기록은 유지됩니다.`,
      confirmLabel: "삭제",
      onConfirm: async () => {
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
      },
    });
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

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "rextora.results.libraryShowAll",
        libraryShowAll ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [libraryShowAll]);

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
  }, [selectedJobId, libraryOpen, historyOpen, loading]);

  function goToSection(id: string) {
    const nextTab = sectionToTab(id);
    setResultsTab(nextTab);
    if (id === "results-section-library" || nextTab === "library") {
      setLibraryOpen(true);
    }
    if (id === "results-raw-candidates" || nextTab === "explorer") {
      window.setTimeout(() => {
        const details = document.querySelector<HTMLDetailsElement>(
          '[data-testid="results-raw-candidates"] details',
        );
        if (details) details.open = true;
      }, 0);
    }
    window.setTimeout(() => {
      const el =
        document.getElementById(id) ??
        document.getElementById("results-raw-candidates");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      const focusable = el?.querySelector<HTMLElement>(
        "button, a, input, select, [tabindex]:not([tabindex='-1'])",
      );
      focusable?.focus({ preventScroll: true });
      setActiveSection(id);
    }, 0);
  }

  const statusJobTitle = selectedJob
    ? selectedJob.searchName?.trim() || "이름 없는 작업"
    : "선택된 작업 없음";
  const statusJobState = selectedJob
    ? historyStatusLabelKo(selectedJob.status, {
        completionReason: selectedJob.completionReason ?? null,
      })
    : "작업 없음";
  const statusEvaluated =
    selectedJob?.uniqueEvaluatedCount != null &&
    Number.isFinite(selectedJob.uniqueEvaluatedCount)
      ? selectedJob.uniqueEvaluatedCount.toLocaleString("ko-KR")
      : "없음";
  const statusQualified =
    selectedJob?.qualifiedCount != null &&
    Number.isFinite(selectedJob.qualifiedCount)
      ? selectedJob.qualifiedCount.toLocaleString("ko-KR")
      : "없음";

  return (
    <div className="v3-res-workbench space-y-5" data-testid="results-workbench">
      {message ? (
        <StatusBanner status={deriveMessageStatus(message)} message={message} aria-live="polite" />
      ) : null}
      {error ? (
        <StatusBanner status="error" message={error} aria-live="assertive" />
      ) : null}

      {selectedJobId &&
      (isDemoJobId(selectedJobId) ||
        isDemoSearchName(jobs.find((j) => j.id === selectedJobId)?.searchName) ||
        searchParams.get("demo") === "1") ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2"
          data-testid="results-demo-banner"
        >
          <DemoDataBadge />
          <p className="text-sm text-amber-50">
            이 결과는 데모 데이터입니다. 실전 시장 성과나 실전 주문이 아닙니다.
          </p>
        </div>
      ) : null}

      <nav
        className="v3-res-tabs v3-tabs"
        data-testid="results-section-nav"
        aria-label="결과 섹션 바로가기"
        role="tablist"
      >
        {RESULTS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="v3-tab"
            aria-selected={resultsTab === tab.id}
            onClick={() => goToSection(tab.section)}
            data-testid={`nav-${tab.section}`}
          >
            {tab.label}
          </button>
        ))}
        <span className="v3-res-sr">
          {RESULTS_NAV_ITEMS.filter(
            (item) => !RESULTS_TABS.some((tab) => tab.section === item.id),
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goToSection(item.id)}
              data-testid={`nav-${item.id}`}
            >
              {item.label}
            </button>
          ))}
        </span>
      </nav>

      {resultsTab === "summary" ? (
        <section
          className="v3-res-statusbar"
          data-testid="results-job-statusbar"
          aria-label="작업 요약"
        >
          <div className="v3-res-status-main">
            <span>작업 요약</span>
            <b>
              {statusJobTitle} · {statusJobState}
            </b>
          </div>
          <div className="v3-res-status-cell">
            <span>평가</span>
            <b>{statusEvaluated}</b>
          </div>
          <div className="v3-res-status-cell">
            <span>합격</span>
            <b className={statusQualified !== "없음" ? "ok" : undefined}>
              {statusQualified}
            </b>
          </div>
          <div className="v3-res-status-cell">
            <span>상태</span>
            <button
              type="button"
              className="v3-res-btn-ghost"
              onClick={() => void refreshPrimary()}
            >
              요약 다시 불러오기
            </button>
          </div>
          <div className="v3-res-status-cell">
            <Link
              href={buildSearchCompareHref({ left: selectedJobId })}
              className="v3-res-btn-ghost"
              data-testid="ss-compare-entry"
            >
              탐색 결과 비교
            </Link>
          </div>
          <div className="v3-res-status-cell">
            <SearchJobExportMenu
              jobId={selectedJobId}
              status={selectedJob?.status}
            />
          </div>
        </section>
      ) : null}

      <div hidden={resultsTab !== "advanced"}>
      <details
        className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
        data-testid="results-storage-summary"
        open={storageOpen}
        onToggle={(e) => {
          const open = (e.target as HTMLDetailsElement).open;
          setStorageOpen(open);
          if (open) void refreshStorageSummary();
        }}
      >
        <summary className="cursor-pointer text-sm font-medium text-slate-200">
          저장소·기술 요약
          <span className="ml-2 text-xs font-normal text-slate-500">
            (연구 결과와 별도 · 펼치면 로드)
          </span>
        </summary>
        {storageSummary ? (
          <div className="mt-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="탐색 작업" value={storageSummary.activeJobs} />
              <Metric label="보관됨" value={storageSummary.archivedJobs} />
              <Metric label="평가 기록 파일" value={storageSummary.totalTrialFiles} />
              <Metric
                label="디스크 사용"
                value={formatBytes(storageSummary.totalBytes)}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              TOP 10 {storageSummary.top10Files}개 · 원본 평가 기록 보존 정책{" "}
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
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">저장소 요약을 불러오는 중…</p>
        )}
      </details>
      </div>

      <div hidden={resultsTab !== "summary" && resultsTab !== "explorer"}>
      {loading ? (
        <Card title="이번 탐색 요약" data-testid="current-research-parent-loading">
          <div
            className="space-y-3"
            aria-busy="true"
            aria-label="탐색 결과 불러오는 중"
          >
            <Skeleton className="h-16 w-full rounded-xl" />
            <div className="grid gap-3 sm:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <CurrentResearchResultsPanel
          jobId={selectedJobId}
          onMessage={setMessage}
          presentation={resultsTab === "explorer" ? "explorer" : "summary"}
        />
      )}

      {!selectedJobId && resultsTab === "summary" ? (
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
      </div>

      <div hidden={resultsTab !== "library"}>
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
            등록 전략 {strategies.length}개 · 모의매매 {paperCount}개 · 실전 검토{" "}
            {liveCount}개 · 백테스트 완료 {libraryCategoryCounts.backtested}개 ·
            검토 대기 {libraryCategoryCounts.review}개 · 보관{" "}
            {libraryCategoryCounts.archive}개
          </p>
          {!libraryOpen ? (
            <p className="mt-2 text-xs text-slate-500">
              이미 등록된 전략입니다. 이번 탐색의 통과 후보와는 별도입니다.
            </p>
          ) : (
            <>
              <p className="mb-3 mt-2 text-xs text-slate-400">
                이미 등록된 전략입니다. 이번 탐색의 통과 후보와는 별도입니다.
                기본 {LIBRARY_PREVIEW_LIMIT}개만 미리보기합니다.
              </p>
              <label className="mb-3 block">
                <span className="rextora-label mb-1 block">전략 검색</span>
                <input
                  type="search"
                  className="rextora-input"
                  placeholder="표시 이름으로 검색"
                  value={librarySearch}
                  onChange={(event) => {
                    setLibrarySearch(event.target.value);
                    setLibraryShowAll(false);
                  }}
                  data-testid="library-search"
                />
              </label>
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
              {libraryLoadState === "loading" ? (
                <div className="space-y-2" aria-busy="true" aria-label="전략 라이브러리 불러오는 중">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState message="표시할 전략이 없습니다." />
              ) : (
                <div className="space-y-2" data-testid="library-compact-list">
                  {(libraryShowAll
                    ? filtered
                    : filtered.slice(0, LIBRARY_PREVIEW_LIMIT)
                  ).map((s) => {
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
                        className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                        data-testid={`result-card-${s.id}`}
                      >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-100">
                            {(s as {
                              displayAlias?: string | null;
                              displayName?: string | null;
                            }).displayAlias ||
                              (s as { displayName?: string | null }).displayName ||
                              s.name}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                            <Badge
                              tone={metricState === "합격" ? "success" : "muted"}
                              className={
                                metricState === "합격"
                                  ? "v3-res-badge-qualified"
                                  : undefined
                              }
                            >
                              {metricState}
                            </Badge>
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
                            {provenance.searchFamily ? (
                              <span>패밀리 {provenance.searchFamily}</span>
                            ) : null}
                            {provenance.pattern ? (
                              <span>패턴 {provenance.pattern}</span>
                            ) : null}
                            {provenance.leverage ? (
                              <span>레버리지 {provenance.leverage}</span>
                            ) : null}
                            <span>{paperStatusLabel(paperSession, s)}</span>
                          </div>
                          <details className="mt-1 text-xs text-slate-500">
                            <summary className="cursor-pointer">개발자 정보</summary>
                            <p className="mt-1 break-all">전략 ID: {s.id}</p>
                            <p className="break-all">저장 이름: {s.name}</p>
                            {provenance.sourceResearchJobId ? (
                              <p className="break-all">
                                연구 ID: {provenance.sourceResearchJobId}
                              </p>
                            ) : null}
                          </details>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/backtest?strategyId=${encodeURIComponent(s.id)}&strategyHash=${encodeURIComponent(
                              (s as StrategyRow & { strategyHash?: string })
                                .strategyHash ?? s.paramsHash,
                            )}`}
                            data-testid="results-row-backtest-handoff"
                          >
                            <Button size="sm">백테스트</Button>
                          </Link>
                          <div className="relative">
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              aria-expanded={openMenuId === s.id}
                              aria-haspopup="true"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === s.id ? null : s.id);
                              }}
                            >
                              더보기
                            </Button>
                            {openMenuId === s.id ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl"
                                role="menu"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                                  disabled={
                                    busyId === s.id
                                  }
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    void renameDisplay(s.id);
                                  }}
                                  data-testid={`library-rename-${s.id}`}
                                >
                                  이름 변경
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                                  disabled={
                                    busyId === s.id
                                  }
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    void setLibraryArchive(
                                      s.id,
                                      !isLibraryArchived(s),
                                    );
                                  }}
                                  data-testid={`library-archive-${s.id}`}
                                >
                                  {isLibraryArchived(s) ? "복원" : "보관"}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                                  disabled={busyId === s.id}
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    void loadRelatedRuns(s.id);
                                  }}
                                  data-testid={`library-related-runs-${s.id}`}
                                >
                                  {runsPanelStrategyId === s.id
                                    ? "실행 닫기"
                                    : "관련 실행 보기"}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                                  disabled={
                                    busyId === s.id
                                  }
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    void updateAutomaticAlias(s.id, "restore_alias");
                                  }}
                                  data-testid={`library-restore-alias-${s.id}`}
                                >
                                  별칭 복원
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                                  disabled={
                                    busyId === s.id
                                  }
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    void updateAutomaticAlias(s.id, "regenerate_auto_name");
                                  }}
                                  data-testid={`library-regenerate-name-${s.id}`}
                                >
                                  자동 이름 재생성
                                </button>
                                {(() => {
                                  const action = paperActionForStrategy(
                                    paperSession,
                                    s.id,
                                  );
                                  if (action.kind === "link" && action.href) {
                                    return (
                                      <Link
                                        href={action.href}
                                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                                        onClick={() => setOpenMenuId(null)}
                                      >
                                        {action.label}
                                      </Link>
                                    );
                                  }
                                  return (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                                      disabled={
                                        busyId === s.id
                                      }
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        void setPaper(s.id);
                                      }}
                                    >
                                      {action.label}
                                    </button>
                                  );
                                })()}
                                <div className="my-1 border-t border-slate-700/60" />
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="w-full rounded-md px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-950/50 disabled:opacity-40"
                                  disabled={
                                    busyId === s.id ||
                                    Boolean(s.paperActive) ||
                                    Boolean(s.liveActive)
                                  }
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    void deleteStrategy(s.id);
                                  }}
                                  data-testid={`library-delete-${s.id}`}
                                >
                                  전략 삭제
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {runsPanelStrategyId === s.id ? (
                        <div
                          className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                          data-testid={`library-runs-panel-${s.id}`}
                        >
                          <p className="mb-2 text-sm font-medium text-slate-200">
                            관련 백테스트 실행
                          </p>
                          {relatedRunsBusy ? (
                            <div className="space-y-2">
                              <Skeleton className="h-8 w-full" />
                              <Skeleton className="h-8 w-full" />
                            </div>
                          ) : relatedRuns.length === 0 ? (
                            <p className="text-sm text-slate-400">
                              저장된 실행이 없습니다.
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[720px] text-left text-sm">
                                <thead className="text-xs text-slate-400">
                                  <tr>
                                    <th className="px-2 py-1">실행</th>
                                    <th className="px-2 py-1">기간</th>
                                    <th className="px-2 py-1">수익</th>
                                    <th className="px-2 py-1">MDD</th>
                                    <th className="px-2 py-1">거래</th>
                                    <th className="px-2 py-1">작업</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {relatedRuns.map((run) => (
                                    <tr
                                      key={run.id}
                                      className="border-t border-slate-900"
                                    >
                                      <td className="px-2 py-1 font-mono text-xs">
                                        {run.id}
                                      </td>
                                      <td className="px-2 py-1 text-xs">
                                        {run.report?.fromDate ?? "?"} →{" "}
                                        {run.report?.toDate ?? "?"}
                                      </td>
                                      <td className="px-2 py-1">
                                        {run.report?.totalReturn == null
                                          ? "—"
                                          : formatPct(run.report.totalReturn)}
                                      </td>
                                      <td className="px-2 py-1">
                                        {run.report?.mdd == null
                                          ? "—"
                                          : formatPct(run.report.mdd)}
                                      </td>
                                      <td className="px-2 py-1">
                                        {run.report?.tradeCount ?? "—"}
                                      </td>
                                      <td className="px-2 py-1">
                                        <div className="flex flex-wrap gap-1">
                                          <Link
                                            href={`/backtest?strategyId=${encodeURIComponent(s.id)}&runId=${encodeURIComponent(run.id)}`}
                                          >
                                            <Button size="sm" variant="outline">
                                              열기
                                            </Button>
                                          </Link>
                                          <Button
                                            size="sm"
                                            tone="muted"
                                            disabled={relatedRunsBusy}
                                            onClick={() =>
                                              void deleteRelatedRun(run.id, s.id)
                                            }
                                          >
                                            삭제
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                    );
                  })}
                  {filtered.length > LIBRARY_PREVIEW_LIMIT ? (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLibraryShowAll((v) => !v)}
                        data-testid="library-show-all-toggle"
                        aria-expanded={libraryShowAll}
                      >
                        {libraryShowAll
                          ? "접기"
                          : `전체 보기 (${filtered.length})`}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </Card>
      </section>
      </div>

      <div hidden={resultsTab !== "advanced"}>
      <section id="results-section-raw-mgmt" data-testid="results-raw-trial-mgmt">
        <Card title="원본 후보 관리">
          <p className="mb-3 text-sm text-slate-400">
            원본 평가 기록은 재현용 증거입니다. 기본 화면에는 TOP 10만 표시하며, 정리는
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
                  <Metric label="유지 기록" value={rawPreview.retainedTrialCount} />
                  <Metric label="보호 기록" value={rawPreview.protectedTrialCount} />
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
                  선택한 연구의 원본 평가 기록 정리 미리보기를 실행하세요.
                </p>
              )}
            </div>
          ) : (
            <EmptyState message="연구를 선택한 뒤 원본 후보를 관리하세요." />
          )}
        </Card>
      </section>
      </div>

      <div hidden={resultsTab !== "history"}>
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
                {historyOpen ? "미리보기만" : "전체 탐색 이력 보기"}
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
                  .slice(
                    0,
                    historyOpen ? historyJobs.length : HISTORY_PREVIEW_LIMIT,
                  )
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
                                {j.rankingGroups && j.rankingGroups.length > 0
                                  ? " · 2개 평가 그룹"
                                  : j.bestScore != null &&
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
                          <div className="flex flex-wrap items-start gap-2">
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
                            )}
                            <details className="v3-res-more">
                              <summary>작업</summary>
                              <div className="v3-res-more-body">
                                {historyView === "archived" ? null : (
                                  <>
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
                            </details>
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
                              작업 {impact.researchJobCount} · 평가 기록{" "}
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
              {!historyOpen && historyJobs.length > HISTORY_PREVIEW_LIMIT ? (
                <p className="mt-2 text-xs text-slate-500">
                  최근 {HISTORY_PREVIEW_LIMIT}건 미리보기 · 전체{" "}
                  {historyJobs.length}건은 「전체 탐색 이력 보기」로 확인
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
      </div>

      {/* ── Confirm dialog (generic) ───────────────────────────────────── */}
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel={confirmState?.confirmLabel ?? "확인"}
        loading={confirmBusy}
        onConfirm={() => {
          if (confirmState) void runConfirmedAction(confirmState);
        }}
        onCancel={() => setConfirmState(null)}
      />

      {/* ── Rename dialog ─────────────────────────────────────────────── */}
      <RenameDialog
        open={renameState !== null}
        title="표시 이름 변경"
        description="전략 ID·파라미터 해시는 변경되지 않습니다."
        initialValue={renameState?.currentValue ?? ""}
        placeholder="표시 이름(별칭) 입력"
        loading={renameBusy}
        onConfirm={(next) => {
          if (renameState) void runRenameAction(renameState, next);
        }}
        onCancel={() => setRenameState(null)}
      />

      {/* ── Strategy delete 3-way choice dialog ───────────────────────── */}
      {deleteChoiceState && (
        <div
          className="rextora-dialog-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteChoiceBusy)
              setDeleteChoiceState(null);
          }}
        >
          <div
            className="rextora-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="rx-delete-choice-title"
          >
            <h3 id="rx-delete-choice-title" className="rextora-section-title mb-2 text-slate-100">
              전략 삭제 — 참조 있음
            </h3>
            <p className="rextora-body mb-1 text-slate-300">{deleteChoiceState.reasonKo}</p>
            <p className="rextora-helper mb-4 text-slate-400">
              백테스트 참조 {deleteChoiceState.backtestCount}개 · 모의매매 참조{" "}
              {deleteChoiceState.paperCount}개
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                disabled={deleteChoiceBusy}
                onClick={() => {
                  setDeleteChoiceState(null);
                  void setLibraryArchive(deleteChoiceState.strategyId, true);
                }}
              >
                보관 (참조 유지, 이력에서 숨김)
              </Button>
              <Button
                tone="danger"
                loading={deleteChoiceBusy}
                onClick={async () => {
                  const id = deleteChoiceState.strategyId;
                  setDeleteChoiceBusy(true);
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
                    setDeleteChoiceState(null);
                    await refresh();
                  } finally {
                    setDeleteChoiceBusy(false);
                  }
                }}
              >
                연결 해제 후 삭제
              </Button>
              <Button
                variant="ghost"
                disabled={deleteChoiceBusy}
                onClick={() => setDeleteChoiceState(null)}
              >
                취소
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
