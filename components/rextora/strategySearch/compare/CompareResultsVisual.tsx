"use client";

import type { SearchJobCompareRow } from "../searchJobComparison";
import { CompareCountVisual } from "./CompareCountVisual";
import { CompareRateVisual } from "./CompareRateVisual";

function rowById(rows: SearchJobCompareRow[], id: string) {
  return rows.find((row) => row.id === id);
}

export function CompareResultsVisual(props: { rows: SearchJobCompareRow[] }) {
  const evaluated = rowById(props.rows, "funnel-evaluated");
  const pass = rowById(props.rows, "funnel-pass-rate");
  const finalRate = rowById(props.rows, "funnel-final-rate");
  if (!evaluated || !pass || !finalRate) return null;
  return (
    <div className="ss-compare-hero-visual" data-testid="ss-compare-hero-visual">
      <header className="ss-compare-hero-visual__legend" aria-hidden="true">
        <span className="is-left">기준</span>
        <i />
        <span className="is-right">비교</span>
      </header>
      <CompareCountVisual left={evaluated.left} right={evaluated.right} />
      <CompareRateVisual
        testId="ss-compare-pass-rate"
        index="02"
        label="조건 통과율"
        infoCopy="조건 통과 후보 수를 평가 후보 수로 나눈 비율입니다."
        left={pass.left}
        right={pass.right}
      />
      <CompareRateVisual
        testId="ss-compare-final-rate"
        index="03"
        label="최종 적격률"
        infoCopy="평가한 전략 중 최종 적격 기준에 해당하는 후보 비율입니다."
        left={finalRate.left}
        right={finalRate.right}
      />
      <p className="ss-compare-unavailable-copy">비교 가능한 결과 없음 · 설정과 분석 기간은 계속 비교할 수 있습니다.</p>
    </div>
  );
}
