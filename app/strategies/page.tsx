import { StrategyBuilderPanel } from "@/components/rextora/strategy/builder/StrategyBuilderPanel";

export default function StrategiesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">전략 만들기</h1>
        <p className="mt-1 text-sm text-slate-400">
          초보자도 따라할 수 있는 단계별 전략 설정입니다. 원본 보호 전략은 복사
          후 수정하세요.
        </p>
      </div>
      <p className="text-xs text-slate-500">
        데이터 출처: 저장된 전략 설정 · SAFE 원본 보호
      </p>
      <StrategyBuilderPanel />
    </div>
  );
}
