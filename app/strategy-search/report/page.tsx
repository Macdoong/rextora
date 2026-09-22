import { Suspense } from "react";
import { SearchJobPrintReport } from "@/components/rextora/strategySearch/SearchJobPrintReport";
import { ClientHydrated } from "@/components/rextora/ClientHydrated";

export default function StrategySearchReportPage() {
  return (
    <div
      className="rextora-page ss-page v3 v3-strategy-search ss-print-route"
      data-testid="strategy-search-report-page"
    >
      <ClientHydrated
        fallback={
          <div className="v3-ss-hydrate" aria-label="탐색 보고서 준비 중" />
        }
      >
        <Suspense fallback={<div className="v3-ss-hydrate" aria-label="탐색 보고서 준비 중" />}>
          <SearchJobPrintReport />
        </Suspense>
      </ClientHydrated>
    </div>
  );
}
