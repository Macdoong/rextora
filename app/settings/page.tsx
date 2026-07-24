import { PageHeader } from "@/components/rextora/StatusCards";
import { LifecycleSettingsShell } from "@/components/rextora/settings/LifecycleSettingsShell";
import { Card } from "@/components/ui/primitives";
import { getApiStatus } from "@/src/lib/rextora/apiStatusService";
import { getAssistantStatus } from "@/src/lib/rextora/telegramAssistant";
import { getRextoraSettings } from "@/src/lib/rextora/settings/settingsService";
import { getRiskStatus } from "@/src/lib/rextora/riskManager";
import { resolveRiskState } from "@/src/lib/rextora/riskEngine";
import { getUnifiedRiskView } from "@/src/lib/rextora/metrics/riskService";

export default function SettingsPage() {
  const api = getApiStatus();
  const telegram = getAssistantStatus();
  const settings = getRextoraSettings();
  const liveAllowed =
    settings.trading.allowLiveTrading || settings.trading.liveTradingEnabled;

  const baseRisk = getRiskStatus();
  const riskView = getUnifiedRiskView();
  const risk = {
    ...baseRisk,
    riskState: resolveRiskState(baseRisk),
    riskView,
  };

  return (
    <div className="rextora-page">
      <PageHeader
        title="시스템 설정"
        description="데이터·비용·탐색·거래소·위험·알림·상태·전문가 모드를 관리합니다. 비밀값은 환경변수로만 관리합니다."
      />
      <div className="data-grid">
        <div className="col-span-12">
          <LifecycleSettingsShell
            apiConfigured={api.configured}
            telegramConfigured={telegram.configured}
            telegramServiceState={telegram.serviceState}
            defaultMode={settings.trading.defaultMode}
            liveAllowed={liveAllowed}
            serverTpSlRequired={settings.tpSl.serverTpSlRequired}
            risk={risk}
          />
        </div>
        <div className="col-span-12">
          <Card title="안전 안내">
            <p className="rextora-body text-slate-300">
              Rextora는 투자 조언이 아니며, 모든 자본 결정에 대한 책임은 사용자
              본인에게 있습니다. 현재 검증 모드에서는 실제 주문이 전송되지
              않습니다.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
