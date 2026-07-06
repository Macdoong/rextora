import { CurrentPositionCard } from "@/components/rextora/CurrentPositionsCard";
import { PageHeader } from "@/components/rextora/StatusCards";
import { AutoTradingControlPanel, EmergencyControls, TradingModeSelector } from "@/components/rextora/trading/TradingPanels";
import { LiveReadinessPanel } from "@/components/rextora/LiveReadinessPanel";
import { LiveTradingActionPanel } from "@/components/rextora/trading/TradingActionClient";
import { getTopCandidates } from "@/src/lib/rextora/aiRanker";
import { getEffectiveSafeStrategy } from "@/src/lib/rextora/strategyLiveApproval";
import { botStatusSeed, positionSeed } from "@/src/lib/rextora/seedData";

export default function TradingPage() {
  const bot = botStatusSeed;
  const top = getTopCandidates(1)[0];
  const strategy = getEffectiveSafeStrategy();

  return (
    <>
      <PageHeader title="자동매매" description="PAPER 모의 감시를 기본으로 봇을 안전하게 제어합니다." />
      <div className="data-grid">
        <div className="col-span-12 xl:col-span-4"><TradingModeSelector selected={bot.mode} /></div>
        <div className="col-span-12 xl:col-span-8"><EmergencyControls /></div>
        <div className="col-span-12 xl:col-span-6">
          <AutoTradingControlPanel bot={bot} strategy={strategy} position={positionSeed} selectedCandidate={top?.symbol} />
        </div>
        <div className="col-span-12 xl:col-span-6"><CurrentPositionCard position={positionSeed} /></div>
        <div className="col-span-12 xl:col-span-6"><LiveTradingActionPanel /></div>
        <div className="col-span-12 xl:col-span-6"><LiveReadinessPanel /></div>
      </div>
    </>
  );
}
