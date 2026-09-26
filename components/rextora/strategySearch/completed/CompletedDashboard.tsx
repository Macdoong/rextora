"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { fetchResearchResultsSummary } from "../apiClient";
import type { ResearchResultsSummaryView, StrategySearchJobDetail } from "../types";
import { ResearchRankingGroups } from "../ResearchRankingGroups";
import { SearchJobExportMenu } from "../SearchJobExportMenu";
import { CompletedHero } from "./CompletedHero";
import { CompletedKpiStrip } from "./CompletedKpiStrip";
import { CompletedCandidateReturnComparison } from "./CompletedCandidateReturnComparison";
import { CompletedRecommendationBriefingRow } from "./CompletedRecommendationBriefingRow";
import { CompletedReturnRiskChart } from "./CompletedReturnRiskChart";
import { CompletedSummaryRow } from "./CompletedSummaryRow";
import { buildCompletedDashboardViewModel } from "./completedViewModel";

export function CompletedDashboard(props: {
  job: StrategySearchJobDetail;
  passCount: number;
  onNewSearch: () => void;
  onRetryWithSettings?: (() => void) | null;
  onRegisterBest?: (() => void) | null;
  onPromoteTop?: (() => void) | null;
}) {
  const [summary, setSummary] = useState<ResearchResultsSummaryView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchResearchResultsSummary(props.job.id, controller.signal)
      .then(setSummary)
      .catch(() => setSummary(null));
    return () => controller.abort();
  }, [props.job.id]);

  const model = useMemo(
    () =>
      buildCompletedDashboardViewModel({
        job: props.job,
        qualifiedCount: props.passCount,
        summary,
      }),
    [props.job, props.passCount, summary],
  );

  return (
    <div
      className="ss-completed-dashboard-layout"
      data-testid="ss-completed-dashboard-layout"
    >
      <CompletedHero model={model} />
      <CompletedKpiStrip model={model} />
      <CompletedSummaryRow model={model} />
      <CompletedRecommendationBriefingRow model={model} />
      <CompletedCandidateReturnComparison model={model} />
      <CompletedReturnRiskChart model={model} />

      <div className="ss-completed-actions" data-testid="ss-completed-actions">
        <Link
          href={model.resultsHref}
          className="ss-btn-primary"
          data-testid="ss-completion-open-results"
        >
          상세 결과 보기
        </Link>
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
          className="ss-btn-tertiary"
          data-testid="ss-completion-new-research"
          onClick={props.onNewSearch}
        >
          새 탐색
        </Button>
        <SearchJobExportMenu jobId={props.job.id} status={props.job.status} />
      </div>

      {model.groupAware ? (
        <details
          className="ss-completed-details"
          data-testid="ss-completed-ranking-disclosure"
        >
          <summary>그룹별 순위 (상세)</summary>
          <ResearchRankingGroups
            source={props.job}
            unknownLegacy={props.job.unknownLegacy}
            operatorFacing
          />
        </details>
      ) : null}

      <details className="ss-completed-details" data-testid="ss-completed-ops-disclosure">
        <summary>등록 · 운영 (선택)</summary>
        <div className="ss-completed-details__ops">
          {props.onRegisterBest ? (
            <Button type="button" className="ss-btn-secondary" onClick={props.onRegisterBest}>
              통과 후보 등록
            </Button>
          ) : null}
          {props.onPromoteTop ? (
            <Button type="button" className="ss-btn-secondary" onClick={props.onPromoteTop}>
              추천 후보 등록
            </Button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
