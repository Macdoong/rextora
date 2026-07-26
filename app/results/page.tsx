import { Suspense } from "react";
import { ResultsWorkbench } from "@/components/rextora/results/ResultsWorkbench";

export default function ResultsPage() {
  return (
    <div className="rextora-page" data-testid="results-page">
      <div>
        <h1 className="rextora-page-title text-white">탐색 결과</h1>
        <p className="rextora-helper mt-1.5">
          이번 탐색의 합격 전략·유사 그룹·추천을 확인하고, 기존 전략 라이브러리와
          구분해 다음 단계(백테스트·모의 매매)를 고릅니다. 보호 전략(SAFE)은
          기준선으로만 사용됩니다.
        </p>
      </div>
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
