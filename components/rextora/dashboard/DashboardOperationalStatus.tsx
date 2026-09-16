import { StatusBanner } from "@/components/ui/primitives";
import type { DashStatus } from "./dashboardData";

export function DashboardOperationalStatus({
  error,
  initialLoading,
  status,
}: {
  error: string | null;
  initialLoading: boolean;
  status: DashStatus | null;
}) {
  const operationalMessage = error
    ? "최신 운영 상태를 불러오지 못했습니다. 기존 화면은 유지됩니다."
    : initialLoading
      ? "운영 상태를 확인하고 있습니다."
      : status?.liveAllowed
        ? "실전 거래 권한이 설정되어 있습니다. 주문은 별도 승인 전까지 실행되지 않습니다."
        : "모의 거래 모드이며 실전 주문은 승인 게이트에서 차단됩니다.";

  const blockers: string[] = [];
  if (!initialLoading && !error) {
    if (status?.emergencyActive) blockers.push("긴급 정지 활성");
    if (!status?.canStartLive && status?.liveBlockReason) {
      blockers.push(status.liveBlockReason);
    }
  }

  return (
    <section
      className="rextora-dashboard-status"
      data-testid="dashboard-operational-panel"
      aria-label="운영 및 안전 상태"
    >
      <StatusBanner
        status={error ? "error" : initialLoading ? "loading" : "info"}
        message={operationalMessage}
        data-testid="dashboard-operational-status"
      />
      {!initialLoading && !error ? (
        <div className="rextora-dashboard-status-meta">
          <span className="rextora-dashboard-status-chip">
            {status?.liveAllowed ? "실전 권한 설정됨" : "실전 주문 차단"}
          </span>
          <span className="rextora-dashboard-status-chip">
            {status?.emergencyActive ? "긴급 정지" : "운영 정상"}
          </span>
          {blockers.length > 0 ? (
            <span className="rextora-dashboard-status-chip rextora-dashboard-status-chip--warn">
              {blockers.length}건 차단
            </span>
          ) : (
            <span className="rextora-dashboard-status-chip">차단 없음</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
