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
  const reason =
    completionReasonLabelKo(job.completionReason ?? null) ??
    (job.searchSpaceExhausted && job.status === "completed"
      ? "연구 범위 소진"
      : null);
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

  const budgetLabel =
    budget != null
      ? `${formatCount(budgetUsed)} / ${formatCount(budget)}`
      : formatCount(budgetUsed);

  return (
    <section
      className="rextora-card space-y-6 border border-emerald-500/30 bg-emerald-500/5 p-6"
      data-testid="ss-research-completion"
      aria-labelledby="ss-research-completion-title"
    >
      <div>
        <h3 id="ss-research-completion-title" className="ss-section-title">
          AI 연구 완료
        </h3>
        <p
          className="mt-1.5 text-sm text-emerald-100"
          data-testid="ss-completion-status-line"
        >
          {status}
          {reason ? ` · ${reason}` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BigStat
          label="연구 시간"
          value={elapsed ?? "—"}
          testId="ss-completion-time"
        />
        <BigStat
          label="검증한 전략"
          value={formatCount(tested)}
          testId="ss-completion-tested"
        />
        <BigStat
          label="연구 예산 사용"
          value={budgetLabel}
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
          value={reason ?? status}
          testId="ss-completion-stop-reason"
        />
        <BigStat
          label="연구 상태"
          value={status}
          testId="ss-completion-research-status"
        />
      </div>

      <div className="flex flex-wrap gap-2">
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
        <Button
          type="button"
          variant="ghost"
          className="ss-btn-primary"
          data-testid="ss-completion-new-research"
          onClick={onNewResearch}
        >
          새 탐색
        </Button>
        <Link
          href="/strategies"
          className="ss-btn-primary inline-flex items-center rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[var(--text-primary)] hover:bg-[var(--panel-hover)]"
          data-testid="ss-completion-open-sm"
        >
          전략 관리 열기
        </Link>
        {props.bestStrategyId ? (
          <Link
            href={`/strategies?id=${encodeURIComponent(props.bestStrategyId)}`}
            className="ss-btn-primary inline-flex items-center rounded-lg border border-emerald-600/50 px-3 py-2 text-emerald-100 hover:bg-emerald-900/30"
            data-testid="ss-completion-view-strategy"
          >
            전략 열기
          </Link>
        ) : null}
      </div>
    </section>
  );
}
