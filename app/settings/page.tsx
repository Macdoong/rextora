import { LifecycleSettingsShell } from "@/components/rextora/settings/LifecycleSettingsShell";
import { V3Card } from "@/components/rextora/v3/V3Card";
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
    <div className="rextora-page v3 v3-settings" data-testid="settings-page">
      <div className="v3-st-pagehead">
        <header>
          <h1 className="rextora-page-title">시스템 설정</h1>
          <p>
            데이터·비용·탐색·거래소·AI·위험·알림·상태·전문가 모드를 관리합니다.
            비밀값은 환경변수로만 관리합니다.
          </p>
        </header>
        <p className="v3-st-asof">구역별 저장</p>
      </div>
      <LifecycleSettingsShell
        apiConfigured={api.configured}
        liveGateFacts={{
          futuresPermission: api.futuresPermission,
          orderPermission: api.orderPermission,
          liveAllowed,
        }}
        exchangeFacts={{
          testnetEnv: api.configured.binanceTestnet,
          serviceState: api.serviceState,
          realOrderEngineConnected: api.realOrderEngineConnected,
        }}
        telegramConfigured={telegram.configured}
        telegramServiceState={telegram.serviceState}
        telegramEnabled={settings.telegram.telegramEnabled}
        defaultMode={settings.trading.defaultMode}
        liveAllowed={liveAllowed}
        liveTradingEnabled={settings.trading.liveTradingEnabled}
        allowLiveTradingFlag={settings.trading.allowLiveTrading}
        serverTpSlRequired={settings.tpSl.serverTpSlRequired}
        risk={risk}
      />
      <V3Card title="안전 안내">
        <p className="v3-st-note">
          Rextora는 투자 조언이 아니며, 모든 자본 결정에 대한 책임은 사용자
          본인에게 있습니다. 현재 검증 모드에서는 실제 주문이 전송되지
          않습니다.
        </p>
      </V3Card>
    </div>
  );
}
