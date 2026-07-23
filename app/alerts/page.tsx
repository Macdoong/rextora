import { AlertPanel } from "@/components/rextora/AlertPanel";
import { PageHeader } from "@/components/rextora/StatusCards";
import { getAlertSettings, getAssistantStatus, getRecentAlerts } from "@/src/lib/rextora/telegramAssistant";

export default function AlertsPage() {
  const telegramStatus = getAssistantStatus();

  return (
    <div className="rextora-page">
      <PageHeader
        title="알림 / 텔레그램"
        description="봇 상태, 진입 후보, 진입/청산, 위험 상황을 알려주는 비서 기능입니다."
      />
      <AlertPanel
        telegramStatus={telegramStatus}
        settings={getAlertSettings()}
        alerts={getRecentAlerts()}
      />
    </div>
  );
}
