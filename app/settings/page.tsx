import { PageHeader } from "@/components/rextora/StatusCards";
import { SettingsTabs } from "@/components/rextora/settings/SettingsTabs";
import { Badge, Card, Metric, StatusBadge } from "@/components/ui/primitives";
import { displayLabel } from "@/src/lib/rextora/displayLabels";
import { getApiStatus } from "@/src/lib/rextora/apiStatusService";
import { getAssistantStatus } from "@/src/lib/rextora/telegramAssistant";
import { getRextoraSettings } from "@/src/lib/rextora/settings/settingsService";

export default function SettingsPage() {
  const api = getApiStatus();
  const telegram = getAssistantStatus();
  const settings = getRextoraSettings();
  const liveAllowed = settings.trading.allowLiveTrading || settings.trading.liveTradingEnabled;

  return (
    <div className="rextora-page">
      <PageHeader
        title="설정"
        description="기본·고급·위험 구역으로 정리된 운영 설정입니다. 비밀값은 환경변수로만 관리합니다."
      />
      <div className="data-grid">
        <div className="col-span-12">
          <Card
            title="설정 사용 안내"
            description="모의와 실전을 명확히 구분합니다."
          >
            <ul className="rextora-helper list-disc space-y-1.5 pl-5 text-slate-300">
              <li>모의 거래는 실제 주문을 넣지 않습니다.</li>
              <li>실전 거래는 Binance Futures에 실제 주문을 넣습니다.</li>
              <li>실전 자동매매 시작 버튼을 누르기 전에는 실제 주문이 실행되지 않습니다.</li>
              <li>API 키와 Telegram 토큰은 이 화면에 저장하지 않습니다.</li>
            </ul>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <Card
            title="환경변수 상태"
            action={<Badge tone="muted">비밀값은 env 전용</Badge>}
          >
            <div className="grid grid-cols-2 gap-3">
              <Metric
                label="Binance API 키"
                value={
                  <StatusBadge
                    status={api.configured.binanceApiKey ? displayLabel("configured") : displayLabel("missing")}
                  />
                }
              />
              <Metric
                label="Binance Secret"
                value={
                  <StatusBadge
                    status={api.configured.binanceApiSecret ? displayLabel("configured") : displayLabel("missing")}
                  />
                }
              />
              <Metric
                label="Telegram Token"
                value={
                  <StatusBadge
                    status={api.configured.telegramToken ? displayLabel("configured") : displayLabel("missing")}
                  />
                }
              />
              <Metric
                label="Telegram Chat ID"
                value={
                  <StatusBadge
                    status={api.configured.telegramChatId ? displayLabel("configured") : displayLabel("missing")}
                  />
                }
              />
            </div>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <Card title="현재 운영 모드 요약">
            <div className="grid grid-cols-2 gap-3">
              <Metric
                label="기본 거래 모드"
                value={displayLabel(settings.trading.defaultMode)}
                tone={settings.trading.defaultMode === "PAPER" ? "success" : "danger"}
                help="처음 실행 시 적용되는 모드입니다."
                recommended="모의 거래"
              />
              <Metric
                label="실전 거래 허용"
                value={liveAllowed ? displayLabel("ON") : displayLabel("OFF")}
                tone={liveAllowed ? "danger" : "success"}
                help="허용해도 시작 버튼 전에는 주문이 없습니다."
                recommended="OFF"
              />
              <Metric
                label="서버 손절/익절"
                value={settings.tpSl.serverTpSlRequired ? "필수" : "선택"}
                help="진입 직후 거래소 보호 주문 등록 여부입니다."
                recommended="필수"
              />
              <Metric
                label="텔레그램"
                value={telegram.configured ? displayLabel(telegram.serviceState) : displayLabel("missing")}
              />
            </div>
          </Card>
        </div>

        <div className="col-span-12">
          <SettingsTabs />
        </div>

        <div className="col-span-12">
          <Card title="안전 안내">
            <p className="rextora-body text-slate-300">
              Rextora는 투자 조언이 아니며, 모든 자본 결정에 대한 책임은 사용자 본인에게
              있습니다. 서버 손절/익절은 진입 직후 Binance에 보호 주문을 등록하며, 등록
              실패 시 포지션을 즉시 정리합니다.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
