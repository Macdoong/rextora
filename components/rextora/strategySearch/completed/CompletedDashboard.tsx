"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { fetchResearchResultsSummary } from "../apiClient";
import type { ResearchResultsSummaryView, StrategySearchJobDetail } from "../types";
import { SearchJobExportMenu } from "../SearchJobExportMenu";
import { CompletedHero } from "./CompletedHero";
import { CompletedAskAiAction } from "./CompletedAskAiAction";
import { CompletedKpiStrip } from "./CompletedKpiStrip";
import { CompletedAnalysisContextCard } from "./CompletedAnalysisContextCard";
import { CompletedCandidateVisualComparison } from "./CompletedCandidateVisualComparison";
import { CompletedQualificationGaugeGrid } from "./CompletedQualificationGaugeGrid";
import { CompletedInsightTiles } from "./CompletedInsightTiles";
import { CompletedRecommendationBriefingRow } from "./CompletedRecommendationBriefingRow";
import { CompletedSummaryRow } from "./CompletedSummaryRow";
import { CompletedRegisterSection } from "./CompletedRegisterSection";
import { CompletedGroupRankingCta } from "./CompletedGroupRankingCta";
import { buildCompletedDashboardViewModel } from "./completedViewModel";
import type { StrategySearchTrialsPage } from "../types";

export function CompletedDashboard(props: {
  job: StrategySearchJobDetail;
  payloadReady: boolean;
  trials: StrategySearchTrialsPage | null;
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
        payloadReady: props.payloadReady,
        trials: props.trials,
        summary,
      }),
    [props.job, props.payloadReady, props.trials, summary],
  );

  return (
    <div
      className="ss-completed-dashboard-layout ss-completed-dashboard-layout--stable ss-completed-dashboard-layout--typography"
      data-testid="ss-completed-dashboard-layout"
      data-completed-data-stable={props.payloadReady ? "true" : "false"}
    >
      <CompletedHero model={model} />
      <CompletedAskAiAction />
      <CompletedAnalysisContextCard model={model} />
      <CompletedKpiStrip model={model} />
      <CompletedSummaryRow model={model} />
      <CompletedRecommendationBriefingRow model={model} />
      <CompletedQualificationGaugeGrid model={model} />
      <CompletedInsightTiles model={model} />
      <CompletedCandidateVisualComparison model={model} />
      <CompletedGroupRankingCta model={model} job={props.job} />

      <div
        className="ss-completed-actions ss-completed-actions--hierarchy"
        data-testid="ss-completed-actions"
      >
        <Link
          href={model.resultsHref}
          className="ss-completed-actions__primary"
          data-completed-action="primary"
          data-testid="ss-completion-open-results"
        >
          상세 결과 보기
        </Link>
        {props.onRetryWithSettings ? (
          <Button
            type="button"
            className="ss-completed-actions__secondary"
            data-completed-action="secondary"
            data-testid="ss-completed-retry-settings"
            onClick={props.onRetryWithSettings}
          >
            설정 수정 후 다시 탐색
          </Button>
        ) : null}
        <Button
          type="button"
          className="ss-completed-actions__tertiary"
          data-completed-action="tertiary"
          data-testid="ss-completion-new-research"
          onClick={props.onNewSearch}
        >
          새 탐색
        </Button>
        <div className="ss-completed-actions__utility">
          <SearchJobExportMenu jobId={props.job.id} status={props.job.status} />
        </div>
      </div>

      <CompletedRegisterSection
        onRegisterBest={props.onRegisterBest}
        onPromoteTop={props.onPromoteTop}
      />
    </div>
  );
}
