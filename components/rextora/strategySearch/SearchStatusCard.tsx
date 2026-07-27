"use client";

import { useState } from "react";
import { Metric } from "@/components/ui/primitives";
import type { StrategySearchJobDetail } from "./types";
import {
  EVALUATION_PIPELINE_STAGES,
  formatCount,
  formatErrorStatusKo,
  formatMs,
  formatPct,
  isEarlyFinishReason,
  mapEngineStageToPipelineId,
  pipelineStageLabelKo,
  pipelineStageUiStatus,
  researchStatusLabelKo,
  resolveCurrentStageLabelKo,
  resolveDisplayTerminationReason,
  type PipelineUiStatus,
} from "./formatters";
import { cleanStrategyDisplayName } from "./displayNames";

function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatSignedDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  asPct = false,
): string | null {
  if (
    current == null ||
    previous == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return null;
  }
  const delta = current - previous;
  if (Math.abs(delta) < 1e-12) return asPct ? "±0.00%" : "±0";
  const sign = delta > 0 ? "+" : "";
  if (asPct) return `${sign}${(delta * 100).toFixed(2)}%p`;
  if (Number.isInteger(delta)) return `${sign}${delta}`;
  return `${sign}${delta.toFixed(2)}`;
}

function movementLabelKo(short: string): string {
  if (short === "신규" || short === "NEW") return "신규";
  if (short === "상승" || short === "↑") return "상승";
  if (short === "하락" || short === "↓") return "하락";
  if (short === "유지" || short === "KEEP") return "유지";
  if (short === "제외") return "제외";
  return short || "—";
}

function movementTone(short: string): string {
  const label = movementLabelKo(short);
  if (label === "신규") return "bg-sky-500/25 text-sky-100";
  if (label === "상승") return "bg-emerald-500/25 text-emerald-100";
  if (label === "하락") return "bg-amber-500/25 text-amber-100";
  return "bg-slate-700/60 text-slate-200";
}

function MiniSeries({ values }: { values: number[] | null | undefined }) {
  if (!values || values.length < 2) {
    return <span aria-label="미니 차트 데이터 없음">—</span>;
  }
  const safe = values.filter(Number.isFinite).slice(0, 30);
  if (safe.length < 2) return <span aria-label="미니 차트 데이터 없음">—</span>;
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = max - min || 1;
  const points = safe
    .map(
      (value, index) =>
        `${(index / (safe.length - 1)) * 72},${22 - ((value - min) / span) * 20}`,
    )
    .join(" ");
  return (
    <svg
      width="72"
      height="24"
      viewBox="0 0 72 24"
      role="img"
      aria-label="실제 저장 성과 미니 차트"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

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

function buildAiWorkNarrative(input: {
  job: StrategySearchJobDetail;
  latestWeaknessKo?: string | null;
  latestAdjustmentKo?: string | null;
}): Array<{ label: string; value: string }> {
  const { job, latestWeaknessKo, latestAdjustmentKo } = input;
  const sections: Array<{ label: string; value: string }> = [];

  const currentTask =
    job.currentSearchFamily ??
    job.searchProgression?.find((s) => s.status === "active")?.labelKo ??
    job.currentImprovementStage ??
    null;
  if (currentTask) {
    sections.push({ label: "현재 AI 작업", value: currentTask });
  }

  if (latestWeaknessKo) {
    sections.push({ label: "최근 발견한 약점", value: latestWeaknessKo });
  }

  if (latestAdjustmentKo) {
    sections.push({ label: "적용한 개선", value: latestAdjustmentKo });
  }

  const nextSpace = job.searchProgression?.find((s) => s.status === "pending");
  if (nextSpace?.labelKo) {
    sections.push({ label: "다음 단계", value: nextSpace.labelKo });
  } else if (job.status === "running" && job.currentSearchFamily) {
    sections.push({
      label: "다음 단계",
      value: "현재 전략군 평가를 계속합니다",
    });
  }

  return sections;
}

function deriveEvaluationPipelineStages(job: StrategySearchJobDetail): Array<{
  id: string;
  label: string;
  ui: PipelineUiStatus;
  statusLabel: string;
}> {
  const evaluated =
    job.counters?.evaluated ??
    job.statistics?.evaluated ??
    job.uniqueEvaluatedCount ??
    0;
  const failedPipelineId = mapEngineStageToPipelineId(
    job.failedStage ?? job.terminationDetail ?? null,
  );
  const lastOkId = mapEngineStageToPipelineId(job.lastSuccessfulStage);

  let activeIndex = 0;
  if (failedPipelineId) {
    activeIndex = EVALUATION_PIPELINE_STAGES.findIndex(
      (s) => s.id === failedPipelineId,
    );
  } else if (lastOkId) {
    activeIndex =
      EVALUATION_PIPELINE_STAGES.findIndex((s) => s.id === lastOkId) + 1;
  } else if (job.symbolSelection?.selectedSymbol || job.status !== "queued") {
    activeIndex = evaluated > 0 ? 2 : 1;
  }

  return EVALUATION_PIPELINE_STAGES.map((stage, idx) => {
    let ui: PipelineUiStatus = "waiting";
    if (job.status === "failed" && failedPipelineId === stage.id) {
      ui = "failed";
    } else if (idx < activeIndex) {
      ui = "completed";
    } else if (
      idx === activeIndex &&
      (job.executionActive ||
        job.status === "running" ||
        job.status === "pause_requested")
    ) {
      ui = "running";
    } else if (
      job.status === "completed" ||
      job.status === "cancelled" ||
      (job.status === "failed" && idx < activeIndex)
    ) {
      ui = idx <= activeIndex ? "completed" : "skipped";
    }
    return {
      id: stage.id,
      label: stage.labelKo,
      ui,
      statusLabel: pipelineStageLabelKo(ui, {
        earlyGoal: isEarlyFinishReason(job.completionReason),
      }),
    };
  });
}

export function SearchStatusCard(props: {
  job: StrategySearchJobDetail;
  qualifiedCountFallback?: number;
  generationCount?: number | null;
  latestWeaknessKo?: string | null;
  latestAdjustmentKo?: string | null;
}) {
  const { job, generationCount, latestWeaknessKo, latestAdjustmentKo } = props;
  const [top10Expanded, setTop10Expanded] = useState(false);
  const stats = job.statistics;
  const qualifiedTarget = job.qualifiedTarget ?? null;
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

  const preserved =
    job.preservedCandidateCount ??
    job.qualifiedCount ??
    props.qualifiedCountFallback ??
    0;
  const researchStatus = researchStatusLabelKo(job.status, {
    completionReason: job.completionReason,
    executionActive: job.executionActive,
    preservedCandidateCount: preserved,
  });
  const counters = job.counters;
  const risk = job.currentBestRisk;
  const symbolSel = job.symbolSelection;
  const reason = resolveDisplayTerminationReason({
    status: job.status,
    completionReason: job.completionReason,
    terminationReason: job.terminationReason,
    failureMessage: job.failureMessage,
  });
  const earlyGoal = isEarlyFinishReason(job.completionReason);
  const isTerminal =
    job.status === "completed" ||
    job.status === "cancelled" ||
    job.status === "failed";
  const elapsed = formatMs(job.elapsedMs ?? stats?.elapsedMs ?? null);
  const remaining = isTerminal
    ? null
    : formatMs(job.remainingMs ?? stats?.remainingEstimateMs ?? null);
  const expectedCompletion =
    isTerminal || job.expectedCompletionAtMs == null
      ? null
      : new Date(job.expectedCompletionAtMs).toLocaleString("ko-KR");
  const progressPct =
    typeof job.overallProgressPct === "number" &&
    Number.isFinite(job.overallProgressPct)
      ? Math.max(0, Math.min(100, Math.round(job.overallProgressPct)))
      : typeof job.progressRatio === "number" && Number.isFinite(job.progressRatio)
        ? Math.max(0, Math.min(100, Math.round(job.progressRatio * 100)))
        : null;
  const progressLine =
    progressPct != null
      ? "탐색 진행 " + String(progressPct) + "%"
      : researching
        ? "시간 정보를 복구하는 중입니다."
        : null;
  const bestReturn = formatPct(job.bestReturn);
  const progression = job.searchProgression ?? [];
  const bestSummary = job.currentBestSummary
    ? cleanStrategyDisplayName(job.currentBestSummary)
    : null;
  const combinationLabel =
    job.currentCombinationLabel ??
    (job.patternCombinationFamilies &&
    job.patternCombinationFamilies.length > 1
      ? job.patternCombinationFamilies.join(" + ")
      : null);
  const currentStage =
    combinationLabel ??
    resolveCurrentStageLabelKo({
      currentSearchFamily: job.currentSearchFamily,
      currentImprovementStage: job.currentImprovementStage,
      searchProgression: progression,
      failedStage: job.failedStage,
      status: job.status,
    });
  const errorStatus = formatErrorStatusKo(
    counters?.evaluationErrors ?? stats?.errors ?? 0,
  );
  const evaluatedCount = counters?.evaluated ?? stats?.evaluated ?? tested;
  const rejectedCount =
    counters?.rejected ??
    Math.max(0, (stats?.failed ?? 0) - (stats?.errors ?? 0));
  const safetyLimitLabel =
    budget != null ? `${formatCount(budget)}개` : null;
  const aiNarrative = buildAiWorkNarrative({
    job,
    latestWeaknessKo,
    latestAdjustmentKo,
  });
  const evalPipelineStages = deriveEvaluationPipelineStages(job);

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

  const familyStages = baseStages.map((step, idx) => {
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

  const elapsedRemainingValue =
    elapsed && remaining
      ? `${elapsed} / ${remaining}`
      : elapsed ?? remaining ?? "시간 정보 없음";

  const elapsedMsNum = job.elapsedMs ?? stats?.elapsedMs ?? null;
  const evalPerSec =
    elapsedMsNum != null &&
    elapsedMsNum > 0 &&
    evaluatedCount > 0 &&
    Number.isFinite(evaluatedCount)
      ? evaluatedCount / (elapsedMsNum / 1000)
      : null;
  const remainingEvals =
    job.candidateBudget != null &&
    job.uniqueEvaluatedCount != null &&
    Number.isFinite(job.candidateBudget) &&
    Number.isFinite(job.uniqueEvaluatedCount)
      ? Math.max(0, job.candidateBudget - job.uniqueEvaluatedCount)
      : job.maxIterations != null &&
          job.completedIterations != null &&
          Number.isFinite(job.maxIterations)
        ? Math.max(0, job.maxIterations - job.completedIterations)
        : null;
  const leverageSummaryRow = job.appliedSearchSummary?.sections
    ?.flatMap((s) => s.rows)
    ?.find(
      (r) =>
        r.labelKo.includes("레버리지") ||
        r.labelKo.toLowerCase().includes("leverage"),
    );
  const patternSummaryRows =
    job.appliedSearchSummary?.sections?.find((s) =>
      s.titleKo.includes("패턴"),
    )?.rows ?? [];

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
            {researching && (combinationLabel ?? job.currentSearchFamily)
              ? ` · ${combinationLabel ?? job.currentSearchFamily}`
              : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatBlock
          label="탐색 진행"
          value={
            progressPct != null
              ? `${progressPct}%`
              : progressLine ?? "—"
          }
          hint={
            expectedCompletion
              ? `예상 종료: ${expectedCompletion}`
              : researching
                ? "시간 정보를 복구하는 중입니다."
                : null
          }
          testId="ss-time-progress"
        />
        <StatBlock
          label="경과/남은 시간"
          value={elapsedRemainingValue}
          hint={
            job.status === "paused"
              ? "일시정지 중에는 남은 시간이 재개 후 기준입니다."
              : expectedCompletion
                ? `예상 완료 ${expectedCompletion}`
                : null
          }
          testId="ss-elapsed-remaining"
        />
        <StatBlock
          label="평가 전략"
          value={`${formatCount(evaluatedCount)}개`}
          testId="ss-counter-evaluated"
        />
        <StatBlock
          label="합격 전략"
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
          label="현재 최고"
          value={bestSummary ?? bestReturn ?? "—"}
          hint={bestSummary && bestReturn ? bestReturn : null}
          testId="ss-best-return"
          emphasize
        />
        <StatBlock
          label="현재 단계"
          value={currentStage}
          testId="ss-current-stage"
        />
        <StatBlock
          label="현재 반복"
          value={
            job.nextIteration != null
              ? `#${formatCount(job.nextIteration)}`
              : job.completedIterations != null
                ? `완료 ${formatCount(job.completedIterations)}`
                : "—"
          }
          hint={
            combinationLabel
              ? `현재 조합: ${combinationLabel}`
              : job.currentSearchFamily
                ? `패밀리: ${job.currentSearchFamily}`
                : null
          }
          testId="ss-current-iteration"
        />
        {evalPerSec != null ? (
          <StatBlock
            label="평가 속도"
            value={`${evalPerSec.toFixed(2)}/초`}
            hint={
              remainingEvals != null
                ? `예상 남은 평가 ${formatCount(remainingEvals)}개`
                : null
            }
            testId="ss-eval-speed"
          />
        ) : null}
        {leverageSummaryRow ? (
          <StatBlock
            label="레버리지"
            value={leverageSummaryRow.valueKo}
            testId="ss-live-leverage-mode"
          />
        ) : null}
        {patternSummaryRows.length > 0 ? (
          <StatBlock
            label="패턴 설정"
            value={
              patternSummaryRows
                .slice(0, 2)
                .map((r) => `${r.labelKo} ${r.valueKo}`)
                .join(" · ") || "—"
            }
            hint={
              patternSummaryRows.length > 2
                ? patternSummaryRows
                    .slice(2)
                    .map((r) => `${r.labelKo} ${r.valueKo}`)
                    .join(" · ")
                : null
            }
            testId="ss-live-pattern-config"
          />
        ) : null}
        <StatBlock
          label="오류 상태"
          value={errorStatus}
          hint={
            counters && !counters.invariantOk
              ? "계수 불일치 — 상세 정보를 확인하세요."
              : "계산 오류는 조건 탈락과 겹치지 않습니다."
          }
          testId="ss-error-status"
        />
      </div>

      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--panel-strong)] px-4 py-3"
        data-testid="ss-live-top10"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="ss-field-label">
            {qualifiedCount > 0
              ? "실시간 TOP 10"
              : "임시 평가 상위 후보 — 합격 아님"}
          </div>
          <div
            className="text-xs text-[var(--text-muted)]"
            data-testid="ss-live-top10-updated"
          >
            마지막 갱신: {formatClock(job.liveTop10?.updatedAt)}
          </div>
        </div>
        {!job.liveTop10 || job.liveTop10.entries.length === 0 ? (
          <p
            className="mt-2 text-sm text-[var(--text-muted)]"
            data-testid="ss-live-top10-empty"
          >
            아직 TOP 10을 선정할 만큼 검증된 전략이 없습니다.
          </p>
        ) : (
          <>
            <div
              className="mt-3 overflow-x-auto"
              data-testid="ss-live-top10-list"
            >
              <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-[var(--text-muted)]">
                    <th scope="col" className="px-2 py-1.5 font-medium">순위</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">변동</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">전략</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">패턴 스택</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">승률</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">수익률</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">낙폭</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">Sharpe</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">견고성</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">레버리지</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">위험</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">신뢰도</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">미니 차트</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">승격 근거</th>
                    <th className="px-2 py-1.5 font-medium">거래</th>
                    <th className="px-2 py-1.5 font-medium">손익비</th>
                    <th className="px-2 py-1.5 font-medium">비용</th>
                    <th className="px-2 py-1.5 font-medium">등록</th>
                  </tr>
                </thead>
                <tbody>
                  {(top10Expanded
                    ? job.liveTop10.entries
                    : job.liveTop10.entries.slice(0, 3)
                  ).map((row) => {
                    const move = movementLabelKo(row.rankChangeShort);
                    const isTop = row.rank === 1;
                    const isNew = move === "신규";
                    return (
                      <tr
                        key={`${row.rank}-${row.strategyHash}`}
                        className={
                          "border-b border-slate-800/80 align-top " +
                          (isTop
                            ? "bg-amber-500/10"
                            : isNew
                              ? "bg-sky-500/10"
                              : "")
                        }
                        data-testid={`ss-live-top10-row-${row.rank}`}
                      >
                        <td className="px-2 py-2 font-semibold tabular-nums">
                          {row.rank}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={
                              "inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold " +
                              movementTone(move)
                            }
                            data-testid={`ss-live-top10-move-${row.rank}`}
                          >
                            {move}
                          </span>
                        </td>
                        <td className="px-2 py-2 font-medium text-[var(--text-primary)]">
                          {cleanStrategyDisplayName(row.displayAlias) ||
                            row.readableName}
                        </td>
                        <td className="px-2 py-2 text-[var(--text-muted)]">
                          {row.patternStack || row.strategyFamily || "—"}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatPct(row.winRate)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatPct(row.netReturn)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatPct(row.maxDrawdown)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {row.sharpe != null && Number.isFinite(row.sharpe)
                            ? row.sharpe.toFixed(2)
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-[var(--text-muted)]">
                          {row.robustnessStatus || "—"}
                        </td>
                        <td className="px-2 py-2 text-[var(--text-muted)]">
                          {row.leverageLabel || "—"}
                        </td>
                        <td className="px-2 py-2 text-[var(--text-muted)]">
                          {row.risk || row.overfittingRisk || "—"}
                        </td>
                        <td className="px-2 py-2 text-[var(--text-muted)]">
                          {row.confidence || row.sampleConfidence || "—"}
                        </td>
                        <td className="px-2 py-2 text-sky-300">
                          <MiniSeries values={row.miniSeries} />
                        </td>
                        <td className="max-w-[16rem] px-2 py-2 text-[var(--text-muted)]">
                          {row.rankReason || "—"}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatCount(row.tradeCount ?? 0)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {row.profitFactor != null &&
                          Number.isFinite(row.profitFactor)
                            ? row.profitFactor.toFixed(2)
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-[var(--text-muted)]">
                          {row.costStatus || "—"}
                        </td>
                        <td className="px-2 py-2 text-[var(--text-muted)]">
                          {row.registrationState === "registered"
                            ? "등록"
                            : row.registrationState === "not_registered"
                              ? "미등록"
                              : row.registrationState || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details
              className="mt-2 rounded-lg border border-slate-800/80 px-3 py-2 text-xs text-[var(--text-muted)]"
              data-testid="ss-live-top10-details"
            >
              <summary className="cursor-pointer text-[var(--text-primary)]">
                선정 이유 · 변화량 상세
              </summary>
              <ul className="mt-2 space-y-2">
                {(top10Expanded
                  ? job.liveTop10.entries
                  : job.liveTop10.entries.slice(0, 3)
                ).map((row) => (
                  <li key={`detail-${row.rank}-${row.strategyHash}`}>
                    <span className="font-medium text-[var(--text-primary)]">
                      {row.rank}위
                    </span>
                    {" · "}
                    {row.movementReasonKo || row.rankReason || "—"}
                    {formatSignedDelta(
                      row.netReturn,
                      row.previousNetReturn,
                      true,
                    )
                      ? ` · 수익 ${formatSignedDelta(row.netReturn, row.previousNetReturn, true)}`
                      : ""}
                    {formatSignedDelta(
                      row.maxDrawdown,
                      row.previousMaxDrawdown,
                      true,
                    )
                      ? ` · MDD ${formatSignedDelta(row.maxDrawdown, row.previousMaxDrawdown, true)}`
                      : ""}
                    {formatSignedDelta(row.tradeCount, row.previousTradeCount)
                      ? ` · 거래 ${formatSignedDelta(row.tradeCount, row.previousTradeCount)}`
                      : ""}
                    {formatSignedDelta(row.score, row.previousScore)
                      ? ` · 점수 ${formatSignedDelta(row.score, row.previousScore)}`
                      : ""}
                    {row.roleBadges.length > 0
                      ? ` · ${row.roleBadges.join(", ")}`
                      : ""}
                  </li>
                ))}
              </ul>
            </details>
            {job.liveTop10.entries.length > 3 ? (
              <button
                type="button"
                className="mt-2 text-xs text-sky-300 underline-offset-2 hover:underline"
                onClick={() => setTop10Expanded((v) => !v)}
                data-testid="ss-live-top10-toggle"
              >
                {top10Expanded
                  ? "접기"
                  : `전체 ${job.liveTop10.entries.length}개 펼치기`}
              </button>
            ) : null}
          </>
        )}
      </div>

      {aiNarrative.length > 0 ? (
        <div
          className="space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-3 text-sm text-sky-50"
          data-testid="ss-ai-work-narrative"
        >
          {aiNarrative.map((row) => (
            <p key={row.label}>
              <span className="font-medium">{row.label}: </span>
              {row.value}
            </p>
          ))}
        </div>
      ) : null}

      {job.status === "failed" ? (
        <div
          className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-50"
          data-testid="ss-failure-message"
          role="alert"
        >
          <p className="font-semibold" data-testid="ss-partial-completion">
            {preserved > 0
              ? `부분 완료 · 엔진 오류로 탐색이 조기 종료됐지만 검증된 전략 ${formatCount(preserved)}개를 저장했습니다.`
              : "탐색이 실패했습니다. 저장된 합격 전략이 없습니다."}
          </p>
          <p data-testid="ss-failure-cause">
            원인: {reason}
            {job.failedStage ? ` · 실패 단계: ${job.failedStage}` : ""}
          </p>
          {job.failureMessage ? (
            <p className="text-xs opacity-90" data-testid="ss-failure-detail">
              {job.failureMessage}
            </p>
          ) : null}
          {job.lastSuccessfulStage ? (
            <p className="text-xs opacity-90">
              마지막 완료 단계: {job.lastSuccessfulStage}
            </p>
          ) : null}
        </div>
      ) : null}

      <details className="ss-advanced-group" data-testid="ss-runtime-details">
        <summary className="ss-subsection-title cursor-pointer">
          상세 실행 정보
        </summary>
        <div className="mt-4 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatBlock
              label="조건 탈락"
              value={`${formatCount(rejectedCount)}개`}
              testId="ss-counter-rejected"
            />
            <StatBlock
              label="계산 오류"
              value={`${formatCount(counters?.evaluationErrors ?? stats?.errors ?? 0)}개`}
              testId="ss-counter-errors"
            />
            <StatBlock
              label="연구 세대"
              value={
                generationCount != null
                  ? `${formatCount(generationCount)}회`
                  : "—"
              }
              testId="ss-generation-count"
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
            />
            <StatBlock
              label="종료 사유"
              value={researching ? "연구 진행 중" : reason}
              testId="ss-stop-reason"
            />
            <StatBlock
              label="평가한 전략"
              value={`평가한 전략 ${formatCount(budgetUsed)}개`}
              hint={
                job.initialCandidateBudget != null
                  ? `저장 한도 ${formatCount(job.initialCandidateBudget)}개 · 자원 예산 ${safetyLimitLabel ?? "—"} (정상 종료 조건 아님)`
                  : safetyLimitLabel
                    ? `자원 안전 제한 ${safetyLimitLabel} — 정상 종료 조건이 아닙니다.`
                    : "정상 종료는 설정한 탐색 시간이 끝나는 시점입니다."
              }
              testId="ss-research-budget"
            />
            <StatBlock
              label="실제 선택 심볼"
              value={
                symbolSel?.selectedSymbol ??
                ((job.symbols ?? []).join(", ") || "—")
              }
              hint={
                symbolSel
                  ? `${symbolSel.reasonKo} · 유동성 ${symbolSel.liquidityStatus} · 데이터 ${symbolSel.dataAvailability}`
                  : null
              }
              testId="ss-actual-symbols"
            />
          </div>

          {safetyLimitLabel ? (
            <p
              className="text-xs text-slate-500"
              data-testid="ss-resource-safety-limit"
            >
              자원 안전 제한: {safetyLimitLabel} (정상 완료 목표가 아님
              {job.resourceSafetyCeiling != null
                ? ` · 하드 한도 ${formatCount(job.resourceSafetyCeiling)}`
                : ""}
              )
            </p>
          ) : null}

          <div data-testid="ss-evaluation-pipeline" className="space-y-3">
            <div className="ss-subsection-title">평가 파이프라인</div>
            <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-2">
              {evalPipelineStages.map((step, idx) => (
                <li key={step.id} className="flex items-center gap-2">
                  <div
                    className={`flex min-w-[8.5rem] flex-col items-center justify-center rounded-lg border px-3 py-2.5 text-center ${toneClass(step.ui)}`}
                    data-testid={`ss-eval-pipeline-${step.id}`}
                  >
                    <span className="text-xs font-semibold">{step.label}</span>
                    <span className="mt-1 text-[11px] opacity-90">
                      {step.statusLabel}
                    </span>
                  </div>
                  {idx < evalPipelineStages.length - 1 ? (
                    <span className="text-slate-600" aria-hidden>
                      ↓
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <div data-testid="ss-search-progression" className="space-y-3">
            <div className="ss-subsection-title">탐색 파이프라인</div>
            {familyStages.length === 0 ? (
              <p
                className="text-sm text-slate-400"
                data-testid="ss-pipeline-empty"
              >
                연구가 시작되면 AI가 지금 어떤 전략군을 검토 중인지 여기에
                표시됩니다.
              </p>
            ) : null}
            <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-2">
              {familyStages.map((step, idx) => (
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
                  {idx < familyStages.length - 1 ? (
                    <span className="text-slate-600" aria-hidden>
                      ↓
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
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
              <Metric
                label="상태 코드"
                value={job.status}
              />
              {budget != null ? (
                <Metric label="최대 탐색 전략 한도" value={formatCount(budget)} />
              ) : null}
              {job.remainingBudget != null ? (
                <Metric
                  label="남은 탐색 전략 한도"
                  value={formatCount(job.remainingBudget)}
                />
              ) : null}
              {job.config?.maxIterations != null ? (
                <Metric
                  label="배치 크기"
                  value={formatCount(job.config.maxIterations)}
                />
              ) : null}
              {job.seed != null ? (
                <Metric label="시드" value={String(job.seed)} />
              ) : null}
            </div>
            {job.status === "failed" ? (
              <pre className="mt-3 whitespace-pre-wrap break-all text-xs text-slate-400">
                {job.terminationDetail ||
                  job.failureMessage ||
                  job.terminationReason ||
                  job.completionReason ||
                  "—"}
              </pre>
            ) : null}
          </details>
        </div>
      </details>
    </section>
  );
}
