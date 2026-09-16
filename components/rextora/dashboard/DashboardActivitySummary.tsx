import { Badge, Metric, Skeleton } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import { DashboardActionLink } from "./DashboardActionLink";
import {
  formatMs,
  type DashStatus,
  type ResearchJob,
} from "./dashboardData";
import {
  dashboardResearchActivityTitle,
  dashboardResearchBadgeLabel,
  researchJobHref,
  type DashboardResearchSelection,
} from "./dashboardResearchSelection";

export function DashboardActivitySummary({
  initialLoading,
  researchSelection,
  completedRecent,
  generationHint,
  paperName,
  paperSessionStatus,
  status,
}: {
  initialLoading: boolean;
  researchSelection: DashboardResearchSelection<ResearchJob>;
  completedRecent: ResearchJob | undefined;
  generationHint: string | null;
  paperName: string | null;
  paperSessionStatus: string | null;
  status: DashStatus | null;
}) {
  const currentResearch = researchSelection.currentResearch;
  const activityTitle = dashboardResearchActivityTitle(currentResearch);

  return (
    <section
      className="rextora-dashboard-activity"
      aria-label="최근 연구 및 모의 매매"
    >
      <div className="rextora-dashboard-section-head">
        <h2 className="rextora-dashboard-section-title">최근 증거 · 활동</h2>
        <p className="rextora-dashboard-section-desc">
          연구 진행과 모의 매매 세션 요약입니다.
        </p>
      </div>

      <div className="rextora-dashboard-activity-grid">
        <article
          className="rextora-dashboard-activity-card"
          data-testid="dash-current-research"
        >
          <h3 className="rextora-dashboard-activity-title">{activityTitle}</h3>
          {initialLoading ? (
            <div className="grid gap-3 sm:grid-cols-3" aria-label="현재 연구 불러오는 중">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : !currentResearch ? (
            <EmptyState
              message="진행 중인 탐색이 없습니다."
              hint="새 탐색을 시작하세요."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge
                  tone={
                    researchSelection.executingResearch ? "success" : "muted"
                  }
                >
                  {dashboardResearchBadgeLabel(currentResearch)}
                </Badge>
                <Badge>{currentResearch.searchName || "탐색"}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Metric
                  label="시장"
                  value={(currentResearch.symbols ?? []).join(", ") || "—"}
                />
                <Metric label="시간봉" value={currentResearch.timeframe ?? "—"} />
                <Metric
                  label={
                    currentResearch.status === "paused" ? "활성 경과" : "경과"
                  }
                  value={formatMs(currentResearch.elapsedMs, {
                    legacyLabel: "시간 정보 없음",
                  })}
                />
                <Metric
                  label={
                    currentResearch.status === "paused"
                      ? "재개 후 남은 시간"
                      : "남은 시간"
                  }
                  value={formatMs(currentResearch.remainingMs ?? null, {
                    legacyLabel: "시간 정보 없음",
                  })}
                />
                <Metric
                  label="평가한 전략"
                  value={currentResearch.uniqueEvaluatedCount ?? 0}
                />
                <Metric
                  label="합격"
                  value={currentResearch.qualifiedCount ?? 0}
                />
              </div>
              {generationHint ? (
                <p className="rextora-dashboard-activity-hint">{generationHint}</p>
              ) : null}
              <DashboardActionLink
                href={researchJobHref(currentResearch.id)}
                size="sm"
              >
                탐색 상세 보기
              </DashboardActionLink>
            </div>
          )}
        </article>

        <article
          className="rextora-dashboard-activity-card"
          data-testid="dash-paper-summary"
        >
          <h3 className="rextora-dashboard-activity-title">모의 매매</h3>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="세션 전략" value={paperName ?? "없음"} />
            <Metric
              label="세션 상태"
              value={paperSessionStatus ?? status?.botStatusLabel ?? "없음"}
            />
          </div>
          <p className="rextora-dashboard-activity-note">
            모의 매매는 실제 주문 없이 세션 기록만 따릅니다.
          </p>
          <DashboardActionLink href="/paper-trading" size="sm" data-testid="dash-open-paper">
            모의 매매 확인
          </DashboardActionLink>
        </article>

        {completedRecent ? (
          <article className="rextora-dashboard-activity-card">
            <h3 className="rextora-dashboard-activity-title">최근 완료 탐색</h3>
            <p className="rextora-dashboard-activity-note">
              {completedRecent.searchName || "탐색"} ·{" "}
              {completedRecent.status}
            </p>
            <DashboardActionLink
              href={`/results?jobId=${encodeURIComponent(completedRecent.id)}`}
              size="sm"
              data-testid="dash-open-results"
            >
              결과 보기
            </DashboardActionLink>
          </article>
        ) : (
          <article className="rextora-dashboard-activity-card">
            <h3 className="rextora-dashboard-activity-title">탐색 결과</h3>
            <p className="rextora-dashboard-activity-note">
              완료된 탐색 결과를 검토할 수 있습니다.
            </p>
            <DashboardActionLink href="/results" size="sm" data-testid="dash-open-results">
              탐색 결과 열기
            </DashboardActionLink>
          </article>
        )}
      </div>
    </section>
  );
}
