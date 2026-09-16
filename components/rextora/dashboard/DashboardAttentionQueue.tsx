import Link from "next/link";
import { Skeleton } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import type { ReviewItem } from "./dashboardData";
import {
  RESEARCH_RECOVERY_HREF,
  dashboardAttentionHiddenCopy,
  dashboardAttentionTitle,
  dashboardRecoveryViewAllLabel,
} from "./dashboardResearchSelection";

export function DashboardAttentionQueue({
  initialLoading,
  reviewItems,
  attentionTotal = 0,
  attentionHiddenCount = 0,
}: {
  initialLoading: boolean;
  reviewItems: ReviewItem[];
  attentionTotal?: number;
  attentionHiddenCount?: number;
}) {
  const hiddenCopy = dashboardAttentionHiddenCopy(attentionHiddenCount);

  return (
    <section
      className="rextora-dashboard-attention"
      data-testid="dash-review-required"
      aria-label="확인이 필요한 항목"
    >
      <div className="rextora-dashboard-section-head">
        <h2 className="rextora-dashboard-section-title">
          {dashboardAttentionTitle(attentionTotal)}
        </h2>
        <p className="rextora-dashboard-section-desc">
          승인·검토·차단 해제가 필요한 항목입니다.
        </p>
      </div>
      {initialLoading ? (
        <div className="space-y-3" aria-label="확인 항목 불러오는 중">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : reviewItems.length === 0 ? (
        <EmptyState
          message="지금 확인할 항목이 없습니다."
          hint="탐색이 끝나거나 승인이 필요하면 여기에 표시됩니다."
        />
      ) : (
        <>
          <ul className="rextora-dashboard-attention-list">
            {reviewItems.map((item) => (
              <li
                key={`${item.href}:${item.what}`}
                className="rextora-dashboard-attention-item"
              >
                <p className="rextora-dashboard-attention-what">{item.what}</p>
                <p className="rextora-dashboard-attention-why">{item.why}</p>
                <Link href={item.href} className="rextora-dashboard-attention-link">
                  {item.actionLabel} →
                </Link>
              </li>
            ))}
          </ul>
          {hiddenCopy ? (
            <p
              className="rextora-dashboard-section-desc"
              data-testid="dash-attention-hidden-count"
            >
              {hiddenCopy}
            </p>
          ) : null}
          {attentionHiddenCount > 0 ? (
            <Link
              href={RESEARCH_RECOVERY_HREF}
              className="rextora-dashboard-attention-link"
              data-testid="dash-attention-view-all"
            >
              {dashboardRecoveryViewAllLabel()} →
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}
