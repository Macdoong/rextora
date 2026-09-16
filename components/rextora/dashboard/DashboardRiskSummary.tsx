import Link from "next/link";
import { Metric, Skeleton } from "@/components/ui/primitives";
import { formatUsdt, type DashStatus } from "./dashboardData";

export function DashboardRiskSummary({
  initialLoading,
  status,
}: {
  initialLoading: boolean;
  status: DashStatus | null;
}) {
  return (
    <section
      className="rextora-dashboard-risk"
      data-testid="dash-live-summary"
      aria-label="위험 및 실전 게이트"
    >
      <div className="rextora-dashboard-section-head">
        <h2 className="rextora-dashboard-section-title">위험 · 실전 게이트</h2>
        <p className="rextora-dashboard-section-desc">
          실전 주문은 승인·안전 조건을 모두 통과한 뒤에만 가능합니다.
        </p>
      </div>
      {initialLoading ? (
        <Skeleton className="h-28" />
      ) : (
        <>
          <div className="rextora-dashboard-risk-grid">
            <Metric
              label="실전 허용"
              value={status?.liveAllowed ? "허용" : "비활성"}
              tone={status?.liveAllowed ? "danger" : "success"}
            />
            <Metric
              label="시작 가능"
              value={status?.canStartLive ? "예" : "아니오"}
            />
            <Metric
              label="포지션"
              value={
                Array.isArray(status?.positions)
                  ? String(status.positions.length)
                  : "0"
              }
            />
            <Metric
              label="긴급 정지"
              value={status?.emergencyActive ? "활성" : "정상"}
              tone={status?.emergencyActive ? "danger" : "default"}
            />
            <Metric
              label="실현 손익"
              value={formatUsdt(
                status?.todayStats?.realizedPnlUsdt ??
                  status?.metrics?.todayRealizedPnlUsdt,
              )}
            />
            <Metric
              label="미실현 손익"
              value={formatUsdt(
                status?.todayStats?.unrealizedPnlUsdt ??
                  status?.metrics?.todayUnrealizedPnlUsdt,
              )}
            />
          </div>
          {status?.liveBlockReason ? (
            <p className="rextora-dashboard-risk-note rextora-dashboard-risk-note--warn">
              {status.liveBlockReason}
            </p>
          ) : (
            <p className="rextora-dashboard-risk-note">
              아직 실전 주문이 전송되지 않습니다. 승인·안전 조건을 모두 통과한
              뒤에만 시작할 수 있습니다.
            </p>
          )}
          <Link
            href="/live-trading"
            className="rextora-dashboard-text-link"
            data-testid="dash-open-live"
          >
            승인 게이트 확인 →
          </Link>
        </>
      )}
    </section>
  );
}
