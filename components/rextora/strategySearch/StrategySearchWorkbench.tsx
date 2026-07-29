"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, ConfirmDialog } from "@/components/ui/primitives";
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
import { ExecutionControls } from "./ExecutionControls";
import {
  formatErrorDetails,
  mapStrategySearchErrorCode,
} from "./errorMessages";
import { createDefaultOperatorFormState } from "./formDefaults";
import { buildCreateBodyIfValid, type FormFieldError } from "./formValidation";
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
import { completionReasonLabelKo, historyStatusLabelKo } from "./formatters";

/** Server operatorPlan owns runUntilQualified / multi-space progression. */
const OPERATOR_RUN_UNTIL_QUALIFIED = true as const;
void OPERATOR_RUN_UNTIL_QUALIFIED;

const DETAIL_POLL_MS = 2000;
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StrategySearchJobDetail | null>(null);
  const [trials, setTrials] = useState<StrategySearchTrialsPage | null>(null);
  const [jobMissing, setJobMissing] = useState(false);
  const [missingJobId, setMissingJobId] = useState<string | null>(null);
  const [recoveryBanner, setRecoveryBanner] = useState<string | null>(null);

  const [actionPending, setActionPending] = useState(false);
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
        schedule(hasActiveJobs ? LIST_POLL_MS : LIST_POLL_IDLE_MS);
      }, ms);
    };
    const boot = window.setTimeout(() => {
      void refreshList().then(() => {
        if (!cancelled) schedule(hasActiveJobs ? LIST_POLL_MS : LIST_POLL_IDLE_MS);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [refreshList, hasActiveJobs]);

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
          }
          // Terminal: one final list sync, then detail polling stops via pollActive.
          await refreshList();
          return;
        }
        // While active, refresh list less often than detail (detail already ticks).
      })();
    };
    tick();
    const timer = window.setInterval(tick, DETAIL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pollActive, selectedId, refreshDetail, refreshList]);

  function handleSelect(id: string) {
    selectedIdRef.current = id;
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

  async function handleStartSearch() {
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
  ) {
    if (!selectedId || actionPending) return;
    setActionPending(true);
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
      const next = await fn(selectedId);
      setDetail(next);
      await refreshList();
      if (action === "cancel") {
        setFeedback({
          message: "중지가 요청되었습니다.",
          detail: null,
          tone: "info",
        });
      }
    } catch (err) {
      const mapped = toUserError(err);
      setFeedback({ ...mapped, tone: "error" });
    } finally {
      setActionPending(false);
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
          detail.status !== "pause_requested" &&
          !detail.executionActive)),
  );

  return (
    <div className="space-y-4" data-testid="strategy-search-workbench">
      {!clientReady ? (
        <div
          className="rextora-card p-4 text-sm text-slate-400"
          data-testid="ss-form-hydrating"
        >
          탐색 설정을 준비하는 중…
        </div>
      ) : showOutcomeFirst ? (
        <details className="rextora-card p-4" data-testid="ss-config-collapsed">
          <summary className="cursor-pointer text-sm text-slate-200">
            탐색 설정(접힘) · 새 탐색을 시작할 때만 펼치세요
          </summary>
          <div className="mt-3">
            <JobCreateForm
              form={form}
              errors={formErrors}
              submitting={creating}
              onChange={setForm}
              onSubmit={() => void handleStartSearch()}
              activeJobSummary={null}
            />
          </div>
        </details>
      ) : (
        <JobCreateForm
          form={form}
          errors={formErrors}
          submitting={creating}
          onChange={setForm}
          onSubmit={() => void handleStartSearch()}
          activeJobSummary={
            detail &&
            (detail.status === "running" ||
              detail.status === "pause_requested" ||
              detail.status === "queued" ||
              detail.executionActive)
              ? {
                  searchName: detail.searchName || "전략 탐색",
                  symbols: detail.symbols,
                  timeframe: detail.timeframe,
                  maxRuntimeMs: detail.maxRuntimeMs ?? null,
                  status: detail.status,
                  expectedCompletionAtMs: detail.expectedCompletionAtMs ?? null,
                  appliedSummary:
                    (
                      detail as {
                        appliedSearchSummary?: {
                          titleKo: string;
                          subtitleKo: string;
                          sections: Array<{
                            id: string;
                            titleKo: string;
                            rows: Array<{ labelKo: string; valueKo: string }>;
                          }>;
                          developerPayload: Record<string, unknown>;
                        } | null;
                      }
                    ).appliedSearchSummary ?? null,
                }
              : null
          }
        />
      )}

      {recoveryBanner ? (
        <div
          className="rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-2.5 text-sm text-sky-100"
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
                window.scrollTo({ top: 0, behavior: "smooth" });
                window.setTimeout(() => {
                  document
                    .querySelector<HTMLElement>(
                      '[data-testid="strategy-search-create"]',
                    )
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 100);
              }}
            >
              새 탐색 시작
            </Button>
          </div>
        </section>
      ) : null}

      {feedback ? (
        <div
          className={`rounded-lg border px-3 py-2.5 text-sm shadow-sm ${
            feedback.tone === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-100"
              : feedback.tone === "success"
                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-50"
                : "border-sky-500/30 bg-sky-500/10 text-sky-100"
          }`}
          role={feedback.tone === "error" ? "alert" : "status"}
          data-testid="ss-feedback"
        >
          <div className="font-medium">{feedback.message}</div>
          {feedback.detail ? (
            <div
              className="mt-1 text-xs opacity-80"
              data-testid="ss-feedback-detail"
            >
              {feedback.detail}
            </div>
          ) : null}
          {strategiesSavedHint ? (
            <div className="mt-2 text-xs">
              <Link
                href="/strategies"
                className="font-medium underline decoration-emerald-300/60 underline-offset-2 hover:text-white"
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

      {detail && !jobMissing ? (
        <section
          className="rextora-card space-y-3 p-4"
          data-testid="ss-job-detail"
          aria-labelledby="ss-job-detail-title"
        >
          <div className="sticky top-16 z-20 -mx-2 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-950/95 px-3 py-3 shadow-lg backdrop-blur min-[1101px]:top-3" data-testid="ss-sticky-status-header">
            <div>
              <h2
                id="ss-job-detail-title"
                className="ss-section-title"
                data-testid="ss-job-user-name"
              >
                {detail.searchName || "전략 탐색"}
              </h2>
              <p
                className="rextora-helper mt-1"
                data-testid="ss-job-config-summary"
              >
                {[
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
                  .join(" · ")}
                {!detail.currentCombinationLabel &&
                !(
                  detail.patternCombinationFamilies &&
                  detail.patternCombinationFamilies.length > 1
                ) &&
                detail.currentSearchFamily
                  ? ` · ${detail.currentSearchFamily}`
                  : ""}
              </p>
            </div>
            <ExecutionControls
              status={detail.status}
              pending={actionPending}
              retryable={detail.retryable === true}
              jobMissing={jobMissing}
              onStart={() => void runAction("start")}
              onPause={() => void runAction("pause")}
              onResume={() => void runAction("resume")}
              onCancel={() => void runAction("cancel")}
            />
          </div>

          <SearchStatusCard
            job={detail}
            qualifiedCountFallback={qualifiedFromTrials.length}
            generationCount={generationMeta?.generationCount ?? null}
            latestWeaknessKo={generationMeta?.latestWeaknessKo ?? null}
            latestAdjustmentKo={generationMeta?.latestAdjustmentKo ?? null}
          />

          {detail.status === "completed" ||
          detail.status === "cancelled" ||
          detail.status === "cancel_requested" ||
          detail.status === "failed" ||
          detail.outcomePresentation === "partial_completed" ||
          (qualifiedFromTrials.length > 0 &&
            detail.status !== "running" &&
            detail.status !== "queued" &&
            detail.status !== "pause_requested" &&
            !detail.executionActive) ? (
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
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ) : null}
        </section>
      ) : null}

      {completionRegisterIter != null ? (
        <ConfirmDialog
          open
          title="전략 등록"
          description="이 합격 전략을 전략 관리에 등록할까요? 자동으로 저장되지 않습니다."
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

      <section
        className="rextora-card space-y-3 p-4"
        data-testid="ss-results-handoff"
      >
        <h3 className="ss-section-title">탐색 결과</h3>
        <p className="text-sm text-slate-400">
          합격 전략 카드, 순위, 등록·삭제·보관 작업은 탐색 결과 페이지에서
          확인합니다. 연구 페이지에는 현재 연구 상태만 표시합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/results"
            className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100"
            data-testid="ss-open-results"
          >
            탐색 결과 열기
          </Link>
          {detail?.id ? (
            <Link
              href={`/results?jobId=${encodeURIComponent(detail.id)}`}
              className="inline-flex items-center rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200"
              data-testid="ss-open-results-job"
            >
              이 연구 결과 보기
            </Link>
          ) : null}
        </div>
        {jobs.length > 0 ? (
          <label className="block text-sm text-slate-300">
            최근 연구 선택
            <select
              className="mt-1 rextora-input max-w-xl"
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
            >
              <option value="">선택…</option>
              {jobs.slice(0, 12).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.searchName || j.id} ·{" "}
                  {historyStatusLabelKo(j.status, {
                    completionReason: j.completionReason,
                  })}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {listError ? (
          <p className="text-sm text-red-300" role="alert">
            {listError}
          </p>
        ) : null}
        {listLoading && jobs.length === 0 ? (
          <p className="text-xs text-slate-500" data-testid="ss-list-loading">
            연구 목록 불러오는 중…
          </p>
        ) : null}
        <p className="text-xs text-slate-500" data-testid="ss-history-retention-note">
          최근 탐색 기록 {STRATEGY_SEARCH_HISTORY_RETENTION_NOTE}개를 보관합니다.
          전체 합격 전략·기록 관리는 탐색 결과에서 확인하세요.
        </p>
      </section>
    </div>
  );
}
