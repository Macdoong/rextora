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

function BigStat(props: {
  label: string;
  value: string;
  testId?: string;
  help?: string;
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
      {props.help ? (
        <p className="mt-1 text-xs text-emerald-100/70">{props.help}</p>
      ) : null}
    </div>
  );
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
    const boot = window.setTimeout(() => {
      void fetchResearchResultsSummary(job.id)
        .then((data) => setSummary(data))
        .catch(() => setSummary(null));
    }, 0);
    return () => window.clearTimeout(boot);
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

  if (activelyRunning) {
    return null;
  }

  const outcome = summary?.outcome;
  const title =
    outcome?.titleKo ??
    (job.status === "failed" && passCount > 0
      ? "부분 결과"
      : job.status === "failed"
        ? "실패"
        : job.status === "paused" || job.completionReason === "PAUSED"
          ? "일시정지"
          : job.status === "cancel_requested"
            ? "중지 요청 중"
            : job.status === "cancelling"
              ? "결과 정리 중"
              : job.status === "cancelled"
                ? "사용자 중지"
                : job.status === "completed"
                  ? "AI 연구 완료"
                  : "연구 종료");
  const detail =
    outcome?.detailKo ??
    (job.status === "cancelled"
      ? "결과가 안전하게 보존되었습니다."
      : job.status === "cancelling"
        ? "중지 후 결과를 정리하는 중입니다."
        : job.status === "cancel_requested"
          ? "중지 요청이 접수되었습니다."
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

  const finalizedReturn = formatPct(
    summary?.finalizedBest?.netReturn ?? summary?.topProfit?.netReturn ?? null,
  );
  const liveReturn = formatPct(
    summary?.liveSearchBest?.netReturn ?? job.bestReturn ?? null,
  );
  const finalizedName = summary?.finalizedBest?.readableName
    ? cleanStrategyDisplayName(summary.finalizedBest.readableName)
    : summary?.topProfit?.readableName
      ? cleanStrategyDisplayName(summary.topProfit.readableName)
      : null;

  const canResume =
    Boolean(props.onResume) &&
    (job.status === "paused" || job.retryable === true);

  return (
    <section
      className="rextora-card space-y-6 border border-emerald-500/30 bg-emerald-500/5 p-6"
      data-testid="ss-research-completion"
      aria-labelledby="ss-research-completion-title"
    >
      <div>
        <h3 id="ss-research-completion-title" className="ss-section-title">
          {title}
        </h3>
        <p
          className="mt-1.5 text-sm text-emerald-100"
          data-testid="ss-completion-status-line"
        >
          {detail ?? status}
          {reason ? ` · ${reason}` : ""}
          {elapsed ? ` · ${elapsed}` : ""}
        </p>
        <p
          className="mt-2 text-sm text-emerald-50/90"
          data-testid="ss-completion-result-equation"
        >
          원본 상태 {job.status}
          {job.completionReason ? ` · ${job.completionReason}` : ""} · 합격
          전략은 trial 기록이며 전략 라이브러리 등록은 별도입니다.
          {usable ? " · 결과 사용 가능" : " · 사용 가능한 합격 결과 없음"}
        </p>
      </div>

      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        data-testid="ss-completion-primary-metrics"
      >
        <BigStat
          label="평가 전략"
          value={`${formatCount(tested)}개`}
          testId="ss-completion-tested"
        />
        <BigStat
          label="기본 합격"
          value={`${formatCount(qualified)}개`}
          testId="ss-completion-approved"
          help="기본 조건 통과 trial 수 · 자동 등록되지 않습니다"
        />
        <BigStat
          label="최종 추천 가능"
          value={
            finalEligible != null
              ? `${formatCount(finalEligible)}개`
              : recommendable != null
                ? `${formatCount(recommendable)}개`
                : "없음"
          }
          testId="ss-completion-final-eligible"
        />
        <BigStat
          label="TOP 10 저장"
          value={
            top10Saved != null ? `${formatCount(top10Saved)}개` : "없음"
          }
          testId="ss-completion-top10-saved"
          help="장기 저장 단기 후보 · 최대 10개"
        />
        <BigStat
          label="등록 전략"
          value={`${formatCount(registered)}개`}
          testId="ss-completion-registered"
        />
        <BigStat
          label="백테스트 추천"
          value={backtestRec != null ? `${formatCount(backtestRec)}개` : "없음"}
          testId="ss-completion-backtest-rec"
        />
      </div>

      {usable && counts ? (
        <LifecycleNextActionsPanel counts={counts} />
      ) : null}

      {job.liveTop10?.phase === "final" &&
      (job.liveTop10.finalVsLive?.length ?? 0) > 0 ? (
        <div
          className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
          data-testid="ss-completion-final-vs-live"
        >
          <div className="ss-field-label text-emerald-100/80">
            실시간 순위 → 최종 순위
          </div>
          <ul className="mt-2 space-y-1 text-sm text-[var(--text-primary)]">
            {job.liveTop10.finalVsLive!.slice(0, 10).map((row) => (
              <li key={row.strategyHash}>
                {row.strategyHash.slice(0, 8)}… · 실시간{" "}
                {row.liveRank != null ? `${row.liveRank}위` : "—"} → 최종{" "}
                {row.finalRank != null ? `${row.finalRank}위` : "제외"}
                {row.exclusionReasonKo ? ` (${row.exclusionReasonKo})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="text-xs text-emerald-100/70" data-testid="ss-completion-details">
        <summary className="cursor-pointer select-none">
          최고 수익 · 연구 상세 · 기술 종료 정보
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <BigStat
            label="최종 정리 후 최고"
            value={finalizedReturn ?? "없음"}
            testId="ss-completion-finalized-best"
            help={
              summary?.finalizedBest?.explanationKo ??
              "유사 전략 정리와 최종 순위 계산 후 선정된 최고 전략"
            }
          />
          <BigStat
            label="실시간 탐색 최고"
            value={liveReturn ?? "없음"}
            testId="ss-completion-live-best"
            help={
              summary?.liveSearchBest?.explanationKo ??
              "탐색 중 마지막으로 기록된 최고 전략"
            }
          />
          <BigStat
            label="최고 안정"
            value={
              summary?.topStable
                ? (formatPct(summary.topStable.maxDrawdown) ?? "없음")
                : "추천 가능한 안정 전략 없음"
            }
            testId="ss-completion-best-stable"
          />
          <BigStat
            label="최종 추천 가능 여부"
            value={
              summary?.topRecommend
                ? summary.topRecommend.displayAlias ||
                  summary.topRecommend.readableName
                : "추천 가능한 안정 전략 없음"
            }
            testId="ss-completion-final-recommend"
          />
          <BigStat
            label="연구 시간"
            value={elapsed ?? "없음"}
            testId="ss-completion-time"
          />
          <BigStat
            label="최종 정리 최고 전략"
            value={finalizedName ?? "없음"}
            testId="ss-completion-best-name"
          />
          <BigStat
            label="실제 심볼"
            value={(job.symbols ?? []).join(", ") || "없음"}
            testId="ss-completion-symbols"
          />
          <BigStat
            label="연구 상태"
            value={status}
            testId="ss-completion-research-status"
          />
          {job.candidateBudget != null ? (
            <BigStat
              label="자원 안전 제한"
              value={`${formatCount(job.candidateBudget)}개 (정상 종료 조건 아님)`}
              testId="ss-completion-budget"
            />
          ) : null}
        </div>
        <p className="mt-2">
          실시간 탐색 최고 {liveReturn ?? "없음"}
          {summary?.liveSearchBest?.paramsHash
            ? ` · hash ${summary.liveSearchBest.paramsHash}`
            : ""}
        </p>
        <p>
          최종 정리 후 최고 {finalizedReturn ?? "없음"}
          {summary?.finalizedBest?.paramsHash
            ? ` · hash ${summary.finalizedBest.paramsHash}`
            : ""}
        </p>
      </details>

      <div className="flex flex-wrap gap-2">
        <Link
          href={resultsHref}
          className={`ss-btn-primary inline-flex items-center rounded-lg border px-4 py-3 text-base font-semibold ${
            usableForHandoff || usable
              ? "border-emerald-400/60 bg-emerald-500/30 text-emerald-50 ring-2 ring-emerald-400/40"
              : "border-emerald-500/40 bg-emerald-500/20 text-emerald-50"
          }`}
          data-testid="ss-completion-open-results"
        >
          탐색 결과 확인
        </Link>
        {(usableForHandoff || usable) ? (
          <p
            className="flex items-center text-sm text-emerald-100/80"
            data-testid="ss-completion-handoff-hint"
          >
            자동 이동하지 않습니다. 원할 때 「탐색 결과 확인」으로 이동하세요.
          </p>
        ) : null}
        {recommendable != null && recommendable > 0 ? (
          <Link
            href={`/results?jobId=${encodeURIComponent(props.job.id)}`}
            className="ss-btn-primary inline-flex items-center rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sky-100"
            data-testid="ss-completion-backtest-recommended"
          >
            백테스트
          </Link>
        ) : null}
        <Link
          href="/paper-trading"
          className="ss-btn-primary inline-flex items-center rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-slate-100"
          data-testid="ss-completion-paper"
        >
          모의매매
        </Link>
        <Link
          href="/live-trading"
          className="ss-btn-primary inline-flex items-center rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-slate-100"
          data-testid="ss-completion-live"
        >
          실전 검토
        </Link>
        {canResume ? (
          <Button
            type="button"
            className="ss-btn-primary"
            data-testid="ss-completion-resume"
            onClick={() => props.onResume?.()}
          >
            이어서 탐색
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
        {passCount > 0 && props.onPromoteTop ? (
          <Button
            type="button"
            className="ss-btn-primary"
            data-testid="ss-completion-promote-top"
            onClick={props.onPromoteTop}
          >
            상위 전략 일괄 등록
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
      </div>
      <p
        className="text-xs text-emerald-100/70"
        data-testid="ss-completion-next-workflow"
      >
        다음 워크플로: 백테스트 → 모의매매 → 실전 검토 (자동 이동 없음)
      </p>
      {canResume ? (
        <p className="text-xs text-emerald-100/80" data-testid="ss-resume-policy">
          이어서 탐색: 기존 마감 시각을 유지하고, 이미 본 후보 해시는 건너뜁니다.
          새 탐색 시작을 고르면 새 설정·새 마감으로 시작합니다.
        </p>
      ) : null}
    </section>
  );
}
