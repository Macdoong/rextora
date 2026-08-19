import { Suspense } from "react";
import { ResultsWorkbench } from "@/components/rextora/results/ResultsWorkbench";
import { PageHeader } from "@/components/ui/primitives";
import { AgentContextStrip } from "@/components/rextora/agent/AgentContextStrip";

export default function ResultsPage() {
  return (
    <div className="rextora-page" data-testid="results-page">
      <PageHeader
        eyebrow="RESEARCH RESULTS"
        title="탐색 결과"
        description="이번 연구의 최종 추천과 근거를 먼저 검토한 뒤 전략 등록과 백테스트로 이어갑니다."
      />
      <AgentContextStrip pageLabelKo="탐색 결과" />
      <Suspense
        fallback={
          <p className="text-sm text-slate-400">탐색 결과 화면을 준비합니다…</p>
        }
      >
        <ResultsWorkbench />
      </Suspense>
    </div>
  );
}
