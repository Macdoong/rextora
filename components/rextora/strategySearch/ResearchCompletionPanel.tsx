"use client";

import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import type { StrategySearchJobDetail } from "./types";
import {
  completionReasonLabelKo,
  formatCount,
  formatMs,
  formatPct,
  researchStatusLabelKo,
  resolveDisplayTerminationReason,
} from "./formatters";
import { cleanStrategyDisplayName } from "./displayNames";

function BigStat(props: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div
      className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4"
      data-testid={props.testId}
    >
      <div className="ss-field-label text-emerald-100/80">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
        {props.value}
      </div>
    </div>
  );
}

export function ResearchCompletionPanel(props: {
  job: StrategySearchJobDetail;
  passCount: number;
  bestStrategyName?: string | null;
  onNewResearch: () => void;
  onRegisterBest?: (() => void) | null;
  bestStrategyId?: string | null;
}) {
  const { job, passCount, bestStrategyName, onNewResearch } = props;
  // Never show completion card while research is still running.
  if (
    job.status === "running" ||
    job.status === "pause_requested" ||
    job.status === "queued" ||
    job.executionActive
  ) {
    return null;
  }
  const reason = resolveDisplayTerminationReason({
    status: job.status,
    completionReason: job.completionReason,
    terminationReason: job.terminationReason,
    failureMessage: job.failureMessage,
  });
  const status = researchStatusLabelKo(job.status, {
    completionReason: job.completionReason,
  });
  const elapsed = formatMs(job.statistics?.elapsedMs ?? null);
  const tested =
    job.uniqueEvaluatedCount ??
    job.candidateBudgetUsed ??
    job.statistics?.evaluated ??
    job.completedIterations;
  const budget = job.candidateBudget ?? null;
  const budgetUsed =
    job.candidateBudgetUsed ??
    job.uniqueEvaluatedCount ??
    job.statistics?.evaluated ??
    tested;
  const bestReturn = formatPct(job.bestReturn);
  const bestName = bestStrategyName
    ? cleanStrategyDisplayName(bestStrategyName)
    : job.currentBestSummary
      ? cleanStrategyDisplayName(job.currentBestSummary)
      : null;

  const evaluatedLabel = `평가한 후보 ${formatCount(budgetUsed)}개`;

  return (
    <section
      className="rextora-card space-y-6 border border-emerald-500/30 bg-emerald-500/5 p-6"
      data-testid="ss-research-completion"
      aria-labelledby="ss-research-completion-title"
    >
      <div>
        <h3 id="ss-research-completion-title" className="ss-section-title">
          {job.status === "failed" ? "AI 연구 종료 (실패)" : "AI 연구 완료"}
        </h3>
        <p
          className="mt-1.5 text-sm text-emerald-100"
          data-testid="ss-completion-status-line"
        >
          {status}
          {reason ? ` · ${reason}` : ""}
        </p>
        {job.status === "failed" && passCount > 0 ? (
          <p className="mt-2 text-sm text-amber-100" data-testid="ss-completion-preserved">
            탐색 작업은 실패했지만 검증된 후보 {formatCount(passCount)}개는
            저장되었습니다.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BigStat
          label="연구 시간"
          value={elapsed ?? "—"}
          testId="ss-completion-time"
        />
        <BigStat
          label="평가한 후보"
          value={evaluatedLabel}
          testId="ss-completion-tested"
        />
        <BigStat
          label="자원 안전 제한"
          value={
            budget != null
              ? `${formatCount(budget)}개 (정상 종료 조건 아님)`
              : "—"
          }
          testId="ss-completion-budget"
        />
        <BigStat
          label="합격 전략"
          value={formatCount(passCount)}
          testId="ss-completion-approved"
        />
        <BigStat
          label="최고 전략"
          value={bestName ?? "—"}
          testId="ss-completion-best-name"
        />
        <BigStat
          label="최고 수익률"
          value={bestReturn ?? "—"}
          testId="ss-completion-best-return"
        />
        <BigStat
          label="종료 사유"
          value={reason || status}
          testId="ss-completion-stop-reason"
        />
        <BigStat
          label="실제 심볼"
          value={(job.symbols ?? []).join(", ") || "—"}
          testId="ss-completion-symbols"
        />
        <BigStat
          label="연구 상태"
          value={status}
          testId="ss-completion-research-status"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={
            props.job.id
              ? `/results?jobId=${encodeURIComponent(props.job.id)}`
              : "/results"
          }
          className="ss-btn-primary inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-100"
          data-testid="ss-completion-open-results"
        >
          탐색 결과 열기
        </Link>
        <Button
          type="button"
          variant="ghost"
          className="ss-btn-primary"
          data-testid="ss-completion-new-research"
          onClick={onNewResearch}
        >
          다시 탐색
        </Button>
        {passCount > 0 && props.onRegisterBest ? (
          <Button
            type="button"
            className="ss-btn-primary"
            data-testid="ss-completion-register"
            onClick={props.onRegisterBest}
          >
            최고 전략 등록
          </Button>
        ) : null}
      </div>
    </section>
  );
}
