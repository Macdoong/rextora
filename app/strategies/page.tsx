import { StrategyManagerPanel } from "@/components/rextora/strategy/StrategyManagerPanel";

export default function StrategiesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">전략 관리</h1>
        <p className="mt-1 text-sm text-slate-400">전략 선택·복사·편집·저장. SAFE_v44_i4060 원본은 잠금입니다.</p>
      </div>
      <StrategyManagerPanel />
    </div>
  );
}
