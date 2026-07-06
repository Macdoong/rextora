import { AlertPanel } from "@/components/rextora/AlertPanel";
import { PageHeader } from "@/components/rextora/StatusCards";
import { getAlertSettings, getAssistantStatus, getRecentAlerts } from "@/src/lib/rextora/telegramAssistant";

export default function AlertsPage() {
  const telegramStatus = getAssistantStatus();

  return (
    <>
      <PageHeader title="알림 / 텔레그램" description="Telegram 알림은 봇 상태, 진입 후보, 진입/청산, 위험 상황을 대표님에게 알려주는 비서 기능입니다." />
      <AlertPanel telegramStatus={telegramStatus} settings={getAlertSettings()} alerts={getRecentAlerts()} />
    </>
  );
}
