import { StrategyBuilderPanel } from "@/components/rextora/strategy/builder/StrategyBuilderPanel";

/** Expert Mode — manual 9-step strategy builder (not in primary nav). */
export function ExpertStrategiesPage() {
  return (
    <div className="rextora-page" data-testid="expert-strategies-page">
      <div>
        <h1 className="rextora-page-title text-white">전문가 모드 · 전략 편집</h1>
        <p className="rextora-helper mt-1.5">
          기본 워크플로는{" "}
          <a href="/strategy-search" className="text-sky-300 underline">
            전략 탐색
          </a>
          입니다. 이 화면은 디버깅·고급 편집 전용입니다. SAFE는 수정할 수 없습니다.
        </p>
      </div>
      <details open className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <summary
          className="cursor-pointer font-semibold text-amber-100"
          data-testid="expert-strategy-builder-toggle"
        >
          전문가 모드 — 단계별 수동 전략 빌더
        </summary>
        <div className="mt-4">
          <StrategyBuilderPanel />
        </div>
      </details>
    </div>
  );
}

export default ExpertStrategiesPage;
