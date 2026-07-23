"use client";

import { Metric } from "@/components/ui/primitives";
import type { StrategySearchJobDetail } from "./types";
import {
  completionReasonLabelKo,
  formatCount,
  formatMs,
  formatPct,
  isEarlyFinishReason,
  pipelineStageLabelKo,
  pipelineStageUiStatus,
  researchStatusLabelKo,
  type PipelineUiStatus,
} from "./formatters";
import { cleanStrategyDisplayName } from "./displayNames";

const PIPELINE_ORDER = [
  { id: "ema_core", label: "EMA 추세" },
  { id: "rsi_pullback", label: "RSI 되돌림" },
  { id: "breakout", label: "변동성 돌파" },
  { id: "risk_exits", label: "ATR 손익" },
  { id: "full_safe", label: "SAFE 종합" },
] as const;

function toneClass(ui: PipelineUiStatus): string {
  switch (ui) {
    case "completed":
      return "border-emerald-500/50 bg-emerald-500/15 text-emerald-100";
    case "running":
      return "border-sky-400/60 bg-sky-500/20 text-sky-50 ring-1 ring-sky-400/40";
    case "failed":
      return "border-red-500/50 bg-red-500/15 text-red-100";
    case "skipped":
      return "border-amber-500/35 bg-amber-500/10 text-amber-100";
    default:
      return "border-slate-700 bg-slate-900/60 text-slate-400";
  }
}

function StatBlock(props: {
  label: string;
  value: string;
  hint?: string | null;
  testId?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--panel-strong)] px-4 py-3"
      data-testid={props.testId}
    >
      <div className="ss-field-label">{props.label}</div>
      <div
        className={`mt-1.5 font-semibold tabular-nums tracking-tight ${
          props.emphasize
            ? "text-2xl text-emerald-200"
            : "text-xl text-[var(--text-primary)]"
        }`}
      >
        {props.value}
      </div>
      {props.hint ? (
        <div className="mt-1 text-xs text-[var(--text-muted)]">{props.hint}</div>
      ) : null}
    </div>
  );
}

export function SearchStatusCard(props: {
  job: StrategySearchJobDetail;
  qualifiedCountFallback?: number;
}) {
  const { job } = props;
  const stats = job.statistics;
  const qualifiedTarget = job.qualifiedTarget ?? null;
  const qualifiedCount =
    job.qualifiedCount ?? props.qualifiedCountFallback ?? stats?.passed ?? 0;
  const tested =
    job.uniqueEvaluatedCount ??
    job.candidateBudgetUsed ??
    stats?.evaluated ??
    job.completedIterations;
  const budget = job.candidateBudget ?? null;
  const budgetUsed =
    job.candidateBudgetUsed ??
    job.uniqueEvaluatedCount ??
    stats?.evaluated ??
    tested;

  const researching =
    job.status === "running" ||
    job.executionActive ||
    job.status === "pause_requested";

  const researchStatus = researchStatusLabelKo(job.status, {
    completionReason: job.completionReason,
    executionActive: job.executionActive,
  });
  const reason =
    completionReasonLabelKo(job.completionReason ?? null) ??
    (job.searchSpaceExhausted && job.status === "completed"
      ? "연구 범위 소진"
      : null);
  const earlyGoal = isEarlyFinishReason(job.completionReason);
  const elapsed = formatMs(stats?.elapsedMs ?? null);
  const bestReturn = formatPct(job.bestReturn);
  const progression = job.searchProgression ?? [];
  const bestSummary = job.currentBestSummary
    ? cleanStrategyDisplayName(job.currentBestSummary)
    : null;

  const byId = new Map(progression.map((s) => [s.id, s]));
  const baseStages =
    progression.length > 0
      ? progression.map((s) => ({
          id: s.id,
          label: s.labelKo,
          status: s.status,
        }))
      : PIPELINE_ORDER.map((p) => ({
          id: p.id,
          label: p.label,
          status: byId.get(p.id)?.status ?? "pending",
        }));

  const activeIndex = Math.max(
    0,
    baseStages.findIndex((s) => s.status === "active"),
  );

  const stages = baseStages.map((step, idx) => {
    const ui = pipelineStageUiStatus({
      stageStatus: step.status,
      jobStatus: job.status,
      completionReason: job.completionReason,
      stageIndex: idx,
      activeIndex: activeIndex >= 0 ? activeIndex : 0,
    });
    return {
      ...step,
      ui,
      statusLabel: pipelineStageLabelKo(ui, { earlyGoal }),
    };
  });

  const goalValue =
    qualifiedTarget != null
      ? `${formatCount(qualifiedCount)} / ${qualifiedTarget}`
      : formatCount(qualifiedCount);

  const budgetValue =
    budget != null
      ? `${formatCount(budgetUsed)} / ${formatCount(budget)}`
      : formatCount(budgetUsed);

  return (
    <section
      className="rextora-card ss-status-card space-y-6 p-5"
      data-testid="ss-statistics"
      aria-labelledby="ss-live-status-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="ss-live-status-title" className="ss-section-title">
            {researching ? "AI가 연구 중입니다…" : "현재 AI 연구"}
          </h3>
          <p
            className="mt-1 text-sm text-sky-100"
            data-testid="ss-live-status-label"
          >
            {researchStatus}
            {researching && job.currentSearchFamily
              ? ` · ${job.currentSearchFamily}`
              : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatBlock
          label="합격 목표"
          value={goalValue}
          testId="ss-approval-goal"
          emphasize
        />
        <StatBlock
          label="연구 예산 사용"
          value={budgetValue}
          testId="ss-research-budget"
        />
        <StatBlock
          label="연구 상태"
          value={researchStatus}
          testId="ss-research-status"
          emphasize={!researching}
        />
        <StatBlock
          label="종료 사유"
          value={reason ?? (researching ? "연구 진행 중" : "—")}
          testId="ss-stop-reason"
        />
      </div>

      <div data-testid="ss-search-progression" className="space-y-3">
        <div className="ss-subsection-title">탐색 파이프라인</div>
        <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-2">
          {stages.map((step, idx) => (
            <li key={step.id} className="flex items-center gap-2">
              <div
                className={`flex min-w-[8.5rem] flex-col items-center justify-center rounded-lg border px-3 py-2.5 text-center ${toneClass(step.ui)}`}
                data-testid={`ss-pipeline-${step.id}`}
              >
                <span className="text-xs font-semibold">{step.label}</span>
                <span className="mt-1 text-[11px] opacity-90">
                  {step.statusLabel}
                </span>
              </div>
              {idx < stages.length - 1 ? (
                <span className="text-slate-600" aria-hidden>
                  ↓
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      {job.failureMessage && job.status === "failed" ? (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100"
          data-testid="ss-failure-message"
          role="alert"
        >
          {job.failureMessage}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="현재 연구" value={job.searchName || "전략 탐색"} />
        {researching && job.currentSearchFamily ? (
          <Metric label="현재 전략군" value={job.currentSearchFamily} />
        ) : null}
        {elapsed ? <Metric label="연구 시간" value={elapsed} /> : null}
        <Metric label="검증한 전략" value={formatCount(tested)} />
        {bestReturn ? <Metric label="최고 수익률" value={bestReturn} /> : null}
        {bestSummary ? <Metric label="현재 최고" value={bestSummary} /> : null}
      </div>

      <details className="ss-advanced-group">
        <summary className="ss-subsection-title cursor-pointer">
          기술 정보
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="검증" value={formatCount(stats?.evaluated)} />
          <Metric label="실패" value={formatCount(stats?.failed)} />
          <Metric label="오류" value={formatCount(stats?.errors)} />
          {budget != null ? (
            <Metric label="최대 후보 예산" value={formatCount(budget)} />
          ) : null}
          {job.remainingBudget != null ? (
            <Metric
              label="남은 후보 예산"
              value={formatCount(job.remainingBudget)}
            />
          ) : null}
          {job.seed != null ? (
            <Metric label="시드" value={String(job.seed)} />
          ) : null}
        </div>
      </details>
    </section>
  );
}
