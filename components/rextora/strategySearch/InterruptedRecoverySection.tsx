"use client";

import { Button } from "@/components/ui/primitives";
import {
  formatCount,
  formatMs,
  formatTimeKo,
  historyStatusLabelKo,
} from "./formatters";
import {
  recoveryResumeEnabled,
  sliceRecoveryVisible,
} from "./interruptedRecoveryDiscovery";
import type { StrategySearchJobSummary } from "./types";

/** Collapsed main-page preview. Existing load-more page size stays 10. */
export const RECOVERY_COLLAPSED_PREVIEW_COUNT = 5;

function recoveryLabel(job: StrategySearchJobSummary): string {
  const name = job.searchName?.trim();
  if (name && !/^template_search/i.test(name) && name !== "strategy_search_base") {
    return name;
  }
  const market = job.symbols.join(", ") || "—";
  return `${market} ${job.timeframe}`;
}

function formatInterruptedAt(job: StrategySearchJobSummary): string | null {
  if (job.interruptedAtMs == null || !Number.isFinite(job.interruptedAtMs)) {
    return null;
  }
  return formatTimeKo(new Date(job.interruptedAtMs).toISOString());
}

export function InterruptedRecoverySection(props: {
  jobs: StrategySearchJobSummary[];
  visibleCount: number;
  loading?: boolean;
  pendingJobId?: string | null;
  collapsedPreviewCount?: number;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onOpen: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onLoadMore: () => void;
}) {
  const previewCount = props.collapsedPreviewCount;
  const compact = previewCount != null && props.expanded !== true;
  const displayCount = compact
    ? Math.min(previewCount, props.visibleCount)
    : props.visibleCount;
  const visible = sliceRecoveryVisible(props.jobs, displayCount);
  const remaining = Math.max(0, props.jobs.length - visible.length);
  const moreThanPreview =
    previewCount != null && props.jobs.length > previewCount;
  const status = historyStatusLabelKo("interrupted");

  return (
    <section
      id="ss-recovery"
      className="rextora-card ss-recovery-section space-y-3 overflow-hidden p-4"
      data-testid="ss-recovery"
      aria-labelledby="ss-recovery-title"
    >
      <div>
        <h3 id="ss-recovery-title" className="ss-section-title">
          {props.jobs.length > 0
            ? `복구 필요 ${props.jobs.length}건`
            : "복구 필요"}
        </h3>
        {props.jobs.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--text-secondary)]" data-testid="ss-recovery-empty">
            현재 복구가 필요한 연구가 없습니다.
          </p>
        ) : (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            중단된 연구만 표시합니다. 재개는 선택한 작업에만 적용됩니다.
          </p>
        )}
      </div>

      {props.loading && props.jobs.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="ss-recovery-loading">
          복구 항목을 불러오는 중…
        </p>
      ) : null}

      {visible.length > 0 ? (
        <ul className="ss-recovery-list divide-y divide-slate-800/80" data-testid="ss-recovery-list">
          {visible.map((job, index) => {
            const canResume = recoveryResumeEnabled(job);
            const remainingLabel = formatMs(job.remainingMs ?? null);
            const interruptedLabel = formatInterruptedAt(job);
            const pending = props.pendingJobId === job.id;
            return (
              <li
                key={job.id}
                className="ss-recovery-item min-w-0 py-3"
                data-testid={`ss-recovery-item-${job.id}`}
              >
                <div className="ss-recovery-row">
                  <div className="ss-recovery-index" aria-hidden="true">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="ss-recovery-name min-w-0 break-words font-medium text-slate-100">
                        {recoveryLabel(job)}
                      </p>
                      <span className="ss-recovery-status shrink-0 text-xs text-sky-300">
                        {status}
                      </span>
                    </div>
                    <p className="ss-recovery-meta mt-1 break-words text-xs text-slate-400">
                      {job.symbols.join(", ")} · {job.timeframe}
                      {interruptedLabel ? ` · 중단 ${interruptedLabel}` : ""}
                    </p>
                  </div>
                  <div className="ss-recovery-actions mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-11"
                      data-testid={`ss-recovery-open-${job.id}`}
                      onClick={() => props.onOpen(job.id)}
                    >
                      상세 열기
                    </Button>
                    {canResume ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="success"
                        className="min-h-11"
                        data-testid={`ss-recovery-resume-${job.id}`}
                        disabled={pending}
                        onClick={() => props.onResume(job.id)}
                      >
                        {pending ? "재개 중…" : "재개"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <details className="ss-recovery-details">
                  <summary className="min-w-0 break-words">상세 정보</summary>
                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-400 sm:grid-cols-2">
                    <div>
                      시작{" "}
                      <span className="text-slate-200">
                        {formatTimeKo(job.startedAt ?? job.createdAt) ?? "—"}
                      </span>
                    </div>
                    {interruptedLabel ? (
                      <div>
                        중단{" "}
                        <span className="text-slate-200">{interruptedLabel}</span>
                      </div>
                    ) : null}
                    <div>
                      반복{" "}
                      <span className="tabular-nums text-slate-200">
                        {formatCount(job.completedIterations)}
                      </span>
                    </div>
                    {remainingLabel ? (
                      <div>
                        남은 시간{" "}
                        <span className="tabular-nums text-slate-200">
                          {remainingLabel}
                        </span>
                      </div>
                    ) : null}
                    {job.qualifiedCount != null ? (
                      <div>
                        합격{" "}
                        <span className="tabular-nums text-slate-200">
                          {formatCount(job.qualifiedCount)}
                        </span>
                      </div>
                    ) : null}
                    <div className="sm:col-span-2" data-testid={`ss-recovery-eligibility-${job.id}`}>
                      {canResume ? (
                        <span className="text-emerald-200">복구 가능</span>
                      ) : (
                        <span className="break-words text-amber-200">
                          복구 불가{job.recoveryBlocker ? ` · ${job.recoveryBlocker}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : null}

      {compact && moreThanPreview ? (
        <div className="text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            data-testid="ss-recovery-expand-all"
            onClick={() => props.onToggleExpanded?.()}
          >
            전체 재개 목록 보기
          </Button>
        </div>
      ) : null}

      {!compact && remaining > 0 ? (
        <div className="text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            data-testid="ss-recovery-load-more"
            onClick={props.onLoadMore}
          >
            더 보기
          </Button>
        </div>
      ) : null}

      {!compact && moreThanPreview ? (
        <div className="text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            data-testid="ss-recovery-collapse"
            onClick={() => props.onToggleExpanded?.()}
          >
            목록 접기
          </Button>
        </div>
      ) : null}
    </section>
  );
}
