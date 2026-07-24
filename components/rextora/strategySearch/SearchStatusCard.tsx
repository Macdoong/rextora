"use client";

import { Metric } from "@/components/ui/primitives";
import type { StrategySearchJobDetail } from "./types";
import {
  formatCount,
  formatMs,
  formatPct,
  isEarlyFinishReason,
  pipelineStageLabelKo,
  pipelineStageUiStatus,
  researchStatusLabelKo,
  resolveDisplayTerminationReason,
  type PipelineUiStatus,
} from "./formatters";
import { cleanStrategyDisplayName } from "./displayNames";

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
  generationCount?: number | null;
  latestWeaknessKo?: string | null;
  latestAdjustmentKo?: string | null;
}) {
  const { job, generationCount, latestWeaknessKo, latestAdjustmentKo } = props;
  const stats = job.statistics;
  const qualifiedTarget = job.qualifiedTarget ?? null;
  // Use plan-qualified count only — never statistics.passed (avoids X/Y goal confusion).
  const qualifiedCount =
    job.qualifiedCount ?? props.qualifiedCountFallback ?? 0;
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
  const reason = resolveDisplayTerminationReason({
    status: job.status,
    completionReason: job.completionReason,
    terminationReason: job.terminationReason,
    failureMessage: job.failureMessage,
  });
  const earlyGoal = isEarlyFinishReason(job.completionReason);
  const elapsed = formatMs(job.elapsedMs ?? stats?.elapsedMs ?? null);
  const remaining = formatMs(job.remainingMs ?? stats?.remainingEstimateMs ?? null);
  const expectedCompletion =
    job.expectedCompletionAtMs != null
      ? new Date(job.expectedCompletionAtMs).toLocaleString("ko-KR")
      : null;
  const bestReturn = formatPct(job.bestReturn);
  const progression = job.searchProgression ?? [];
  const bestSummary = job.currentBestSummary
    ? cleanStrategyDisplayName(job.currentBestSummary)
    : null;

  const baseStages =
    progression.length > 0
      ? progression.map((s) => ({
          id: s.id,
          label: s.labelKo,
          status: s.status,
        }))
      : [];

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

  const evaluatedLabel = `${formatCount(budgetUsed)}개`;
  const safetyLimitLabel =
    budget != null ? `${formatCount(budget)}개` : null;

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
          label="합격 후보"
          value={`${formatCount(qualifiedCount)}개`}
          hint={
            qualifiedTarget != null
              ? `최소 확보 기준: ${qualifiedTarget}개`
              : null
          }
          testId="ss-approval-goal"
          emphasize
        />
        <StatBlock
          label="최소 확보 기준"
          value={
            qualifiedTarget != null ? `${qualifiedTarget}개` : "설정 없음"
          }
          hint="최소 확보 기준을 충족해도 설정된 탐색 시간이 끝날 때까지 개선을 계속합니다."
          testId="ss-qualified-target"
        />
        <StatBlock
          label="연구 상태"
          value={researchStatus}
          testId="ss-research-status"
          emphasize={!researching}
        />
        <StatBlock
          label="종료 사유"
          value={
            researching
              ? "연구 진행 중"
              : reason
          }
          testId="ss-stop-reason"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatBlock
          label="평가한 후보"
          value={`평가한 후보 ${evaluatedLabel}`}
          hint={
            safetyLimitLabel
              ? `자원 안전 제한 ${safetyLimitLabel} — 정상 종료 조건이 아닙니다.`
              : "정상 종료는 탐색 시간 마감(DEADLINE_REACHED)입니다."
          }
          testId="ss-research-budget"
        />
        <StatBlock
          label={job.status === "paused" ? "활성 경과" : "경과 시간"}
          value={elapsed ?? "레거시 타이밍 없음"}
          testId="ss-elapsed"
        />
        <StatBlock
          label={job.status === "paused" ? "재개 후 남은 시간" : "남은 시간"}
          value={remaining ?? "레거시 타이밍 없음"}
          testId="ss-remaining"
        />
        <StatBlock
          label="예상 완료"
          value={expectedCompletion ?? "—"}
          testId="ss-expected-completion"
        />
        <StatBlock
          label="현재 최고 수익"
          value={bestReturn ?? "—"}
          testId="ss-best-return"
          emphasize
        />
        <StatBlock
          label="실제 선택 심볼"
          value={(job.symbols ?? []).join(", ") || "—"}
          testId="ss-actual-symbols"
        />
      </div>
      {safetyLimitLabel ? (
        <p
          className="text-xs text-slate-500"
          data-testid="ss-resource-safety-limit"
        >
          자원 안전 제한: {safetyLimitLabel} (정상 완료 목표가 아님)
        </p>
      ) : null}

      <div data-testid="ss-search-progression" className="space-y-3">
        <div className="ss-subsection-title">탐색 파이프라인</div>
        {stages.length === 0 ? (
          <p className="text-sm text-slate-400" data-testid="ss-pipeline-empty">
            활성 탐색 공간이 아직 로드되지 않았습니다. 연구가 시작되면 실제
            후보 가족이 표시됩니다.
          </p>
        ) : null}
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

      {job.status === "failed" ? (
        <div
          className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100"
          data-testid="ss-failure-message"
          role="alert"
        >
          <p className="font-semibold">
            탐색 작업은 실패했지만 검증된 후보 {formatCount(qualifiedCount)}개는
            저장되었습니다.
          </p>
          <p data-testid="ss-failure-cause">원인: {reason}</p>
          <details className="text-xs text-red-50/90">
            <summary className="cursor-pointer select-none">기술 정보</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all opacity-90">
              {job.failureMessage || job.terminationReason || job.completionReason || "—"}
            </pre>
          </details>
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
        {generationCount != null ? (
          <div data-testid="ss-generation-count">
            <Metric label="연구 세대" value={formatCount(generationCount)} />
          </div>
        ) : null}
      </div>

      {(latestWeaknessKo || latestAdjustmentKo) && (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-50"
          data-testid="ss-weakness-adjustment"
        >
          {latestWeaknessKo ? <p>최신 약점: {latestWeaknessKo}</p> : null}
          {latestAdjustmentKo ? (
            <p className="mt-1">자동 보완: {latestAdjustmentKo}</p>
          ) : null}
        </div>
      )}

      {job.lastMutation?.firstChange ? (
        <div
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-50"
          data-testid="ss-applied-mutation"
        >
          <p className="font-medium">적용된 탐색 보완</p>
          <p className="mt-1">
            {job.lastMutation.firstChange.key}.
            {job.lastMutation.firstChange.field}:{" "}
            {job.lastMutation.firstChange.from}→
            {job.lastMutation.firstChange.to}
          </p>
        </div>
      ) : null}

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
