"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, ConfirmDialog } from "@/components/ui/primitives";
import { useAuth } from "@/components/rextora/auth/AuthSessionProvider";
import { V3Card } from "@/components/rextora/v3/V3Card";
import { V3PermissionGate } from "@/components/rextora/v3/V3PermissionGate";
import {
  LIVE_ORDERS_BLOCKED_LABEL,
} from "@/src/lib/rextora/live/liveGateOperatorPresentation";
import {
  cancelStrategySearchJob,
  createStrategySearchJob,
  fetchStrategySearchRecoveryStatus,
  getStrategySearchJobWithRetry,
  isOperationallyActiveStatus,
  listStrategySearchJobs,
  listStrategySearchTrials,
  pauseStrategySearchJob,
  promoteStrategySearchTrials,
  resumeStrategySearchJob,
  startStrategySearchJob,
} from "./apiClient";
import { STRATEGY_SEARCH_HISTORY_RETENTION_NOTE } from "./JobList";
import { buildSearchCompareHref } from "./searchJobComparison";
import {
  InterruptedRecoverySection,
  RECOVERY_COLLAPSED_PREVIEW_COUNT,
} from "./InterruptedRecoverySection";
import {
  RECOVERY_VISIBLE_PAGE_SIZE,
  discoverInterruptedRecoveryJobs,
} from "./interruptedRecoveryDiscovery";
import { ExecutionControls } from "./ExecutionControls";
import { displayJobSearchTitle, jobSearchNameTooltip } from "./jobDisplayName";
import {
  formatErrorDetails,
  mapStrategySearchErrorCode,
} from "./errorMessages";
import { createDefaultOperatorFormState } from "./formDefaults";
import { buildCreateBodyIfValid, type FormFieldError } from "./formValidation";
import { SetupResultsCollapsible } from "./guided/SetupResultsCollapsible";
import {
  isGuidedSetupActive,
  resolveStrategySearchPresentationMode,
} from "./guided/strategySearchPresentation";
import { JobCreateForm } from "./JobCreateForm";
import {
  loadOperatorFormSession,
  saveOperatorFormSession,
} from "./operatorFormSession";
import {
  type QualifiedStrategyCardModel,
  type RegistrationStateUi,
  type RegistrationSummary,
} from "./QualifiedResultsPanel";
import { ResearchCompletionPanel } from "./ResearchCompletionPanel";
import { ResearchRankingGroups } from "./ResearchRankingGroups";
import { SearchStatusCard } from "./SearchStatusCard";
import { StrategySearchClientError } from "./types";
import type {
  StrategySearchJobDetail,
  StrategySearchJobSummary,
  StrategySearchTrialRow,
  StrategySearchTrialsPage,
} from "./types";
import type { StrategySearchOperatorFormState as FormState } from "./formDefaults";
import { cleanStrategyDisplayName } from "./displayNames";
import {
  completionReasonLabelKo,
  formatCount,
  historyStatusLabelKo,
  researchStatusLabelKo,
  isSearchCancellationPending,
  searchCancellationPendingCopy,
} from "./formatters";
import { hasAuthoritativeRankingGroups } from "@/src/lib/rextora/researchRankingReadModel";
import {
  normalizeResultRankPanel,
  resolveDefaultResultRankPanel,
  type StrategySearchResultRankPanel,
} from "./resultRankPanel";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import {
  liveTop10EmptyPresentation,
  presentSearchFamilyLabelKo,
  visualizedSearchSpaceIds,
} from "./visual/searchScopeVisual";
import { StrategySearchRunningVisual, RunningConfigSummary } from "./visual/StrategySearchRunningVisual";
import {
  buildRunningConfigSummary,
  shouldRenderRunningVisual,
} from "./visual/runningVisualModel";
import { isValidCompletedBacktestHref } from "./completionCustomerView";

/** Server operatorPlan owns runUntilQualified / multi-space progression. */
const OPERATOR_RUN_UNTIL_QUALIFIED = true as const;
void OPERATOR_RUN_UNTIL_QUALIFIED;

const DETAIL_POLL_MS = 2000;
/** Faster detail refresh only while cancel_requested / cancelling. */
const DETAIL_POLL_CANCEL_MS = 400;
const LIST_POLL_MS = 8000;
/** When no operationally active jobs, list refresh is much less frequent. */
const LIST_POLL_IDLE_MS = 30_000;
const SELECTED_JOB_LS_KEY = "rextora.strategySearch.selectedJobId";

function syncJobIdToUrl(jobId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (jobId) url.searchParams.set("jobId", jobId);
  else url.searchParams.delete("jobId");
  window.history.replaceState(null, "", url.toString());
}

function persistSelectedJobId(jobId: string | null) {
  if (typeof window === "undefined") return;
  if (jobId) localStorage.setItem(SELECTED_JOB_LS_KEY, jobId);
  else localStorage.removeItem(SELECTED_JOB_LS_KEY);
}

function readInitialJobId(
  bootJobId: string | null,
): string | null {
  if (bootJobId) return bootJobId;
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SELECTED_JOB_LS_KEY);
}

function toUserError(err: unknown): { message: string; detail: string | null } {
  if (err instanceof StrategySearchClientError) {
    return {
      message: mapStrategySearchErrorCode(err.code, err.message),
      detail: formatErrorDetails(err.code, err.details),
    };
  }
  return {
    message: err instanceof Error ? err.message : "알 수 없는 오류",
    detail: null,
  };
}

function mapRegistrationState(
  trial: StrategySearchTrialRow,
): RegistrationStateUi {
  if (trial.registrationState === "duplicate") return "duplicate";
  if (trial.registrationState === "registration_failed") {
    return "registration_failed";
  }
  if (
    trial.registrationState === "registered" ||
    trial.registeredStrategyId
  ) {
    return "registered";
  }
  return "not_registered";
}

function trialToCard(
  trial: StrategySearchTrialRow,
  detail: StrategySearchJobDetail,
): QualifiedStrategyCardModel {
  const registrationState = mapRegistrationState(trial);
  const status =
    registrationState === "duplicate"
      ? "이미 등록됨"
      : registrationState === "registered"
        ? "등록됨"
        : registrationState === "registration_failed"
          ? "등록 실패"
          : "미등록";
  return {
    key: trial.paramsHash || `${trial.iteration}`,
    name: cleanStrategyDisplayName(
      trial.readableName?.trim() || `합격 전략 #${trial.iteration}`,
    ),
    strategyType: trial.strategyFamilyLabelKo?.trim() || "합격",
    market: detail.symbols?.[0] ?? null,
    timeframe: detail.timeframe ?? null,
    trades: trial.trades ?? null,
    winRate: trial.winRate ?? null,
    totalReturn: trial.totalReturn ?? null,
    mdd: trial.mdd ?? null,
    sharpe: trial.sharpe ?? null,
    profitFactor: trial.profitFactor ?? null,
    score: trial.score ?? null,
    status,
    registrationState,
    createdAt: detail.updatedAt ?? null,
    strategyId: trial.registeredStrategyId ?? null,
    iteration: trial.iteration,
    jobId: detail.id,
    finalPass: trial.passed,
    stressPass: trial.stressPassed ?? null,
    jitterPass: trial.jitterPassed ?? null,
    jitterEnabled: trial.jitterEnabled ?? null,
    params: trial.params ?? null,
  };
}

function readSearchQueryBootstrap(): {
  jobId: string | null;
  formPatch: Partial<FormState> | null;
} {
  if (typeof window === "undefined") {
    return { jobId: null, formPatch: null };
  }
  const params = new URLSearchParams(window.location.search);
  const basis = params.get("researchBasis");
  const followUp = params.get("followUp");
  const jobId = params.get("jobId");
  const patch: Partial<FormState> = {};
  if (
    basis === "paper" ||
    basis === "live" ||
    basis === "backtest" ||
    basis === "fresh"
  ) {
    patch.researchBasis =
      basis === "paper"
        ? "paper_supplement"
        : basis === "live"
          ? "live_supplement"
          : basis === "backtest"
            ? "backtest_supplement"
            : "fresh";
  }
  if (followUp) {
    patch.researchBasis = "improve_best";
    patch.searchName = `후속 탐색 · ${followUp.slice(0, 12)}`;
  }
  return {
    jobId,
    formPatch: Object.keys(patch).length ? patch : null,
  };
}

export function StrategySearchWorkbench() {
  const { can } = useAuth();
  const canRunResearch = can("research:run");
  // Hydration-safe: never read window/localStorage/sessionStorage during first render.
  const [form, setForm] = useState<FormState>(() =>
    createDefaultOperatorFormState(),
  );
  const [formErrors, setFormErrors] = useState<FormFieldError[]>([]);
  const [creating, setCreating] = useState(false);
  const [clientReady, setClientReady] = useState(false);

  const [jobs, setJobs] = useState<StrategySearchJobSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [recoveryJobs, setRecoveryJobs] = useState<StrategySearchJobSummary[]>(
    [],
  );
  const [recoveryVisibleCount, setRecoveryVisibleCount] = useState(
    RECOVERY_VISIBLE_PAGE_SIZE,
  );
  const [recoveryListExpanded, setRecoveryListExpanded] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StrategySearchJobDetail | null>(null);
  const [trials, setTrials] = useState<StrategySearchTrialsPage | null>(null);
  const [jobMissing, setJobMissing] = useState(false);
  const [missingJobId, setMissingJobId] = useState<string | null>(null);
  const [recoveryBanner, setRecoveryBanner] = useState<string | null>(null);

  const [actionPending, setActionPending] = useState(false);
  const [pendingActionJobId, setPendingActionJobId] = useState<string | null>(
    null,
  );
  const [registering, setRegistering] = useState(false);
  const [completionRegisterIter, setCompletionRegisterIter] = useState<
    number | null
  >(null);
  const [registrationSummary, setRegistrationSummary] =
    useState<RegistrationSummary | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    detail: string | null;
    tone: "error" | "info" | "success";
  } | null>(null);
  const [outcomeViewPrimary, setOutcomeViewPrimary] = useState(false);
  const [rankPanel, setRankPanel] = useState<StrategySearchResultRankPanel>(
    "top10",
  );
  const [runningConfigOpen, setRunningConfigOpen] = useState(false);
  const rankPanelTouchedRef = useRef(false);

  const [strategiesSavedHint, setStrategiesSavedHint] = useState(false);
  const [generationMeta, setGenerationMeta] = useState<{
    generationCount: number;
    latestWeaknessKo: string | null;
    latestAdjustmentKo: string | null;
  } | null>(null);

  const selectedIdRef = useRef<string | null>(null);
  const bootDoneRef = useRef(false);
  const HISTORY_PAGE = STRATEGY_SEARCH_HISTORY_RETENTION_NOTE;

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    setRunningConfigOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (!detail) return;
    if (isSearchCancellationPending(detail.status)) return;
    setFeedback((prev) => {
      if (!prev) return prev;
      const pending =
        prev.message === "중지 요청 중" ||
        prev.message === "안전하게 탐색을 종료하고 있습니다.";
      if (!pending) return prev;
      if (
        detail.status === "cancelled" ||
        detail.status === "completed" ||
        detail.status === "failed" ||
        detail.status === "paused"
      ) {
        return null;
      }
      return prev;
    });
  }, [detail?.status]);

  useEffect(() => {
    if (!clientReady) return;
    const timer = window.setTimeout(() => {
      saveOperatorFormSession(form);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form, clientReady]);

  // Reload form session after external tab focus or hash navigation refresh.
  useEffect(() => {
    const syncFromSession = () => {
      if (!bootDoneRef.current) return;
      const stored = loadOperatorFormSession();
      if (!stored) return;
      setForm((prev) => ({ ...prev, ...stored }));
    };
    window.addEventListener("focus", syncFromSession);
    window.addEventListener("pageshow", syncFromSession);
    return () => {
      window.removeEventListener("focus", syncFromSession);
      window.removeEventListener("pageshow", syncFromSession);
    };
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const data = await listStrategySearchJobs({
        limit: HISTORY_PAGE,
        offset: 0,
      });
      setJobs(data.slice(0, HISTORY_PAGE));
      setListError(null);
    } catch (err) {
      const mapped = toUserError(err);
      setListError(mapped.message);
    } finally {
      setListLoading(false);
    }
  }, [HISTORY_PAGE]);

  const refreshRecovery = useCallback(async (signal?: AbortSignal) => {
    try {
      const rows = await discoverInterruptedRecoveryJobs(
        listStrategySearchJobs,
        signal,
      );
      if (signal?.aborted) return;
      setRecoveryJobs(rows);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setRecoveryJobs([]);
    } finally {
      if (!signal?.aborted) setRecoveryLoading(false);
    }
  }, []);

  // Hard stop: never leave "연구 목록 불러오는 중…" forever.
  useEffect(() => {
    if (!listLoading) return;
    const t = window.setTimeout(() => {
      setListLoading(false);
      setListError((prev) =>
        prev ?? "연구 목록 응답이 지연됩니다. 새로고침하거나 다시 시도하세요.",
      );
    }, 15_000);
    return () => window.clearTimeout(t);
  }, [listLoading]);

  // Hard stop: never leave job detail blank forever after selection.
  useEffect(() => {
    if (!selectedId || detail || jobMissing) return;
    const t = window.setTimeout(() => {
      if (selectedIdRef.current !== selectedId) return;
      setFeedback({
        message: "연구 상세 응답이 지연됩니다",
        detail: "새로고침하거나 목록에서 다시 선택하세요.",
        tone: "error",
      });
      // Terminate loading UI — empty/error is not infinite spinner.
      setJobMissing(true);
      setMissingJobId(selectedId);
      setDetail(null);
    }, 20_000);
    return () => window.clearTimeout(t);
  }, [selectedId, detail, jobMissing]);

  const refreshTrials = useCallback(async (jobId: string) => {
    try {
      const page = await listStrategySearchTrials(jobId, {
        limit: 200,
        offset: 0,
        passedOnly: true,
      });
      if (selectedIdRef.current === jobId) setTrials(page);
      return page;
    } catch {
      return null;
    }
  }, []);

  const clearJobSelection = useCallback(() => {
    selectedIdRef.current = null;
    setSelectedId(null);
    setDetail(null);
    setTrials(null);
    setGenerationMeta(null);
    persistSelectedJobId(null);
    syncJobIdToUrl(null);
  }, []);

  const handleJobNotFound = useCallback(
    (jobId: string) => {
      clearJobSelection();
      setJobMissing(true);
      setMissingJobId(jobId);
      setFeedback(null);
    },
    [clearJobSelection],
  );

  const refreshDetail = useCallback(
    async (jobId: string, opts?: { retryNotFound?: boolean }) => {
      try {
        const data = await getStrategySearchJobWithRetry(jobId, {
          retryNotFound: opts?.retryNotFound,
        });
        if (selectedIdRef.current !== jobId) return data;
        setJobMissing(false);
        setMissingJobId(null);
        setDetail(data);
        await refreshTrials(jobId);
        try {
          const gRes = await fetch(
            `/api/rextora/strategy-search/${encodeURIComponent(jobId)}/generations`,
          );
          const gJson = await gRes.json();
          if (selectedIdRef.current === jobId && gJson?.data) {
            const latest = gJson.data.latestWeakness;
            const finding = latest?.findings?.[0]?.messageKo ?? null;
            const adj =
              latest?.adjustment?.actions?.[0]?.reasonKo ??
              gJson.data.latest?.adjustmentPlan?.actions?.[0]?.reasonKo ??
              null;
            setGenerationMeta({
              generationCount: gJson.data.generationCount ?? 0,
              latestWeaknessKo: finding,
              latestAdjustmentKo: adj,
            });
          }
        } catch {
          /* generations optional for older jobs */
        }
        return data;
      } catch (err) {
        if (
          err instanceof StrategySearchClientError &&
          err.code === "JOB_NOT_FOUND"
        ) {
          handleJobNotFound(jobId);
          return null;
        }
        const mapped = toUserError(err);
        setFeedback({ ...mapped, tone: "error" });
        return null;
      }
    },
    [handleJobNotFound, refreshTrials],
  );

  const hasActiveJobs = useMemo(
    () =>
      jobs.some((j) =>
        isOperationallyActiveStatus(j.status, j.executionActive),
      ),
    [jobs],
  );

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    let timer: number | undefined;
    const schedule = (ms: number) => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (typeof document !== "undefined" && document.hidden) {
          schedule(ms);
          return;
        }
        await refreshList();
        if (cancelled) return;
        await refreshRecovery(ac.signal);
        if (cancelled) return;
        schedule(hasActiveJobs ? LIST_POLL_MS : LIST_POLL_IDLE_MS);
      }, ms);
    };
    const boot = window.setTimeout(() => {
      void refreshList()
        .then(() => (cancelled ? undefined : refreshRecovery(ac.signal)))
        .then(() => {
          if (!cancelled) schedule(hasActiveJobs ? LIST_POLL_MS : LIST_POLL_IDLE_MS);
        });
    }, 0);
    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(boot);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [refreshList, refreshRecovery, hasActiveJobs]);

  const pollActive =
    !!selectedId &&
    !!detail &&
    isOperationallyActiveStatus(detail.status, detail.executionActive);

  useEffect(() => {
    if (!pollActive || !selectedId) return;
    const jobId = selectedId;
    const tick = () => {
      void (async () => {
        if (typeof document !== "undefined" && document.hidden) return;
        const data = await refreshDetail(jobId);
        if (!data) {
          await refreshList();
          return;
        }
        if (
          data.status === "completed" ||
          data.status === "cancelled" ||
          data.status === "failed"
        ) {
          const reason = completionReasonLabelKo(data.completionReason ?? null);
          if (data.status === "completed") {
            setFeedback({
              message: reason
                ? `AI 연구 완료 · ${reason}`
                : "AI 연구 완료",
              detail:
                (data.qualifiedCount ?? data.statistics?.passed ?? 0) > 0
                  ? "합격 전략을 확인한 뒤 전략 관리에 등록하세요."
                  : "목표를 충족한 전략이 없습니다. 탐색 설정을 조정해 보세요.",
              tone: "info",
            });
          } else if (data.status === "cancelled") {
            setFeedback({
              message: researchStatusLabelKo("cancelled"),
              detail: null,
              tone: "info",
            });
          } else {
            setFeedback((prev) => {
              if (
                prev &&
                (prev.message === "중지 요청 중" ||
                  prev.message ===
                    "안전하게 탐색을 종료하고 있습니다.")
              ) {
                return null;
              }
              return prev;
            });
          }
          // Terminal: one final list sync, then detail polling stops via pollActive.
          await refreshList();
          return;
        }
        // While active, refresh list less often than detail (detail already ticks).
      })();
    };
    tick();
    const cancelTransition =
      detail?.status === "cancel_requested" ||
      detail?.status === "cancelling";
    const pollMs = cancelTransition ? DETAIL_POLL_CANCEL_MS : DETAIL_POLL_MS;
    const timer = window.setInterval(tick, pollMs);
    return () => window.clearInterval(timer);
  }, [pollActive, selectedId, detail?.status, refreshDetail, refreshList]);

  function handleSelect(id: string) {
    selectedIdRef.current = id;
    rankPanelTouchedRef.current = false;
    const listed = jobs.find((job) => job.id === id);
    if (listed) {
      const groupAwareListed = hasAuthoritativeRankingGroups(listed);
      setRankPanel(
        normalizeResultRankPanel({
          current: resolveDefaultResultRankPanel({
            status: listed.status,
            groupAware: groupAwareListed,
            hasVisibleLiveTop10: false,
          }),
          groupAware: groupAwareListed,
        }),
      );
    }
    setSelectedId(id);
    setJobMissing(false);
    setMissingJobId(null);
    setFeedback(null);
    setStrategiesSavedHint(false);
    setRegistrationSummary(null);
    setTrials(null);
    setDetail(null);
    setGenerationMeta(null);
    persistSelectedJobId(id);
    syncJobIdToUrl(id);
    void refreshDetail(id);
  }

  // Client-only bootstrap: session form + URL/localStorage jobId (hydration-safe).
  useEffect(() => {
    if (bootDoneRef.current) return;
    bootDoneRef.current = true;
    const boot = readSearchQueryBootstrap();
    const stored = loadOperatorFormSession();
    setForm({
      ...createDefaultOperatorFormState(),
      ...(stored ?? {}),
      ...(boot.formPatch ?? {}),
    });
    setClientReady(true);
    const jobId = readInitialJobId(boot.jobId);
    if (jobId) {
      // Defer selection so bootstrap setState is not nested in the same turn.
      window.setTimeout(() => {
        handleSelect(jobId);
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!detail || jobMissing) return;
    const groupAwareNow = hasAuthoritativeRankingGroups(detail);
    setRankPanel((current) => {
      const normalized = normalizeResultRankPanel({
        current,
        groupAware: groupAwareNow,
      });
      if (normalized !== current) return normalized;
      if (rankPanelTouchedRef.current) return current;
      const next = resolveDefaultResultRankPanel({
        status: detail.status,
        groupAware: groupAwareNow,
        hasVisibleLiveTop10:
          !groupAwareNow && (detail.liveTop10?.entries.length ?? 0) > 0,
      });
      return current === next ? current : next;
    });
  }, [detail, jobMissing]);

  useEffect(() => {
    let cancelled = false;
    void fetchStrategySearchRecoveryStatus()
      .then((data) => {
        if (cancelled) return;
        const recovered = data.recordRecovered ?? [];
        if (recovered.length === 0) return;
        setRecoveryBanner(
          `서버 재시작 후 ${recovered.length}건의 탐색 기록을 복구했습니다. 일시정지 상태로 복원되었으니 재개 여부를 확인하세요.`,
        );
      })
      .catch(() => {
        /* recovery probe is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash === "#ss-section-engine") {
        document
          .getElementById("ss-section-engine")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  async function handleRegister(iterations: number[]) {
    if (!selectedId || iterations.length === 0 || registering) return;
    setRegistering(true);
    setFeedback(null);
    try {
      const res = await promoteStrategySearchTrials(selectedId, {
        iterations,
      });
      const promoted = res.promoted ?? [];
      // Single-iteration API may return a flat result instead of promoted[].
      const rows =
        promoted.length > 0
          ? promoted
          : res.strategyId
            ? [
                {
                  strategyId: res.strategyId,
                  alreadyExists: !!res.alreadyExists,
                  registrationState: res.registrationState,
                },
              ]
            : [];

      let registered = 0;
      let duplicate = 0;
      let failed = 0;
      for (const p of rows) {
        const state =
          p.registrationState ??
          (p.alreadyExists ? "duplicate" : "registered");
        if (state === "duplicate" || p.alreadyExists) duplicate += 1;
        else if (state === "registration_failed") failed += 1;
        else registered += 1;
      }
      if (rows.length === 0 && iterations.length > 0) {
        failed = iterations.length;
      }

      setRegistrationSummary({ registered, duplicate, failed });
      if (registered > 0) {
        setStrategiesSavedHint(true);
        setFeedback({
          message: `등록 완료 · 전략 ${registered}건`,
          detail:
            duplicate > 0 || failed > 0
              ? `이미 등록됨 ${duplicate} · 실패 ${failed}`
              : "전략 관리에서 이어서 확인할 수 있습니다.",
          tone: "success",
        });
      } else if (duplicate > 0 && failed === 0) {
        setFeedback({
          message: "이미 등록된 전략입니다.",
          detail: "등록 버튼은 숨겨지고 전략 열기로 이동합니다.",
          tone: "info",
        });
      } else if (failed > 0) {
        setFeedback({
          message: "전략 등록에 실패했습니다.",
          detail: `실패 ${failed}건`,
          tone: "error",
        });
      }

      await refreshTrials(selectedId);
    } catch (err) {
      const mapped = toUserError(err);
      setFeedback({ ...mapped, tone: "error" });
      setRegistrationSummary({
        registered: 0,
        duplicate: 0,
        failed: iterations.length,
      });
    } finally {
      setRegistering(false);
    }
  }

  async function handleRegisterForBacktest(iteration: number) {
    if (!selectedId || registering) return;
    if (!Number.isInteger(iteration)) {
      setFeedback({
        message: "백테스트로 넘길 추천 후보가 없습니다.",
        detail: "자격 미통과 최고 점수 후보는 등록하지 않습니다.",
        tone: "error",
      });
      return;
    }
    setRegistering(true);
    setFeedback(null);
    try {
      const res = await promoteStrategySearchTrials(selectedId, {
        mode: "register_for_backtest",
        iteration,
      });
      const strategyId = (res.strategyId ?? "").trim();
      const href =
        isValidCompletedBacktestHref(res.backtestHref) && res.backtestHref
          ? res.backtestHref
          : null;
      const hrefStrategyId = href
        ? new URL(href, "https://rextora.local").searchParams.get("strategyId")
        : null;
      if (!strategyId || !href || hrefStrategyId !== strategyId) {
        setFeedback({
          message: "백테스트로 이동하지 못했습니다.",
          detail: "등록 결과는 확인했지만 전략 ID가 없어 백테스트를 열지 않습니다.",
          tone: "error",
        });
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(href);
      }
    } catch (err) {
      const mapped = toUserError(err);
      setFeedback({ ...mapped, tone: "error" });
    } finally {
      setRegistering(false);
    }
  }

  async function handleStartSearch() {
    setOutcomeViewPrimary(false);
    const validated = buildCreateBodyIfValid(form);
    if (!validated.ok) {
      setFormErrors(validated.errors);
      setFeedback({
        message: "입력값을 확인하세요.",
        detail: validated.errors.map((e) => e.message).join(" · "),
        tone: "error",
      });
      return;
    }
    setCreating(true);
    setFeedback(null);
    setFormErrors([]);
    setStrategiesSavedHint(false);
    setRegistrationSummary(null);
    try {
      const created = await createStrategySearchJob(validated.body);
      selectedIdRef.current = created.id;
      setSelectedId(created.id);
      setJobMissing(false);
      setMissingJobId(null);
      persistSelectedJobId(created.id);
      syncJobIdToUrl(created.id);
      setDetail(created);
      setTrials(null);
      await startStrategySearchJob(created.id);
      const started = await getStrategySearchJobWithRetry(created.id);
      setDetail(started);
      await refreshList();
      setFeedback({
        message: "탐색을 시작했습니다.",
        detail: `${created.searchName || form.searchName} · 합격 목표까지 AI가 연구를 이어갑니다.`,
        tone: "info",
      });
    } catch (err) {
      const mapped = toUserError(err);
      setFeedback({ ...mapped, tone: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function runAction(
    action: "start" | "pause" | "resume" | "cancel",
    explicitJobId?: string,
  ) {
    const jobId = explicitJobId ?? selectedId;
    if (!jobId || actionPending) return;
    setActionPending(true);
    setPendingActionJobId(jobId);
    setFeedback(null);
    try {
      const fn =
        action === "start"
          ? startStrategySearchJob
          : action === "pause"
            ? pauseStrategySearchJob
            : action === "resume"
              ? resumeStrategySearchJob
              : cancelStrategySearchJob;
      const next = await fn(jobId);
      if (selectedIdRef.current === jobId) {
        setDetail(next);
      }
      await refreshList();
      await refreshRecovery();
      if (action === "cancel") {
        const pendingCopy = searchCancellationPendingCopy(next.status);
        if (pendingCopy) {
          setFeedback({
            message: pendingCopy,
            detail: null,
            tone: "info",
          });
        }
      }
    } catch (err) {
      const mapped = toUserError(err);
      setFeedback({ ...mapped, tone: "error" });
    } finally {
      setActionPending(false);
      setPendingActionJobId(null);
    }
  }

  const qualifiedFromTrials: QualifiedStrategyCardModel[] =
    detail && trials
      ? (trials.trials ?? [])
          .filter((t) => t.passed)
          .map((t) => trialToCard(t, detail))
      : [];

  const showOutcomeFirst = Boolean(
    detail &&
      (detail.status === "completed" ||
        detail.status === "cancelled" ||
        detail.status === "cancel_requested" ||
        detail.status === "failed" ||
        detail.status === "paused" ||
        detail.outcomePresentation === "partial_completed" ||
        (qualifiedFromTrials.length > 0 &&
          detail.status !== "running" &&
          detail.status !== "queued" &&
          detail.status !== "interrupted" &&
          detail.status !== "pause_requested" &&
          !detail.executionActive)),
  );

  const selectedJobForName =
    detail ?? jobs.find((job) => job.id === selectedId) ?? null;
  const selectedName = selectedJobForName
    ? displayJobSearchTitle(selectedJobForName)
    : null;
  const selectedNameTooltip = selectedJobForName
    ? jobSearchNameTooltip(selectedJobForName)
    : undefined;
  const selectedStatusKo = detail
    ? researchStatusLabelKo(detail.status, {
        completionReason: detail.completionReason ?? null,
        executionActive: detail.executionActive,
        preservedCandidateCount:
          detail.preservedCandidateCount ?? qualifiedFromTrials.length,
      })
    : jobMissing
      ? "찾을 수 없음"
      : selectedId
        ? "불러오는 중"
        : "대기";
  const configSummary = detail
    ? [
        detail.currentCombinationLabel ??
          (detail.patternCombinationFamilies &&
          detail.patternCombinationFamilies.length > 1
            ? detail.patternCombinationFamilies.join(" + ")
            : null),
        detail.patternCombinationOperator
          ? String(detail.patternCombinationOperator).toUpperCase()
          : null,
        `${detail.symbols.join(", ")} ${detail.timeframe}`,
      ]
        .filter(Boolean)
        .join(" · ") +
      (!detail.currentCombinationLabel &&
      !(
        detail.patternCombinationFamilies &&
        detail.patternCombinationFamilies.length > 1
      ) &&
      detail.currentSearchFamily
        ? ` · ${presentSearchFamilyLabelKo(detail.currentSearchFamily) ?? detail.currentSearchFamily}`
        : "")
    : "";
  const activeCount = jobs.filter((job) =>
    isOperationallyActiveStatus(job.status, job.executionActive),
  ).length;
  const qualifiedFact =
    detail != null
      ? formatCount(detail.qualifiedCount ?? qualifiedFromTrials.length)
      : "—";
  const activityJobs = jobs.slice(0, 7);
  const liveTop10Entries = detail?.liveTop10?.entries ?? [];
  const groupAware = Boolean(
    detail && !jobMissing && hasAuthoritativeRankingGroups(detail),
  );
  const demoteNewSearch = Boolean(
    detail &&
      !jobMissing &&
      (detail.status === "completed" ||
        detail.status === "cancelled" ||
        ((detail.status === "failed" || detail.status === "paused") &&
          (detail.qualifiedCount ?? 0) > 0)),
  );
  const hasLiveTop10 = !groupAware && liveTop10Entries.length > 0;
  const searchProgress =
    detail && !jobMissing
      ? {
          status: detail.status,
          qualifiedCount:
            detail.qualifiedCount ?? qualifiedFromTrials.length,
          top10Count: hasLiveTop10 ? liveTop10Entries.length : 0,
          progressRatio: detail.progressRatio,
          overallProgressPct: detail.overallProgressPct,
          maxRuntimeMs: detail.maxRuntimeMs,
          elapsedMs: detail.elapsedMs,
          uniqueEvaluatedCount: detail.uniqueEvaluatedCount,
          candidateBudgetUsed: detail.candidateBudgetUsed,
          completedIterations: detail.completedIterations,
          evaluatedCount: detail.evaluatedCount ?? detail.statistics?.evaluated,
          gatePassedCount: detail.gatePassedCount ?? detail.statistics?.passed,
          rejectedCount: detail.rejectedCount ?? detail.statistics?.failed,
          errorCount: detail.errorCount ?? detail.statistics?.errors,
          recentActivityEvents: detail.recentActivityEvents ?? [],
          searchProgression: detail.searchProgression,
          currentSearchFamily: detail.currentSearchFamily,
        }
      : null;
  const showRunningVisual = shouldRenderRunningVisual(searchProgress?.status);
  const presentationMode = resolveStrategySearchPresentationMode({
    clientReady,
    showRunningVisual,
    outcomeViewPrimary,
  });
  const guidedSetupActive = isGuidedSetupActive(presentationMode);
  const runningAutomatic =
    resolvePatternSelectionMode({
      patternConfigLevel: form.patternConfigLevel,
      autoStrategyCombo: form.autoStrategyCombo,
    }) === "automatic";
  const progressionFamilyIds = (searchProgress?.searchProgression ?? [])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const runningFamilyIds =
    progressionFamilyIds.length > 0
      ? progressionFamilyIds
      : visualizedSearchSpaceIds({
          automatic: runningAutomatic,
          selectedSpaceIds: form.selectedSpaceIds,
        });
  const runningConfigSummary = buildRunningConfigSummary({
    symbol: detail?.symbols?.[0] || form.symbol,
    timeframe: detail?.timeframe || form.timeframe,
    periodPreset: form.periodPreset,
    automatic: runningAutomatic,
    familyCount: runningFamilyIds.length,
  });
  const liveTop10Empty = liveTop10EmptyPresentation({
    running: Boolean(
      detail &&
        !jobMissing &&
        isOperationallyActiveStatus(detail.status, detail.executionActive),
    ),
    candidateCount: liveTop10Entries.length,
  });
  const top10Evaluating = liveTop10Empty.evaluating;
  const top10EmptyReason = !detail
    ? "탐색을 선택하거나 새 탐색을 시작하세요."
    : top10Evaluating
      ? liveTop10Empty.detail
      : groupAware
        ? "이 탐색의 순위는 순위 그룹에서 확인합니다."
        : !detail.liveTop10
          ? "이 탐색에는 Live TOP10 스냅샷이 없습니다."
          : liveTop10Entries.length === 0
            ? "아직 TOP 10을 선정할 만큼 검증된 전략이 없습니다."
            : null;
  const showCompletion = Boolean(
    detail &&
      !jobMissing &&
      (detail.status === "completed" ||
        detail.status === "cancelled" ||
        detail.status === "cancel_requested" ||
        detail.status === "failed" ||
        detail.outcomePresentation === "partial_completed" ||
        (qualifiedFromTrials.length > 0 &&
          detail.status !== "running" &&
          detail.status !== "queued" &&
          detail.status !== "interrupted" &&
          detail.status !== "pause_requested" &&
          !detail.executionActive)),
  );
  const periodLabel =
    form.periodPreset === "short"
      ? "단기 (30일)"
      : form.periodPreset === "standard"
        ? "표준 (60일)"
        : form.periodPreset === "long"
          ? "장기 (120일)"
          : "직접 기간";
  const patternChip =
    detail?.currentCombinationLabel ||
    (detail?.patternCombinationFamilies &&
    detail.patternCombinationFamilies.length > 0
      ? detail.patternCombinationFamilies.join(" + ")
      : form.patternConfigLevel === "automatic"
        ? "자동"
        : form.patternConfigLevel === "basic"
          ? "기본"
          : "전문가");
  const symbolChip = detail?.symbols?.join(", ") || form.symbol || "—";
  const timeframeChip = detail?.timeframe || form.timeframe || "—";
  const setupResultsSummaryMeta =
    jobs.length > 0
      ? `${formatCount(jobs.length)}건 · ${symbolChip} · ${timeframeChip}${selectedStatusKo ? ` · ${selectedStatusKo}` : ""}`
      : "기록 없음";

  const createForm = (
    <div
      className={
        "v3-ss-create-main" +
        (showRunningVisual ? " ss-create-main--secondary" : "")
      }
      data-testid="ss-visual-builder-host"
    >
      <JobCreateForm
        form={form}
        errors={formErrors}
        submitting={creating}
        searchProgress={searchProgress}
        readOnly={showRunningVisual}
        onChange={setForm}
        onSubmit={() => void handleStartSearch()}
      />
    </div>
  );

  const scrollToCreate = () => {
    setOutcomeViewPrimary(false);
    document
      .getElementById("strategy-search-create")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const probeRecovery = () => {
    void refreshRecovery();
    document
      .getElementById("ss-recovery")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="v3-ss-workbench"
      data-testid="strategy-search-workbench"
      data-presentation-mode={presentationMode}
      data-guided-setup-active={guidedSetupActive ? "true" : "false"}
    >
      {!clientReady ? (
        <div
          className="rextora-card p-4 text-sm text-slate-400"
          data-testid="ss-form-hydrating"
        >
          탐색 설정을 준비하는 중…
        </div>
      ) : (
        <>
          {showRunningVisual ? (
            <StrategySearchRunningVisual
              progress={searchProgress}
              familyIds={runningFamilyIds}
              symbol={detail?.symbols?.[0] || form.symbol}
              timeframe={detail?.timeframe || form.timeframe}
            />
          ) : (
            <>{createForm}</>
          )}

          {showOutcomeFirst ? (
            <p className="ss-helper" data-testid="ss-config-collapsed">
              완료된 탐색이 있습니다. 아래 결과에서 확인하거나, 위에서 새 탐색을
              시작하세요.
            </p>
          ) : null}

          <SetupResultsCollapsible
            active={guidedSetupActive}
            summaryMeta={setupResultsSummaryMeta}
          >
          <section
            className="v3-ss-statusbar"
            data-testid="ss-sticky-status-header"
            aria-label="현재 탐색 상태"
          >
            <div className="v3-ss-status-main">
              <span>현재 상태</span>
              <b data-testid="ss-job-user-name" title={selectedNameTooltip}>
                {selectedStatusKo}
                {selectedName ? ` · ${selectedName}` : ""}
              </b>
              {configSummary ? (
                <p data-testid="ss-job-config-summary">{configSummary}</p>
              ) : (
                <p data-testid="ss-job-config-summary">
                  {symbolChip} · {timeframeChip} · {periodLabel}
                </p>
              )}
            </div>
            <div className="v3-ss-status-cell">
              <span>진행 중</span>
              <b>{formatCount(activeCount)}</b>
            </div>
            {recoveryJobs.length > 0 ? (
            <div className="v3-ss-status-cell" data-testid="ss-recovery-count">
              <span>재개 가능</span>
              <b className="v3-ss-tone-warn">
                {formatCount(recoveryJobs.length)}
              </b>
            </div>
            ) : null}
            <div className="v3-ss-status-cell">
              <span>통과 후보</span>
              <b className={qualifiedFact !== "—" && qualifiedFact !== "0" ? "v3-ss-tone-ok" : undefined}>
                {qualifiedFact}
              </b>
            </div>
            <div className="v3-ss-status-cell">
              <span>실제 주문</span>
              <b className="v3-ss-tone-bad">{LIVE_ORDERS_BLOCKED_LABEL}</b>
            </div>
          </section>

          <div className="v3-ss-exec" aria-label="탐색 실행">
            <select
              className="v3-ss-select"
              value={selectedId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                if (id) void handleSelect(id);
                else {
                  clearJobSelection();
                  setJobMissing(false);
                  setMissingJobId(null);
                }
              }}
              data-testid="ss-recent-job-select"
              aria-label="실행 중 작업"
            >
              <option value="">선택…</option>
              {jobs.slice(0, 12).map((job) => (
                <option
                  key={job.id}
                  value={job.id}
                  title={jobSearchNameTooltip(job)}
                >
                  {displayJobSearchTitle(job)} ·{" "}
                  {historyStatusLabelKo(job.status, {
                    completionReason: job.completionReason,
                  })}
                </option>
              ))}
            </select>
            {detail || jobMissing ? (
            <V3PermissionGate allowed={canRunResearch}>
              <ExecutionControls
                status={detail?.status ?? "queued"}
                pending={actionPending}
                retryable={detail?.retryable === true}
                jobMissing={jobMissing}
                hasSelection={Boolean(detail)}
                resultsHref={
                  detail?.id
                    ? `/results?jobId=${encodeURIComponent(detail.id)}`
                    : null
                }
                onStart={() => void runAction("start")}
                onPause={() => void runAction("pause")}
                onResume={() => void runAction("resume")}
                onCancel={() => void runAction("cancel")}
              />
            </V3PermissionGate>
            ) : null}
          </div>
          <p className="v3-ss-perm">
            권한 없는 제어는 흐리게 표시되며 사용 불가로 보입니다.
          </p>

          <div className="v3-ss-toolbar">
            <Button
              type="button"
              className={demoteNewSearch ? "v3-ss-btn-ghost" : "v3-ss-btn-primary"}
              data-testid="ss-open-new-search"
              data-action-rank={demoteNewSearch ? "tertiary" : "primary"}
              onClick={scrollToCreate}
            >
              새 탐색
            </Button>
            {recoveryJobs.length > 0 || recoveryLoading ? (
            <Button
              type="button"
              variant="outline"
              className="v3-ss-btn-secondary"
              data-testid="ss-recovery-probe"
              onClick={probeRecovery}
            >
              복구 {formatCount(recoveryJobs.length)}건
            </Button>
            ) : null}
            <Link
              href="/results"
              className="v3-ss-btn-ghost"
              data-testid="ss-open-results"
              onClick={() => setOutcomeViewPrimary(true)}
            >
              전체 결과
            </Link>
            {detail?.id ? (
              <Link
                href={`/results?jobId=${encodeURIComponent(detail.id)}`}
                className={demoteNewSearch ? "v3-ss-btn-primary" : "v3-ss-btn-ghost"}
                data-testid="ss-open-results-job"
                onClick={() => setOutcomeViewPrimary(true)}
              >
                이 탐색 결과
              </Link>
            ) : null}
          </div>

          {showRunningVisual ? (
            <RunningConfigSummary
              titleKo={runningConfigSummary.titleKo}
              marketLine={runningConfigSummary.marketLine}
              scopeLine={runningConfigSummary.scopeLine}
              expanded={runningConfigOpen}
              onToggle={() => setRunningConfigOpen((open) => !open)}
            >
              {createForm}
            </RunningConfigSummary>
          ) : null}

          {recoveryBanner ? (
            <div
              className="v3-ss-banner"
              role="status"
              data-testid="ss-recovery-banner"
            >
              {recoveryBanner}
            </div>
          ) : null}

          {jobMissing ? (
            <section
              className="rextora-card space-y-3 p-4"
              data-testid="ss-recovery-chooser"
              role="alert"
            >
              <h3 className="ss-section-title">탐색 작업을 찾을 수 없습니다</h3>
              <p className="text-sm text-slate-300">
                선택한 탐색 ID가 삭제되었거나 아직 저장되지 않았을 수 있습니다.
                아래에서 다시 조회하거나 다른 탐색을 선택하세요.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  data-testid="ss-recovery-retry"
                  onClick={() => {
                    if (!missingJobId) return;
                    void refreshDetail(missingJobId, { retryNotFound: true });
                  }}
                >
                  다시 조회
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="ss-recovery-pick-newest"
                  disabled={jobs.length === 0}
                  onClick={() => {
                    const newest = jobs[0];
                    if (newest) handleSelect(newest.id);
                  }}
                >
                  최근 탐색 선택
                </Button>
                {missingJobId ? (
                  <Link
                    href={`/results?jobId=${encodeURIComponent(missingJobId)}`}
                    className="inline-flex items-center rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200"
                    data-testid="ss-recovery-open-results"
                  >
                    보존 결과 열기
                  </Link>
                ) : null}
                <Button
                  type="button"
                  className="ss-btn-primary"
                  data-testid="ss-recovery-new-search"
                  onClick={() => {
                    clearJobSelection();
                    setJobMissing(false);
                    setMissingJobId(null);
                    setFeedback(null);
                    scrollToCreate();
                  }}
                >
                  새 탐색 시작
                </Button>
              </div>
            </section>
          ) : null}

          {feedback ? (
            <div
              className="v3-ss-feedback"
              data-tone={feedback.tone}
              role={feedback.tone === "error" ? "alert" : "status"}
              data-testid="ss-feedback"
            >
              <div className="font-medium">{feedback.message}</div>
              {feedback.detail ? (
                <div className="mt-1 text-xs opacity-80" data-testid="ss-feedback-detail">
                  {feedback.detail}
                </div>
              ) : null}
              {strategiesSavedHint ? (
                <div className="mt-2 text-xs">
                  <Link
                    href="/strategies"
                    className="font-medium underline underline-offset-2"
                    data-testid="ss-strategies-link"
                  >
                    전략 관리 열기
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedId && !detail && !jobMissing ? (
            <section
              className="rextora-card space-y-3 p-4"
              data-testid="ss-job-detail-loading"
              role="status"
            >
              <h2 className="ss-section-title">연구 상세 불러오는 중…</h2>
              <p className="text-sm text-slate-400">
                진행률·TOP10·파이프라인을 불러옵니다. 응답이 지연되면 목록에서 다시
                선택하거나 새로고침하세요.
              </p>
            </section>
          ) : null}

          <div className="v3-ss-grid">
            <V3Card
              className="v3-ss-s4"
              title="탐색 활동"
              meta={activityJobs.length > 0 ? `최근 ${formatCount(activityJobs.length)}회` : "없음"}
            >
              {activityJobs.length === 0 ? (
                <p className="v3-ss-empty">
                  최근 탐색 활동이 없습니다. 새 탐색을 시작하면 여기에 표시됩니다.
                </p>
              ) : (
                <div className="v3-ss-activity">
                  {activityJobs.map((job, index) => (
                    <div key={job.id} className="v3-ss-activity-row">
                      <span>{index + 1}</span>
                      <div>
                        <strong title={jobSearchNameTooltip(job)}>
                          {displayJobSearchTitle(job)}
                        </strong>
                        <small>
                          {historyStatusLabelKo(job.status, {
                            completionReason: job.completionReason,
                          })}
                          {job.qualifiedCount != null
                            ? ` · 합격 ${formatCount(job.qualifiedCount)}`
                            : ""}
                        </small>
                      </div>
                    </div>
                  ))}
                  <div className="v3-ss-activity-foot">
                    <span>탐색량 {formatCount(jobs.length)}</span>
                    <span>
                      통과 후보 {qualifiedFact}
                    </span>
                  </div>
                </div>
              )}
            </V3Card>

            <V3Card
              className="v3-ss-s8"
              title={groupAware ? "상위 후보 · 순위 그룹" : "상위 후보 · Live TOP10"}
              headerAction={
                <div className="v3-ss-tabs" role="tablist" aria-label="순위 보기">
                  {groupAware ? null : (
                  <button
                    type="button"
                    role="tab"
                    className={rankPanel === "top10" ? "is-active" : undefined}
                    aria-selected={rankPanel === "top10"}
                    data-testid="ss-result-tab-top10"
                    onClick={() => {
                      rankPanelTouchedRef.current = true;
                      setRankPanel("top10");
                    }}
                  >
                    Live TOP10
                  </button>
                  )}
                  <button
                    type="button"
                    role="tab"
                    className={rankPanel === "groups" ? "is-active" : undefined}
                    aria-selected={rankPanel === "groups"}
                    data-testid="ss-result-tab-groups"
                    onClick={() => {
                      rankPanelTouchedRef.current = true;
                      setRankPanel("groups");
                    }}
                  >
                    순위 그룹
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={rankPanel === "completion" ? "is-active" : undefined}
                    aria-selected={rankPanel === "completion"}
                    data-testid="ss-result-tab-completion"
                    onClick={() => {
                      rankPanelTouchedRef.current = true;
                      setRankPanel("completion");
                    }}
                  >
                    완료 요약
                  </button>
                </div>
              }
            >
              {rankPanel === "top10" && !groupAware && !hasLiveTop10 ? (
                <div
                  className={
                    "v3-ss-top10-empty" +
                    (top10Evaluating ? " v3-ss-top10-empty--evaluating" : "")
                  }
                  data-testid="ss-top10-empty-panel"
                  aria-label={top10Evaluating ? "후보 평가 중" : undefined}
                >
                  {top10Evaluating ? (
                    <div
                      className="ss-top10-dots"
                      aria-hidden="true"
                      data-testid="ss-top10-evaluating"
                    >
                      <i />
                      <i />
                      <i />
                    </div>
                  ) : null}
                  <strong>
                    {top10Evaluating
                      ? liveTop10Empty.title
                      : "표시할 순위 데이터가 없습니다"}
                  </strong>
                  <p>{top10EmptyReason}</p>
                  {detail && !jobMissing ? (
                    <p className="v3-ss-note" title={jobSearchNameTooltip(detail)}>
                      {displayJobSearchTitle(detail)}
                      {selectedStatusKo ? ` · ${selectedStatusKo}` : ""}
                    </p>
                  ) : null}
                  {detail?.id ? (
                    <Link
                      href={`/results?jobId=${encodeURIComponent(detail.id)}`}
                      className="v3-ss-btn-ghost"
                    >
                      이 탐색 결과
                    </Link>
                  ) : (
                    <Link href="/results" className="v3-ss-btn-ghost">
                      전체 결과
                    </Link>
                  )}
                </div>
              ) : null}
              {detail && !jobMissing ? (
                <>
                  {rankPanel === "top10" && !groupAware ? (
                    <section
                      data-testid="ss-job-detail"
                      aria-labelledby="ss-job-detail-title"
                    >
                      <h2
                        id="ss-job-detail-title"
                        className="v3-ss-sr"
                        title={jobSearchNameTooltip(detail)}
                      >
                        {displayJobSearchTitle(detail)}
                      </h2>
                      <details className="ss-research-detail">
                        <summary>연구 상세</summary>
                        <SearchStatusCard
                          job={detail}
                          qualifiedCountFallback={qualifiedFromTrials.length}
                          generationCount={generationMeta?.generationCount ?? null}
                          latestWeaknessKo={generationMeta?.latestWeaknessKo ?? null}
                          latestAdjustmentKo={generationMeta?.latestAdjustmentKo ?? null}
                          operatorFacing
                        />
                      </details>
                    </section>
                  ) : null}
                  {rankPanel === "groups" ? (
                    <div className="v3-ss-rank-panel">
                      <ResearchRankingGroups
                        source={detail}
                        unknownLegacy={detail.unknownLegacy}
                        operatorFacing
                      />
                    </div>
                  ) : null}
                  {rankPanel === "completion" ? (
                  <div className="v3-ss-rank-panel">
                    {showCompletion ? (
                      <ResearchCompletionPanel
                        job={detail}
                        passCount={qualifiedFromTrials.length}
                        bestStrategyName={
                          qualifiedFromTrials[0]?.name ?? detail.currentBestSummary
                        }
                        bestStrategyId={
                          qualifiedFromTrials.find((q) => q.strategyId)?.strategyId ??
                          null
                        }
                        onRegisterBest={
                          qualifiedFromTrials.some(
                            (q) => q.registrationState === "not_registered",
                          )
                            ? () => {
                                const first = qualifiedFromTrials.find(
                                  (q) => q.registrationState === "not_registered",
                                );
                                if (first) setCompletionRegisterIter(first.iteration);
                              }
                            : null
                        }
                        onRegisterForBacktest={(iteration) => {
                          void handleRegisterForBacktest(iteration);
                        }}
                        registeringForBacktest={registering}
                        onPromoteTop={() => {
                          void (async () => {
                            try {
                              setRegistering(true);
                              const { promoteStrategySearchTrials } = await import(
                                "./apiClient"
                              );
                              const data = await promoteStrategySearchTrials(detail.id, {
                                mode: "top",
                                limit: 10,
                              });
                              const n = Array.isArray(data.promoted)
                                ? data.promoted.length
                                : 0;
                              setFeedback({
                                message: "상위 전략 등록",
                                detail: `상위 전략 ${n}개를 전략 라이브러리에 등록했습니다.`,
                                tone: "success",
                              });
                              setStrategiesSavedHint(true);
                            } catch (e) {
                              setFeedback({
                                message: "일괄 등록 실패",
                                detail:
                                  e instanceof Error ? e.message : "일괄 등록 실패",
                                tone: "error",
                              });
                            } finally {
                              setRegistering(false);
                            }
                          })();
                        }}
                        onResume={
                          detail.status === "paused" || detail.retryable === true
                            ? () => void runAction("resume")
                            : null
                        }
                        onNewResearch={() => {
                          clearJobSelection();
                          setJobMissing(false);
                          setMissingJobId(null);
                          setFeedback(null);
                          setRegistrationSummary(null);
                          setStrategiesSavedHint(false);
                          setCompletionRegisterIter(null);
                          scrollToCreate();
                        }}
                      />
                    ) : (
                      <p className="v3-ss-empty">
                        완료 요약은 종료된 탐색을 선택하면 표시됩니다.
                      </p>
                    )}
                  </div>
                  ) : null}
                </>
              ) : rankPanel !== "top10" ? (
                <p className="v3-ss-empty">
                  표시할 순위 데이터가 없습니다. 탐색을 선택하거나 새 탐색을 시작하세요.
                </p>
              ) : null}
            </V3Card>

            {recoveryJobs.length > 0 || recoveryLoading ? (
            <V3Card
              className="v3-ss-full v3-ss-recovery-card"
              title="재개 가능한 탐색"
              meta={`${formatCount(recoveryJobs.length)}건 · 누락 작업 복구 포함`}
            >
              <InterruptedRecoverySection
                jobs={recoveryJobs}
                visibleCount={recoveryVisibleCount}
                loading={recoveryLoading}
                pendingJobId={pendingActionJobId}
                collapsedPreviewCount={RECOVERY_COLLAPSED_PREVIEW_COUNT}
                expanded={recoveryListExpanded}
                onToggleExpanded={() =>
                  setRecoveryListExpanded((open) => !open)
                }
                onOpen={(jobId) => void handleSelect(jobId)}
                onResume={(jobId) => void runAction("resume", jobId)}
                onLoadMore={() =>
                  setRecoveryVisibleCount((n) => n + RECOVERY_VISIBLE_PAGE_SIZE)
                }
              />
            </V3Card>
            ) : null}

            <section className="v3-ss-full v3-ss-runtime-card">
              <div data-testid="ss-results-handoff" className="v3-ss-handoff">
                {listError ? (
                  <p className="v3-ss-note" role="alert">
                    {listError}
                  </p>
                ) : null}
                {listLoading && jobs.length === 0 ? (
                  <p className="v3-ss-note" data-testid="ss-list-loading">
                    연구 목록 불러오는 중…
                  </p>
                ) : null}
                <p className="v3-ss-note" data-testid="ss-history-retention-note">
                  최근 탐색 기록 {STRATEGY_SEARCH_HISTORY_RETENTION_NOTE}개를 표시합니다.
                  합격 전략 카드와 등록·삭제는 탐색 결과에서 확인합니다.
                </p>
                <Link
                  href={buildSearchCompareHref({ left: selectedId })}
                  className="v3-ss-note underline-offset-2 hover:underline"
                  data-testid="ss-compare-entry"
                >
                  탐색 결과 비교
                </Link>
              </div>
            </section>
          </div>
          </SetupResultsCollapsible>

          {completionRegisterIter != null ? (
            <ConfirmDialog
              open
              title="통과 후보 등록"
              description="이 통과 후보를 전략 관리에 등록할까요? 자격 미통과 최고 점수 후보는 등록하지 않습니다."
              confirmLabel="등록"
              cancelLabel="취소"
              tone="success"
              loading={registering}
              onCancel={() => setCompletionRegisterIter(null)}
              onConfirm={() => {
                const iter = completionRegisterIter;
                setCompletionRegisterIter(null);
                void handleRegister([iter]);
              }}
            />
          ) : null}

        </>
      )}
    </div>
  );
}
