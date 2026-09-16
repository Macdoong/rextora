import { Suspense } from "react";
import { ResultsWorkbench } from "@/components/rextora/results/ResultsWorkbench";
import { PageHeader } from "@/components/ui/primitives";
import { AgentContextStrip } from "@/components/rextora/agent/AgentContextStrip";
import { ClientHydrated } from "@/components/rextora/ClientHydrated";

export default function ResultsPage() {
  return (
    <div className="rextora-page v3 v3-results" data-testid="results-page">
      <div className="v3-res-pagehead">
        <PageHeader
          compact
          title="탐색 결과"
          description="작업 요약, 후보, 전략 보관함, 탐색 이력을 한 화면에서 관리합니다."
        />
        <p className="v3-res-asof">결과 권한 화면</p>
      </div>
      <ClientHydrated
        fallback={
          <div className="v3-res-hydrate" aria-label="탐색 결과 화면 준비 중" />
        }
      >
        <AgentContextStrip pageLabelKo="탐색 결과" />
        <Suspense
          fallback={
            <p className="text-sm text-slate-400">탐색 결과 화면을 준비합니다…</p>
          }
        >
          <ResultsWorkbench />
        </Suspense>
      </ClientHydrated>
    </div>
  );
}
