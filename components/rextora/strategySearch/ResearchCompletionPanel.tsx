"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, ConfirmDialog } from "@/components/ui/primitives";
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
import {
  buildCompletedBacktestHref,
  canShowQualifiedRegister,
  canShowRecommendedRegister,
  completedActionClass,
  isValidCompletedBacktestHref,
  resolveAuthoritativeQualifiedCount,
  resolveCompletedBacktestHandoffCandidate,
  resolveCompletedPrimaryAction,
  resultsReviewAvailable,
  completionReasonHeroMessageKo,
} from "./completionCustomerView";
import { SearchJobExportMenu } from "./SearchJobExportMenu";

function BigStat(props: {
  label: string;
  value: string;
  testId?: string;
  help?: string;
}) {
  return (
    <div
      className="ss-completion-metric rounded-xl px-4 py-3"
      data-testid={props.testId}
    >
      <div className="ss-completion-metric__label">{props.label}</div>
      <div className="ss-completion-metric__value">
        {props.value}
      </div>
      {props.help ? (
        <p className="ss-completion-metric__help">{props.help}</p>
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
  onRegisterForBacktest?: ((iteration: number) => void) | null;
  registeringForBacktest?: boolean;
  bestStrategyId?: string | null;
  primaryDashboard?: boolean;
  onRetryWithSettings?: (() => void) | null;
}) {
  const { job, passCount, onNewResearch } = props;
  const [summary, setSummary] = useState<ResearchResultsSummaryView | null>(
    null,
  );
  const [confirmPromote, setConfirmPromote] = useState(false);
  const [confirmBacktestRegister, setConfirmBacktestRegister] = useState(false);

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
  const qualified = resolveAuthoritativeQualifiedCount({
    summaryQualified: counts?.qualifiedStrategies,
    jobQualifiedCount: job.qualifiedCount,
    trialPageCount: passCount,
  });
  const registered = counts?.registeredStrategies ?? 0;
  const recommendable = counts?.recommendationEligibleStrategies ?? null;
  const backtestRec = counts?.backtestRecommendedStrategies ?? null;
  const top10Saved = counts?.top10Saved ?? null;
  const finalEligible = counts?.stageFinalRecommendable ?? null;
  const usable = outcome?.usable ?? (passCount > 0 || qualified > 0);
  const reviewAvailable = resultsReviewAvailable({
    usable,
    usableForHandoff,
  });
  const showRecommendedRegister = canShowRecommendedRegister({
    recommendable,
    finalEligible,
    hasPromoteHandler: Boolean(props.onPromoteTop),
  });
  const showQualifiedRegister = canShowQualifiedRegister({
    qualifiedCount: qualified,
    hasRegisterHandler: Boolean(props.onRegisterBest),
  });
  const handoffCandidate = resolveCompletedBacktestHandoffCandidate(
    summary
      ? {
          rankingGroups: summary.rankingGroups ?? job.rankingGroups,
          topRecommend: summary.topRecommend,
          backtestRecommendations: summary.backtestRecommendations,
          representatives: summary.representatives,
          symbol: summary.symbol || job.config.symbols[0],
          timeframe: summary.timeframe || job.config.timeframe,
        }
      : null,
  );
  const registeredBacktestHref =
    handoffCandidate?.registeredStrategyId
      ? buildCompletedBacktestHref({
          strategyId: handoffCandidate.registeredStrategyId,
          sourceParamsHash: handoffCandidate.paramsHash,
          symbol: handoffCandidate.symbol,
          timeframe: handoffCandidate.timeframe,
          sourceResearchJobId: job.id,
          sourceTrialIteration: handoffCandidate.iteration,
          sourceClusterId: handoffCandidate.clusterId,
        })
      : null;
  const backtestAvailable =
    handoffCandidate != null &&
    (Boolean(registeredBacktestHref) ||
      Boolean(props.onRegisterForBacktest));
  const primaryAction = resolveCompletedPrimaryAction({
    showRecommendedRegister,
    showQualifiedRegister,
    backtestAvailable,
    reviewAvailable,
  });

  const topEntries = (job.liveTop10?.entries ?? []).slice(0, 3);
  const mergedTop = topEntries.map((row) => ({
    ...row,
    badges: Array.from(new Set(row.roleBadges ?? [])),
  }));

  const canResume =
    Boolean(props.onResume) &&
    (job.status === "paused" || job.retryable === true);

  const marketSymbol = job.config.symbols[0] ?? "—";
  const marketTimeframe = job.config.timeframe || "—";
  const heroReason =
    completionReasonHeroMessageKo(job.completionReason) ??
    (reason && !/USER_|cancelled|summary\./i.test(reason) ? reason : null);
  const dashboardTitle =
    props.primaryDashboard && job.status === "completed"
      ? "✓ 전략 탐색 완료"
      : title;
  return (
    <section
      className={
        "ss-completion-hero rextora-card space-y-5 p-6" +
        (props.primaryDashboard ? " ss-completion-hero--dashboard" : "")
      }
      data-testid="ss-research-completion"
      aria-labelledby="ss-research-completion-title"
    >
      <header className="ss-completion-hero__head ss-completion-hero__head--enter">
        <p className="ss-completion-hero__mark" aria-hidden="true">
          ✓
        </p>
        <h3 id="ss-research-completion-title" className="ss-completion-hero__title">
          {dashboardTitle}
        </h3>
        {heroReason ? (
          <p
            className="ss-completion-hero__reason"
            data-testid="ss-completion-hero-reason"
          >
            {heroReason}
          </p>
        ) : null}
        <p className="ss-completion-hero__market">
          {marketSymbol} · {marketTimeframe}
          {elapsed ? ` · ${elapsed}` : ""}
        </p>
        <p
          className="ss-completion-hero__status"
          data-testid="ss-completion-status-line"
        >
          {detail ?? status}
          {reason && !/USER_|cancelled|summary\./i.test(reason)
            ? ` · ${reason}`
            : ""}
        </p>
        <p
          className="ss-completion-hero__note"
          data-testid="ss-completion-result-equation"
        >
          {usable
            ? "결과가 보존되었습니다. 통과 후보는 라이브러리 등록과 별개입니다."
            : "사용 가능한 합격 결과가 없습니다."}
        </p>
      </header>

      <ol className="ss-completion-pipe" data-testid="ss-completion-pipeline">
        <li>
          <span>평가</span>
          <strong>{formatCount(tested)}</strong>
        </li>
        <li aria-hidden="true" className="ss-completion-pipe__line" />
        <li>
          <span>통과 후보</span>
          <strong>{formatCount(qualified)}</strong>
        </li>
        <li aria-hidden="true" className="ss-completion-pipe__line" />
        <li>
          <span>최종 적격</span>
          <strong>
            {finalEligible != null
              ? formatCount(finalEligible)
              : recommendable != null
                ? formatCount(recommendable)
                : formatCount(0)}
          </strong>
        </li>
      </ol>

      <div
        className="ss-completion-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        data-testid="ss-completion-primary-metrics"
      >
        <BigStat
          label="평가"
          value={`${formatCount(tested)}개`}
          help="실제 평가가 끝난 전략 수입니다."
          testId="ss-completion-tested"
        />
        <BigStat
          label="통과 후보"
          value={`${formatCount(qualified)}개`}
          help="자격 기준을 통과한 전략 수입니다. 목록 페이지 제한과 다릅니다."
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
          help="추천 가능하면서 비용 스트레스까지 통과한 대표 전략 수입니다. 그룹별 최종 추천(각 전략군에서 자격을 통과한 대표)과 다른 계약입니다."
          testId="ss-completion-final-eligible"
        />
        <BigStat
          label="저장 후보 목록"
          value={
            top10Saved != null ? `${formatCount(top10Saved)}개` : "0개"
          }
          help="저장된 최종 후보 목록 크기입니다. 그룹별 추천과 별개입니다."
          testId="ss-completion-top10-saved"
        />
        <BigStat
          label="등록"
          value={`${formatCount(registered)}개`}
          help="전략 라이브러리에 이미 등록된 수입니다."
          testId="ss-completion-registered"
        />
        <BigStat
          label="백테스트 추천"
          value={
            backtestRec != null ? `${formatCount(backtestRec)}개` : "0개"
          }
          help="새 기간 백테스트로 넘길 수 있는 추천 대표 전략 수입니다."
          testId="ss-completion-backtest-rec"
        />
      </div>

      {hasAuthoritativeRankingGroups(job) ? (
        <div data-testid="ss-completion-ranking-groups">
          <h4 className="ss-completion-subhead">그룹별 최종 추천</h4>
          <p className="ss-completion-guidance" data-testid="ss-group-rec-contract">
            통과 후보는 자격 기준을 통과한 전략입니다. 최종 적격은 그 위에서 추천·비용 필터를 통과한 대표입니다. 그룹별 최종 추천은 각 전략군 안에서 자격을 통과한 대표이며, 최종 적격 수와 같지 않을 수 있습니다.
          </p>
          <ResearchRankingGroups
            source={job}
            unknownLegacy={job.unknownLegacy}
            operatorFacing
          />
        </div>
      ) : qualified > 0 && mergedTop.length > 0 ? (
        <div data-testid="ss-completion-final-top3">
          <h4 className="ss-completion-subhead">기존 평가 형식 · 최종 TOP 3</h4>
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
          <h4 className="ss-completion-subhead">임시 평가 상위 후보 — 합격 아님</h4>
          <p className="mt-1 text-sm ss-completion-guidance">
            {cleanStrategyDisplayName(job.currentBestSummary) ||
              (mergedTop[0]
                ? cleanStrategyDisplayName(mergedTop[0].displayAlias) ||
                  mergedTop[0].readableName
                : "평가된 합격 전략이 없습니다.")}
          </p>
        </div>
      ) : null}

      <div className="ss-completion-actions">
        {reviewAvailable ? (
          <Link
            href={resultsHref}
            className={completedActionClass("review_results", primaryAction)}
            data-testid="ss-completion-open-results"
          >
            이 탐색 결과
          </Link>
        ) : (
          <span
            className="ss-btn-primary is-disabled"
            aria-disabled="true"
            data-testid="ss-completion-open-results"
          >
            이 탐색 결과
          </span>
        )}
        {showRecommendedRegister ? (
          <Button
            type="button"
            className={completedActionClass("register_recommended", primaryAction)}
            data-testid="ss-completion-promote-top"
            onClick={() => setConfirmPromote(true)}
          >
            추천 후보 등록
          </Button>
        ) : null}
        {showQualifiedRegister ? (
          <Button
            type="button"
            className={completedActionClass("register_qualified", primaryAction)}
            data-testid="ss-completion-register"
            onClick={props.onRegisterBest ?? undefined}
          >
            통과 후보 등록
          </Button>
        ) : null}
        {reviewAvailable ? (
          <p
            className="ss-completion-guidance"
            data-testid="ss-completion-handoff-hint"
          >
            검토 후 다음 단계를 직접 선택합니다.
          </p>
        ) : null}
      </div>

      <div className="ss-completion-actions ss-completion-actions--secondary">
        {showQualifiedRegister && !showRecommendedRegister ? (
          <p className="ss-completion-guidance" data-testid="ss-register-qualify-note">
            통과 후보만 등록할 수 있습니다. 자격 미통과 최고 점수 후보는 등록하지 않습니다.
          </p>
        ) : null}
        {backtestAvailable &&
        isValidCompletedBacktestHref(registeredBacktestHref) &&
        registeredBacktestHref ? (
          <Link
            href={registeredBacktestHref}
            className={completedActionClass("backtest", primaryAction)}
            data-testid="ss-completion-backtest-recommended"
          >
            새 기간으로 백테스트
          </Link>
        ) : backtestAvailable && handoffCandidate ? (
          <Button
            type="button"
            className={completedActionClass("backtest", primaryAction)}
            data-testid="ss-completion-backtest-recommended"
            disabled={props.registeringForBacktest === true}
            onClick={() => setConfirmBacktestRegister(true)}
          >
            새 기간으로 백테스트
          </Button>
        ) : null}
        {canResume ? (
          <Button
            type="button"
            className="ss-btn-secondary"
            data-testid="ss-completion-resume"
            onClick={() => props.onResume?.()}
          >
            개선 탐색
          </Button>
        ) : null}
        {props.onRetryWithSettings ? (
          <Button
            type="button"
            className="ss-btn-secondary"
            data-testid="ss-completed-retry-settings"
            onClick={props.onRetryWithSettings}
          >
            설정 수정 후 다시 탐색
          </Button>
        ) : null}
        <Button
          type="button"
          className={completedActionClass("new_search", primaryAction)}
          data-testid="ss-completion-new-research"
          onClick={onNewResearch}
        >
          새 탐색
        </Button>
        <SearchJobExportMenu jobId={job.id} status={job.status} />
      </div>

      {usable && counts ? (
        <div data-testid="ss-completion-lifecycle">
          <LifecycleNextActionsPanel counts={counts} />
        </div>
      ) : null}

      <details
        className="ss-completion-research-detail"
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

      {showRecommendedRegister ? (
        <ConfirmDialog
          open={confirmPromote}
          title="추천 후보 등록"
          description="추천 자격이 있는 후보를 최대 10개까지 전략 라이브러리에 등록합니다. 자격 미통과 최고 점수 후보는 포함하지 않습니다."
          confirmLabel="등록"
          cancelLabel="취소"
          tone="success"
          onCancel={() => setConfirmPromote(false)}
          onConfirm={() => {
            setConfirmPromote(false);
            props.onPromoteTop?.();
          }}
        />
      ) : null}
      {handoffCandidate && !registeredBacktestHref ? (
        <ConfirmDialog
          open={confirmBacktestRegister}
          title="새 기간으로 백테스트"
          description="이 추천 후보를 전략 라이브러리에 등록한 뒤 백테스트를 엽니다. 이미 등록된 전략이면 그대로 사용합니다. 자격 미통과 최고 점수 후보는 등록하지 않습니다."
          confirmLabel="등록 후 열기"
          cancelLabel="취소"
          tone="success"
          loading={props.registeringForBacktest === true}
          onCancel={() => setConfirmBacktestRegister(false)}
          onConfirm={() => {
            const iteration = handoffCandidate.iteration;
            setConfirmBacktestRegister(false);
            props.onRegisterForBacktest?.(iteration);
          }}
        />
      ) : null}
    </section>
  );
}
