import { LearningLogPanel } from "@/components/rextora/learning/LearningLogPanel";
import { getLearningLogViewModel } from "@/src/lib/rextora/learningLogger";

export default function LearningLogPage() {
  const view = getLearningLogViewModel(50);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">거래 / 분석 (레거시)</h1>
        <p className="mt-1 text-sm text-slate-400">
          주 화면은 <a className="text-violet-300 underline" href="/trades">거래 기록</a>과{" "}
          <a className="text-violet-300 underline" href="/ai-reports">AI 분석 보고</a>입니다.
        </p>
      </div>
      <LearningLogPanel
        logs={view.logs}
        showDebugCandidates={view.showDebugCandidates}
        coinRates={view.coinRates}
        signalRates={view.signalRates}
      />
    </div>
  );
}
