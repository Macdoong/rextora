import { PageHeader } from "@/components/rextora/StatusCards";
import { SettingsTabs } from "@/components/rextora/settings/SettingsTabs";
import { Badge, Card, Metric } from "@/components/ui/primitives";
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
    <>
      <PageHeader title="설정" description="개인 운영에 필요한 거래·감시·주문 설정을 한국어로 편집합니다." />
      <div className="data-grid">
        <div className="col-span-12">
          <Card title="설정 사용 안내">
            <ul className="rextora-helper list-disc space-y-1 pl-5 text-slate-300">
              <li>모의 거래는 실제 주문을 넣지 않습니다.</li>
              <li>실전 거래는 Binance Futures에 실제 주문을 넣습니다.</li>
              <li>실전 자동매매 시작 버튼을 누르기 전에는 실제 주문이 실행되지 않습니다.</li>
              <li>API 키와 Telegram 토큰은 이 화면에 저장하지 않습니다.</li>
            </ul>
          </Card>
        </div>

        <div className="col-span-12">
          <Card title="환경변수 상태" action={<Badge tone="muted">비밀값은 env 전용</Badge>}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Binance API 키" value={api.configured.binanceApiKey ? displayLabel("configured") : displayLabel("missing")} />
              <Metric label="Binance Secret" value={api.configured.binanceApiSecret ? displayLabel("configured") : displayLabel("missing")} />
              <Metric label="Telegram Token" value={api.configured.telegramToken ? displayLabel("configured") : displayLabel("missing")} />
              <Metric label="Telegram Chat ID" value={api.configured.telegramChatId ? displayLabel("configured") : displayLabel("missing")} />
            </div>
          </Card>
        </div>

        <div className="col-span-12">
          <Card title="현재 운영 모드 요약">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="기본 거래 모드" value={displayLabel(settings.trading.defaultMode)} tone={settings.trading.defaultMode === "PAPER" ? "success" : "danger"} />
              <Metric label="실전 거래 허용" value={liveAllowed ? displayLabel("ON") : displayLabel("OFF")} tone={liveAllowed ? "danger" : "success"} />
              <Metric label="서버 손절/익절" value={settings.tpSl.serverTpSlRequired ? "필수" : "선택"} />
              <Metric label="텔레그램" value={telegram.configured ? displayLabel(telegram.serviceState) : displayLabel("missing")} />
            </div>
          </Card>
        </div>

        <div className="col-span-12">
          <SettingsTabs />
        </div>

        <div className="col-span-12">
          <Card title="안전 안내">
            <p className="rextora-body text-slate-300">
              Rextora는 투자 조언이 아니며, 모든 투자 결정에 대한 책임은 사용자 본인에게 있습니다. 서버 손절/익절은 진입 직후 Binance에 보호 주문을 등록하며, 등록 실패 시 포지션을 즉시 정리합니다.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
