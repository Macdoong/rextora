import { ResultsWorkbench } from "@/components/rextora/results/ResultsWorkbench";

export default function ResultsPage() {
  return (
    <div className="rextora-page" data-testid="results-page">
      <div>
        <h1 className="rextora-page-title text-white">탐색 결과</h1>
        <p className="rextora-helper mt-1.5">
          연구 합격 전략·성과·SAFE 기준선을 한곳에서 검토합니다. 사용자는 승인·등록만
          수행합니다.
        </p>
      </div>
      <ResultsWorkbench />
    </div>
  );
}
