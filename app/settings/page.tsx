import { PageHeader } from "@/components/rextora/StatusCards";

import { SettingsTabs } from "@/components/rextora/settings/SettingsTabs";

import { LiveReadinessPanel } from "@/components/rextora/LiveReadinessPanel";

import { Badge, Card, Metric } from "@/components/ui/primitives";

import { displayLabel } from "@/src/lib/rextora/displayLabels";

import { getApiStatus } from "@/src/lib/rextora/apiStatusService";

import { getAssistantStatus } from "@/src/lib/rextora/telegramAssistant";

import { getRextoraSettings } from "@/src/lib/rextora/settings/settingsService";



export default function SettingsPage() {

  const api = getApiStatus();

  const telegram = getAssistantStatus();

  const settings = getRextoraSettings();



  return (

    <>

      <PageHeader title="설정" description="운영 설정을 한국어 안내와 함께 편집하고 저장합니다." />

      <div className="data-grid">

        <div className="col-span-12">

          <Card title="설정 사용 안내">

            <ul className="rextora-helper list-disc space-y-1 pl-5 text-slate-300">

              <li>이 화면에서는 Rextora의 감시, 신호, 비용, 리스크, 주문 실행 조건을 조정합니다.</li>

              <li>API 키와 Telegram 토큰은 이 화면에 저장하지 않습니다.</li>

              <li>실전 거래는 설정만 켠다고 바로 실행되지 않으며, 모든 안전 조건을 통과해야 합니다.</li>

            </ul>

          </Card>

        </div>

        <div className="col-span-12">

          <Card title="실전 연결 준비 순서">

            <ol className="rextora-helper list-decimal space-y-1 pl-5 text-slate-300">

              <li>.env.local에 Binance API 키와 Secret을 입력합니다.</li>

              <li>Telegram Token과 Chat ID를 입력합니다.</li>

              <li>서버를 재시작합니다.</li>

              <li>시스템 상태에서 Binance 읽기, 잔고 조회, Telegram 테스트를 확인합니다.</li>

              <li>모든 LIVE 체크리스트가 통과해야 실전 거래가 가능합니다.</li>

            </ol>

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

              <Metric label="실전 거래 활성화" value={settings.trading.liveTradingEnabled ? displayLabel("ON") : displayLabel("OFF")} tone={settings.trading.liveTradingEnabled ? "danger" : "success"} />

              <Metric label="서버 TP/SL" value={settings.tpSl.serverTpSlRequired ? "필수" : "선택"} />

              <Metric label="Telegram" value={telegram.configured ? displayLabel(telegram.serviceState) : displayLabel("missing")} />

            </div>

          </Card>

        </div>

        <div className="col-span-12">

          <LiveReadinessPanel />

        </div>

        <div className="col-span-12">

          <SettingsTabs />

        </div>

        <div className="col-span-12">

          <Card title="안전 안내">

            <p className="rextora-body text-slate-300">

              Rextora는 투자 조언이 아니며, 모든 투자 결정에 대한 책임은 사용자 본인에게 있습니다. LIVE 실전 거래는 환경변수 승인, 설정, 수동 확인 문구, 전체 사전 점검이 모두 통과할 때만 실행됩니다.

            </p>

          </Card>

        </div>

      </div>

    </>

  );

}


