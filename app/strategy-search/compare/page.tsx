import { Suspense } from "react";
import { SearchJobCompareView } from "@/components/rextora/strategySearch/SearchJobCompareView";
import { PageHeader } from "@/components/ui/primitives";
import { ClientHydrated } from "@/components/rextora/ClientHydrated";

export default function StrategySearchComparePage() {
  return (
    <div
      className="rextora-page ss-page v3 v3-strategy-search"
      data-testid="strategy-search-compare-page"
    >
      <div className="v3-ss-pagehead">
        <PageHeader
          compact
          title="탐색 결과 비교"
          description="결과, 기간, 조건을 한 화면에서 비교합니다."
        />
      </div>
      <ClientHydrated
        fallback={
          <div className="v3-ss-hydrate" aria-label="탐색 비교 화면 준비 중" />
        }
      >
        <Suspense fallback={<div className="v3-ss-hydrate" aria-label="탐색 비교 준비 중" />}>
          <SearchJobCompareView />
        </Suspense>
      </ClientHydrated>
    </div>
  );
}
