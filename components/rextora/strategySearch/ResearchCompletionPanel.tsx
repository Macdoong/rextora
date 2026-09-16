"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import type { StrategySearchJobDetail } from "./types";
import {
  formatCount,
  formatMs,
  formatPct,
  researchStatusLabelKo,
  resolveDisplayTerminationReason,
} from "./formatters";
import { cleanStrategyDisplayName } from "./displayNames";
import { fetchResearchResultsSummary } from "./apiClient";
import type { ResearchResultsSummaryView } from "./types";
import { LifecycleNextActionsPanel } from "./LifecycleNextActionsPanel";
import { ResearchRankingGroups } from "./ResearchRankingGroups";
import { hasAuthoritativeRankingGroups } from "@/src/lib/rextora/researchRankingReadModel";

function BigStat(props: {
  label: string;
  value: string;
  testId?: string;
  help?: string;
}) {
  return (
    <div
      className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
      data-testid={props.testId}
    >
      <div className="ss-field-label text-emerald-100/80">{props.label}</div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
        {props.value}
      </div>
      {props.help ? (
        <p className="mt-1 text-xs text-emerald-100/70">{props.help}</p>
      ) : null}
    </div>
  );
}

function completionHeaderKo(input: {
  status: string;
  passCount: number;
  titleKo?: string | null;
  completionReason?: string | null;
}): string {
  if (input.titleKo) {
    if (/cancelled|USER_CANCELLED|cancel/i.test(input.titleKo)) {
      return "사용자 중지";
    }
    return input.titleKo;
  }
  if (input.status === "failed" && input.passCount > 0) return "부분 완료";
  if (input.status === "failed") return "실패";
  if (input.status === "paused" || input.completionReason === "PAUSED") {
    return "일시정지";
  }
  if (
    input.status === "cancelled" ||
    input.status === "cancelling" ||
    input.status === "cancel_requested"
  ) {
    return "사용자 중지";
  }
  if (input.status === "completed") return "정상 완료";
  return "연구 종료";
}

export function ResearchCompletionPanel(props: {
  job: StrategySearchJobDetail;
  passCount: number;
  bestStrategyName?: string | null;
  onNewResearch: () => void;
  onResume?: (() => void) | null;
  onRegisterBest?: (() => void) | null;
  onPromoteTop?: (() => void) | null;
  bestStrategyId?: string | null;
}) {
  const { job, passCount, onNewResearch } = props;
  const [summary, setSummary] = useState<ResearchResultsSummaryView | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    const boot = window.setTimeout(() => {
      void fetchResearchResultsSummary(job.id, controller.signal)
        .then((data) => setSummary(data))
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setSummary(null);
          }
        });
    }, 0);
    return () => {
      window.clearTimeout(boot);
      controller.abort();
    };
  }, [job.id]);

  const activelyRunning =
    job.status === "running" ||
    job.status === "pause_requested" ||
    job.status === "queued" ||
    (job.executionActive === true &&
      job.status !== "cancel_requested" &&
      job.status !== "cancelling" &&
      job.status !== "cancelled" &&
      job.status !== "failed" &&
      job.status !== "completed" &&
      job.status !== "paused");

  const resultsHref = job.id
    ? `/results?jobId=${encodeURIComponent(job.id)}`
    : "/results";
  const usableForHandoff =
    (summary?.outcome?.usable ?? passCount > 0) &&
    (job.status === "completed" ||
      job.status === "cancelled" ||
      (job.status === "failed" && passCount > 0));

  if (activelyRunning || job.status === "interrupted") {
    return null;
  }

  const outcome = summary?.outcome;
  const title = completionHeaderKo({
    status: job.status,
    passCount,
    titleKo: outcome?.titleKo,
    completionReason: job.completionReason,
  });
  const detail =
    outcome?.detailKo ??
    (job.status === "cancelled" ||
    job.status === "cancelling" ||
    job.status === "cancel_requested"
      ? "결과가 안전하게 보존되었습니다."
      : null);

  const reason = resolveDisplayTerminationReason({
    status: job.status,
    completionReason: job.completionReason,
    terminationReason: job.terminationReason,
    failureMessage: job.failureMessage,
  });
  const status = researchStatusLabelKo(job.status, {
    completionReason: job.completionReason,
    preservedCandidateCount: passCount,
  });
  const elapsed = formatMs(job.statistics?.elapsedMs ?? null);
  const tested =
    summary?.counts.evaluatedStrategies ??
    job.uniqueEvaluatedCount ??
    job.candidateBudgetUsed ??
    job.statistics?.evaluated ??
    job.completedIterations;
  const counts = summary?.counts;
  const qualified = counts?.qualifiedStrategies ?? passCount;
  const registered = counts?.registeredStrategies ?? 0;
  const recommendable = counts?.recommendationEligibleStrategies ?? null;
  const backtestRec = counts?.backtestRecommendedStrategies ?? null;
  const top10Saved = counts?.top10Saved ?? null;
  const finalEligible = counts?.stageFinalRecommendable ?? null;
  const usable = outcome?.usable ?? passCount > 0;

  const topEntries = (job.liveTop10?.entries ?? []).slice(0, 3);
  const mergedTop = topEntries.map((row) => ({
    ...row,
    badges: Array.from(new Set(row.roleBadges ?? [])),
  }));

  const canResume =
    Boolean(props.onResume) &&
    (job.status === "paused" || job.retryable === true);

  return (
    <section
      className="rextora-card space-y-5 border border-emerald-500/30 bg-emerald-500/5 p-6"
      data-testid="ss-research-completion"
      aria-labelledby="ss-research-completion-title"
    >
      {/* 1. Completion Header */}
      <div>
        <h3 id="ss-research-completion-title" className="ss-section-title">
          {title}
        </h3>
        <p
          className="mt-1.5 text-sm text-emerald-100"
          data-testid="ss-completion-status-line"
        >
          {detail ?? status}
          {reason && !/USER_|cancelled|summary\./i.test(reason)
            ? ` · ${reason}`
            : ""}
          {elapsed ? ` · ${elapsed}` : ""}
        </p>
        <p
          className="mt-1 text-sm text-emerald-50/90"
          data-testid="ss-completion-result-equation"
        >
          {usable
            ? "결과가 보존되었습니다. 합격 trial은 등록과 별개입니다."
            : "사용 가능한 합격 결과가 없습니다."}
        </p>
      </div>

      {/* 2. Key Result Summary — max 6 */}
      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        data-testid="ss-completion-primary-metrics"
      >
        <BigStat
          label="평가"
          value={`${formatCount(tested)}개`}
          testId="ss-completion-tested"
        />
        <BigStat
          label="기본 합격"
          value={`${formatCount(qualified)}개`}
          testId="ss-completion-approved"
        />
        <BigStat
          label="최종 적격"
          value={
            finalEligible != null
              ? `${formatCount(finalEligible)}개`
              : recommendable != null
                ? `${formatCount(recommendable)}개`
                : "0개"
          }
          testId="ss-completion-final-eligible"
        />
        <BigStat
          label="TOP 10"
          value={
            top10Saved != null ? `${formatCount(top10Saved)}개` : "0개"
          }
          testId="ss-completion-top10-saved"
        />
        <BigStat
          label="등록"
          value={`${formatCount(registered)}개`}
          testId="ss-completion-registered"
        />
        <BigStat
          label="백테스트 추천"
          value={
            backtestRec != null ? `${formatCount(backtestRec)}개` : "0개"
          }
          testId="ss-completion-backtest-rec"
        />
      </div>

      {/* 3. Final Top 3 — only when qualified; else temporary non-qualified best */}
      {hasAuthoritativeRankingGroups(job) ? (
        <div data-testid="ss-completion-ranking-groups">
          <div className="ss-field-label text-emerald-100/80">그룹별 최종 추천</div>
          <ResearchRankingGroups
            source={job}
            unknownLegacy={job.unknownLegacy}
          />
        </div>
      ) : qualified > 0 && mergedTop.length > 0 ? (
        <div data-testid="ss-completion-final-top3">
          <div className="ss-field-label text-emerald-100/80">
            기존 평가 형식 · 최종 TOP 3
          </div>
          <ul className="mt-2 space-y-2">
            {mergedTop.map((row) => (
              <li
                key={`${row.rank}-${row.strategyHash}`}
                className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--text-primary)]">
                    {row.rank}.{" "}
                    {cleanStrategyDisplayName(row.displayAlias) ||
                      row.readableName}
                  </span>
                  <span className="tabular-nums text-emerald-100">
                    {formatPct(row.netReturn)} · MDD{" "}
                    {formatPct(row.maxDrawdown)}
                  </span>
                </div>
                {row.badges.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.badges.map((b) => (
                      <span
                        key={b}
                        className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] text-emerald-50"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : qualified === 0 &&
        (job.currentBestSummary || mergedTop.length > 0) ? (
        <div data-testid="ss-completion-temporary-best">
          <div className="ss-field-label text-amber-100/90">
            임시 평가 상위 후보 — 합격 아님
          </div>
          <p className="mt-1 text-sm text-slate-300">
            {cleanStrategyDisplayName(job.currentBestSummary) ||
              (mergedTop[0]
                ? cleanStrategyDisplayName(mergedTop[0].displayAlias) ||
                  mergedTop[0].readableName
                : "평가된 합격 전략이 없습니다.")}
          </p>
        </div>
      ) : null}

      {/* 4. Primary next action */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={resultsHref}
          className={`ss-btn-primary inline-flex items-center rounded-lg border px-4 py-3 text-base font-semibold ${
            usableForHandoff || usable
              ? "border-emerald-400/60 bg-emerald-500/30 text-emerald-50 ring-2 ring-emerald-400/40"
              : "border-emerald-500/40 bg-emerald-500/20 text-emerald-50"
          }`}
          data-testid="ss-completion-open-results"
        >
          최종 TOP 10 검토
        </Link>
        {(usableForHandoff || usable) ? (
          <p
            className="text-sm text-emerald-100/80"
            data-testid="ss-completion-handoff-hint"
          >
            자동 이동하지 않습니다.
          </p>
        ) : null}
      </div>

      {/* 5. Secondary actions */}
      <div className="flex flex-wrap gap-2">
        {passCount > 0 && props.onPromoteTop ? (
          <Button
            type="button"
            className="ss-btn-primary"
            data-testid="ss-completion-promote-top"
            onClick={props.onPromoteTop}
          >
            추천 전략 등록
          </Button>
        ) : null}
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
        {recommendable != null && recommendable > 0 ? (
          <Link
            href={`/backtest?sourceResearchJobId=${encodeURIComponent(job.id)}`}
            className="ss-btn-primary inline-flex items-center rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sky-100"
            data-testid="ss-completion-backtest-recommended"
          >
            새 기간으로 백테스트
          </Link>
        ) : null}
        {canResume ? (
          <Button
            type="button"
            className="ss-btn-primary"
            data-testid="ss-completion-resume"
            onClick={() => props.onResume?.()}
          >
            개선 탐색
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="ss-btn-primary"
          data-testid="ss-completion-new-research"
          onClick={onNewResearch}
        >
          새 탐색 시작
        </Button>
      </div>

      {/* 6. Lifecycle Progress — compact */}
      {usable && counts ? (
        <div data-testid="ss-completion-lifecycle">
          <LifecycleNextActionsPanel counts={counts} compact />
        </div>
      ) : null}

      {/* 7. Research details — collapsed */}
      <details
        className="text-xs text-emerald-100/70"
        data-testid="ss-completion-details"
      >
        <summary className="cursor-pointer select-none">연구 상세</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {hasAuthoritativeRankingGroups(job) ? null : (
          <BigStat
            label="최종 정리 후 최고"
            value={
              formatPct(
                summary?.finalizedBest?.netReturn ??
                  summary?.topProfit?.netReturn ??
                  null,
              ) ?? "없음"
            }
            testId="ss-completion-finalized-best"
          />
          )}
          <BigStat
            label="실시간 탐색 최고"
            value={
              formatPct(
                summary?.liveSearchBest?.netReturn ?? job.bestReturn ?? null,
              ) ?? "없음"
            }
            testId="ss-completion-live-best"
          />
          {hasAuthoritativeRankingGroups(job) ? null : (
          <BigStat
            label="최고 안정"
            value={
              summary?.topStable
                ? (formatPct(summary.topStable.maxDrawdown) ?? "없음")
                : "없음"
            }
            testId="ss-completion-best-stable"
          />
          )}
          <BigStat
            label="연구 시간"
            value={elapsed ?? "없음"}
            testId="ss-completion-time"
          />
          <BigStat
            label="심볼"
            value={(job.symbols ?? []).join(", ") || "없음"}
            testId="ss-completion-symbols"
          />
          <BigStat
            label="연구 상태"
            value={status}
            testId="ss-completion-research-status"
          />
        </div>
      </details>

      {/* 8. Technical details — collapsed */}
      <details
        className="text-xs text-emerald-100/60"
        data-testid="ss-completion-tech-details"
      >
        <summary className="cursor-pointer select-none">개발자 정보</summary>
        <div className="mt-2 space-y-1 font-mono">
          <p>jobId: {job.id}</p>
          <p>status: {job.status}</p>
          {job.completionReason ? (
            <p>completionReason: {job.completionReason}</p>
          ) : null}
          {job.terminationReason ? (
            <p>terminationReason: {job.terminationReason}</p>
          ) : null}
          {summary?.finalizedBest?.paramsHash ? (
            <p>finalizedHash: {summary.finalizedBest.paramsHash}</p>
          ) : null}
        </div>
      </details>
    </section>
  );
}
