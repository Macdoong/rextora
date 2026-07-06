import { Badge, Card, Metric } from "@/components/ui/primitives";

import { displayLabel } from "@/src/lib/rextora/displayLabels";

import { EmergencyActionPanel, PaperBotActionPanel } from "./TradingActionClient";

import type { BotStatus, Position, Strategy, TradingMode } from "@/lib/types";



const tradingModes: TradingMode[] = ["PAPER", "LIVE"];



export function TradingModeSelector({ selected = "PAPER" }: { selected?: TradingMode }) {

  return (

    <Card title="거래 모드 선택">

      <div className="grid grid-cols-2 gap-2">

        {tradingModes.map((mode) => (

          <div

            key={mode}

            data-testid={mode === "PAPER" ? "mode-paper" : "mode-live"}

            className={`rounded-lg border p-3 text-center font-semibold ${

              selected === mode ? "border-violet-500 bg-violet-500/20 text-violet-100" : "border-slate-700 bg-slate-900 text-slate-400"

            }`}

          >

            <div className="rextora-body">{displayLabel(mode)}</div>

            {mode === "LIVE" && <div className="rextora-helper mt-1 text-red-300">실전 거래 차단됨</div>}

            {mode === "PAPER" && <div className="rextora-helper mt-1 text-green-300">모의 거래 활성</div>}

          </div>

        ))}

      </div>

      <div className="mt-3 space-y-2">

        <p className="rextora-helper"><strong className="text-slate-200">PAPER 모의 거래:</strong> 실제 주문 없이 가상으로 진입/청산을 테스트합니다. 시장 데이터는 사용할 수 있지만 실제 돈은 움직이지 않습니다.</p>

        <p className="rextora-helper"><strong className="text-slate-200">LIVE 실전 거래:</strong> 설정에서 LIVE를 허용하고 Start LIVE를 눌러야 실제 Binance Futures 주문이 실행됩니다. Binance 연결, TP/SL, 긴급 중단 보호가 적용됩니다.</p>

      </div>

    </Card>

  );

}



export function EmergencyControls() {

  return <EmergencyActionPanel />;

}



export function AutoTradingControlPanel({ bot, strategy, position, selectedCandidate }: { bot: BotStatus; strategy: Strategy; position: Position; selectedCandidate?: string }) {

  const serviceLabel = bot.serviceState === "live-blocked"

    ? "LIVE 실전 거래 조건이 아직 충족되지 않았습니다."

    : displayLabel(bot.serviceState);



  return (

    <Card title="자동매매 관리" action={<Badge tone="success">{displayLabel(bot.mode)}</Badge>}>

      <div className="mb-3 grid grid-cols-2 gap-3">

        <Metric label="선택된 후보" value={selectedCandidate ?? bot.selectedCandidate ?? "없음"} />

        <Metric label="심볼" value={position.symbol} />

        <Metric label="기본 포지션 비율" value="3.00%" />

        <Metric label="최대 레버리지" value="2.5x" />

        <Metric label="TP/SL 방식" value={displayLabel("SERVER REQUIRED")} tone="danger" />

        <Metric label="서버 TP/SL" value={bot.serverTpSlActive ? "모의 활성" : displayLabel("SERVER REQUIRED")} tone={bot.serverTpSlActive ? "success" : "danger"} />

        <Metric label="서비스 상태" value={serviceLabel} />

      </div>

      <PaperBotActionPanel />

    </Card>

  );

}


