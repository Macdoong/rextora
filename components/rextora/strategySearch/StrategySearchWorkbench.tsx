"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/primitives";
import {
  cancelStrategySearchJob,
  createStrategySearchJob,
  getStrategySearchJob,
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
import { completionReasonLabelKo } from "./formatters";

/** Server operatorPlan owns runUntilQualified / multi-space progression. */
const OPERATOR_RUN_UNTIL_QUALIFIED = true as const;
void OPERATOR_RUN_UNTIL_QUALIFIED;

const DETAIL_POLL_MS = 2000;
const LIST_POLL_MS = 8000;

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
  const boot = readSearchQueryBootstrap();
  const [form, setForm] = useState<FormState>(() => ({
    ...createDefaultOperatorFormState(),
    ...(boot.formPatch ?? {}),
  }));
  const [formErrors, setFormErrors] = useState<FormFieldError[]>([]);
  const [creating, setCreating] = useState(false);

  const [jobs, setJobs] = useState<StrategySearchJobSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(boot.jobId);
  const [detail, setDetail] = useState<StrategySearchJobDetail | null>(null);
  const [trials, setTrials] = useState<StrategySearchTrialsPage | null>(null);

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

  const detailInflight = useRef(false);
  const listInflight = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const HISTORY_PAGE = STRATEGY_SEARCH_HISTORY_RETENTION_NOTE;

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const refreshList = useCallback(async () => {
    if (listInflight.current) return;
    listInflight.current = true;
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
      listInflight.current = false;
      setListLoading(false);
    }
  }, [HISTORY_PAGE]);

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

  const refreshDetail = useCallback(
    async (jobId: string) => {
      if (detailInflight.current) return null;
      detailInflight.current = true;
      try {
        const data = await getStrategySearchJob(jobId);
        if (selectedIdRef.current !== jobId) return data;
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
        const mapped = toUserError(err);
        setFeedback({ ...mapped, tone: "error" });
        return null;
      } finally {
        detailInflight.current = false;
      }
    },
    [refreshTrials],
  );

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void refreshList();
    };
    const boot = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, LIST_POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [refreshList]);

  const pollActive =
    !!selectedId &&
    !!detail &&
    isOperationallyActiveStatus(detail.status, detail.executionActive);

  useEffect(() => {
    if (!pollActive || !selectedId) return;
    const jobId = selectedId;
    const tick = () => {
      void (async () => {
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
        }
        await refreshList();
      })();
    };
    tick();
    const timer = window.setInterval(tick, DETAIL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pollActive, selectedId, refreshDetail, refreshList]);

  function handleSelect(id: string) {
    // Keep ref in sync before async detail load so setDetail is not skipped.
    selectedIdRef.current = id;
    setSelectedId(id);
    setFeedback(null);
    setStrategiesSavedHint(false);
    setRegistrationSummary(null);
    setTrials(null);
    void refreshDetail(id);
  }

  useEffect(() => {
    if (!boot.jobId) return;
    const timer = window.setTimeout(() => {
      handleSelect(boot.jobId!);
    }, 0);
    return () => clearTimeout(timer);
    // Boot once from URL jobId
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setSelectedId(created.id);
      setDetail(created);
      setTrials(null);
      await startStrategySearchJob(created.id);
      const started = await getStrategySearchJob(created.id);
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

  return (
    <div className="space-y-4" data-testid="strategy-search-workbench">
      <JobCreateForm
        form={form}
        errors={formErrors}
        submitting={creating}
        onChange={setForm}
        onSubmit={() => void handleStartSearch()}
      />

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

      {detail ? (
        <section
          className="rextora-card space-y-3 p-4"
          data-testid="ss-job-detail"
          aria-labelledby="ss-job-detail-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="ss-job-detail-title"
                className="ss-section-title"
              >
                {detail.searchName || "전략 탐색"}
              </h2>
              <p className="rextora-helper mt-1">
                {detail.symbols.join(", ")} · {detail.timeframe}
                {detail.currentSearchFamily
                  ? ` · ${detail.currentSearchFamily}`
                  : ""}
              </p>
            </div>
            <ExecutionControls
              status={detail.status}
              pending={actionPending}
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
          detail.status === "failed" ? (
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
              onNewResearch={() => {
                setSelectedId(null);
                setDetail(null);
                setTrials(null);
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
              className="mt-1 w-full max-w-xl rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={selectedId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                if (id) void handleSelect(id);
                else {
                  setSelectedId(null);
                  setDetail(null);
                }
              }}
              data-testid="ss-recent-job-select"
            >
              <option value="">선택…</option>
              {jobs.slice(0, 12).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.searchName || j.id} · {j.status}
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
        {listLoading ? (
          <p className="text-xs text-slate-500">연구 목록 불러오는 중…</p>
        ) : null}
        <p className="text-xs text-slate-500" data-testid="ss-history-retention-note">
          최근 탐색 기록 {STRATEGY_SEARCH_HISTORY_RETENTION_NOTE}개를 보관합니다.
          전체 합격 전략·기록 관리는 탐색 결과에서 확인하세요.
        </p>
      </section>
    </div>
  );
}
