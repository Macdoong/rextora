"use client";

import { EmptyState } from "@/components/rextora/EmptyState";
import { LoadingState } from "@/components/rextora/LoadingState";
import { ErrorState } from "@/components/rextora/ErrorState";
import { Button } from "@/components/ui/primitives";
import type { StrategySearchJobStatus, StrategySearchJobSummary } from "./types";
import {
  formatCount,
  formatPct,
  formatTimeKo,
  historyStatusLabelKo,
} from "./formatters";

/** Mirrors server visible/retention default. */
export const STRATEGY_SEARCH_HISTORY_RETENTION_NOTE = 20;

function looksLikeTemplateName(name: string | undefined | null): boolean {
  if (!name || !name.trim()) return true;
  const t = name.trim();
  return (
    /^template_search/i.test(t) ||
    /^SAFE_v44/i.test(t) ||
    t === "strategy_search_base"
  );
}

function displaySearchName(job: StrategySearchJobSummary): string {
  if (!looksLikeTemplateName(job.searchName)) {
    return job.searchName!.trim();
  }
  const market = job.symbols.join(", ") || "—";
  const date = formatTimeKo(job.startedAt ?? job.createdAt);
  return date
    ? `${market} ${job.timeframe} · ${date}`
    : `${market} ${job.timeframe}`;
}

function statusToneClass(status: string, historyLabel: string): string {
  if (historyLabel === "조기 종료") return "text-amber-200";
  if (status === "completed") return "text-emerald-300";
  if (
    status === "running" ||
    status === "pause_requested" ||
    status === "queued" ||
    status === "paused" ||
    status === "cancel_requested"
  ) {
    return "text-sky-300";
  }
  if (status === "failed") return "text-red-300";
  if (status === "cancelled") return "text-slate-400";
  return "text-slate-400";
}

function isTerminalHistoryStatus(status: StrategySearchJobStatus): boolean {
  return (
    status === "completed" || status === "cancelled" || status === "failed"
  );
}

export function JobList(props: {
  jobs: StrategySearchJobSummary[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  deletingId?: string | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onRequestDelete?: (job: StrategySearchJobSummary) => void;
  onLoadMore?: () => void;
}) {
  const {
    jobs,
    loading,
    error,
    selectedId,
    deletingId,
    onSelect,
    onRetry,
  } = props;

  if (loading && jobs.length === 0) {
    return <LoadingState message="탐색 기록을 불러오는 중입니다." />;
  }
  if (error && jobs.length === 0) {
    return (
      <ErrorState
        message="탐색 기록을 불러오지 못했습니다."
        why={error}
        onRetry={onRetry}
      />
    );
  }
  if (!loading && jobs.length === 0) {
    return (
      <section data-testid="strategy-search-job-list" aria-label="탐색 기록">
        <div className="mb-3">
          <h3 className="ss-section-title">탐색 기록</h3>
          <p
            className="mt-1 text-xs text-[var(--text-muted)]"
            data-testid="ss-history-retention-note"
          >
            최근 탐색 기록 {STRATEGY_SEARCH_HISTORY_RETENTION_NOTE}개를
            보관합니다.
          </p>
        </div>
        <EmptyState
          message="탐색 기록이 아직 없습니다."
          hint="위에서 목표를 정한 뒤 탐색을 시작하세요."
        />
      </section>
    );
  }

  return (
    <section
      className="rextora-card overflow-hidden"
      data-testid="strategy-search-job-list"
      aria-label="탐색 기록"
    >
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="ss-section-title">탐색 기록</h3>
        <p
          className="mt-1 text-xs text-[var(--text-muted)]"
          data-testid="ss-history-retention-note"
        >
          최근 탐색 기록 {STRATEGY_SEARCH_HISTORY_RETENTION_NOTE}개를 보관합니다.
        </p>
      </div>
      {error ? (
        <p className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">
          목록을 새로고치지 못했습니다. 마지막 목록을 유지합니다.
        </p>
      ) : null}

      {/* Mobile / tablet cards — no horizontal scroll */}
      <ul className="divide-y divide-slate-800/80 md:hidden">
        {jobs.map((job) => {
          const selected = job.id === selectedId;
          const qualified =
            job.qualifiedCount ?? job.statistics?.passed ?? 0;
          const evaluated =
            job.uniqueEvaluatedCount ??
            job.candidateBudgetUsed ??
            job.statistics?.evaluated ??
            job.completedIterations;
          const bestReturn = formatPct(job.bestReturn);
          const status = historyStatusLabelKo(job.status, {
            completionReason: job.completionReason,
          });
          const canDelete = isTerminalHistoryStatus(job.status);
          return (
            <li key={job.id}>
              <div
                className={`px-4 py-4 transition-colors ${
                  selected ? "bg-sky-500/10" : "hover:bg-slate-800/40"
                }`}
              >
                <button
                  type="button"
                  data-testid={`ss-job-card-${job.id}`}
                  className="w-full text-left"
                  onClick={() => onSelect(job.id)}
                  aria-current={selected ? "true" : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-100">
                        {displaySearchName(job)}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {job.symbols.join(", ")} · {job.timeframe}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-xs ${statusToneClass(job.status, status)}`}
                    >
                      {status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div>
                      시작{" "}
                      <span className="text-slate-200">
                        {formatTimeKo(job.startedAt ?? job.createdAt) ?? "—"}
                      </span>
                    </div>
                    <div>
                      종료{" "}
                      <span className="text-slate-200">
                        {formatTimeKo(job.finishedAt) ?? "—"}
                      </span>
                    </div>
                    <div>
                      검증{" "}
                      <span className="tabular-nums text-slate-200">
                        {formatCount(evaluated)}
                      </span>
                    </div>
                    <div>
                      승인{" "}
                      <span className="tabular-nums text-slate-200">
                        {formatCount(qualified)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      최고 수익률{" "}
                      <span className="tabular-nums text-slate-200">
                        {bestReturn ?? "—"}
                      </span>
                    </div>
                  </div>
                </button>
                {canDelete && props.onRequestDelete ? (
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={`ss-job-delete-${job.id}`}
                      disabled={deletingId === job.id}
                      onClick={() => props.onRequestDelete?.(job)}
                    >
                      {deletingId === job.id ? "삭제 중…" : "기록 삭제"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/60 text-xs text-slate-400">
            <tr>
              <th className="ss-field-label px-4 py-3">탐색 이름</th>
              <th className="ss-field-label px-4 py-3">마켓</th>
              <th className="ss-field-label px-4 py-3">타임프레임</th>
              <th className="ss-field-label px-4 py-3">시작</th>
              <th className="ss-field-label px-4 py-3">종료</th>
              <th className="ss-field-label px-4 py-3">검증</th>
              <th className="ss-field-label px-4 py-3">합격</th>
              <th className="ss-field-label px-4 py-3">최고 수익률</th>
              <th className="ss-field-label px-4 py-3">상태</th>
              <th className="ss-field-label px-4 py-3">관리</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const selected = job.id === selectedId;
              const qualified =
                job.qualifiedCount ?? job.statistics?.passed ?? 0;
              const evaluated =
                job.uniqueEvaluatedCount ??
                job.candidateBudgetUsed ??
                job.statistics?.evaluated ??
                job.completedIterations;
              const bestReturn = formatPct(job.bestReturn);
              const status = historyStatusLabelKo(job.status, {
                completionReason: job.completionReason,
              });
              const canDelete = isTerminalHistoryStatus(job.status);
              return (
                <tr
                  key={job.id}
                  data-testid={`ss-job-row-${job.id}`}
                  className={`border-t border-slate-800/80 transition-colors ${
                    selected ? "bg-sky-500/10" : "hover:bg-slate-800/40"
                  }`}
                >
                  <td
                    className="cursor-pointer px-4 py-3 font-medium text-slate-100"
                    onClick={() => onSelect(job.id)}
                  >
                    {displaySearchName(job)}
                  </td>
                  <td
                    className="cursor-pointer px-4 py-3 text-slate-300"
                    onClick={() => onSelect(job.id)}
                  >
                    {job.symbols.join(", ")}
                  </td>
                  <td
                    className="cursor-pointer px-4 py-3 text-slate-300"
                    onClick={() => onSelect(job.id)}
                  >
                    {job.timeframe}
                  </td>
                  <td
                    className="cursor-pointer px-4 py-3 text-xs text-slate-400"
                    onClick={() => onSelect(job.id)}
                  >
                    {formatTimeKo(job.startedAt ?? job.createdAt) ?? "—"}
                  </td>
                  <td
                    className="cursor-pointer px-4 py-3 text-xs text-slate-400"
                    onClick={() => onSelect(job.id)}
                  >
                    {formatTimeKo(job.finishedAt) ?? "—"}
                  </td>
                  <td
                    className="cursor-pointer px-4 py-3 tabular-nums"
                    onClick={() => onSelect(job.id)}
                  >
                    {formatCount(evaluated)}
                  </td>
                  <td
                    className="cursor-pointer px-4 py-3 tabular-nums"
                    onClick={() => onSelect(job.id)}
                  >
                    {formatCount(qualified)}
                  </td>
                  <td
                    className="cursor-pointer px-4 py-3 tabular-nums text-slate-200"
                    onClick={() => onSelect(job.id)}
                  >
                    {bestReturn ?? "—"}
                  </td>
                  <td
                    className={`cursor-pointer px-4 py-3 ${statusToneClass(job.status, status)}`}
                    onClick={() => onSelect(job.id)}
                  >
                    {status}
                  </td>
                  <td className="px-4 py-3">
                    {canDelete && props.onRequestDelete ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        data-testid={`ss-job-delete-${job.id}`}
                        disabled={deletingId === job.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onRequestDelete?.(job);
                        }}
                      >
                        {deletingId === job.id ? "삭제 중…" : "기록 삭제"}
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {props.hasMore && props.onLoadMore ? (
        <div className="border-t border-[var(--border)] px-4 py-3 text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="ss-history-load-more"
            disabled={props.loadingMore}
            onClick={props.onLoadMore}
          >
            {props.loadingMore ? "불러오는 중…" : "이전 기록 보기"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
