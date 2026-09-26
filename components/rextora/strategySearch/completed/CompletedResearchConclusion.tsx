"use client";

import type { CompletedDashboardViewModel } from "./completedViewModel";
import { formatPct } from "../formatters";

export function CompletedResearchConclusion(props: {
  model: CompletedDashboardViewModel;
}) {
  const { model } = props;
  const r = model.recommendation;

  return (
    <section
      className="ss-completed-briefing ss-completed-briefing--enter"
      data-testid="ss-completed-ai-briefing"
    >
      <header className="ss-completed-briefing__head">
        <span className="ss-completed-briefing__icon" aria-hidden="true">
          ◈
        </span>
        <div>
          <p className="ss-completed-briefing__status">분석 완료</p>
          <h3 className="ss-completed-briefing__title">AI 연구원 브리핑</h3>
        </div>
      </header>
      {r ? (
        <>
          <div className="ss-completed-briefing__block">
            <h4>추천 이유</h4>
            <p>검증 조건을 통과한 후보 중 현재 추천 대상으로 선정됐습니다.</p>
            {model.completionReason === "QUALIFIED_TARGET_REACHED" ? (
              <p>목표 조건 달성으로 탐색이 종료되었습니다.</p>
            ) : null}
          </div>
          <div className="ss-completed-briefing__block">
            <h4>성과 해석</h4>
            <ul className="ss-completed-briefing__chips">
              {r.netReturn != null ? (
                <li data-testid="ss-briefing-chip-return">
                  수익률 {formatPct(r.netReturn)}
                </li>
              ) : null}
              {r.winRate != null ? (
                <li>승률 {formatPct(r.winRate)}</li>
              ) : null}
              {r.tradeCount != null ? <li>거래 {r.tradeCount}회</li> : null}
              {r.score != null ? <li>점수 {r.score.toFixed(3)}</li> : null}
            </ul>
          </div>
          <div className="ss-completed-briefing__block">
            <h4>주의할 위험</h4>
            <ul className="ss-completed-briefing__list">
              <li>
                최대 낙폭{" "}
                {r.maxDrawdown != null ? formatPct(r.maxDrawdown) : "—"}
              </li>
              <li>거래수 {r.tradeCount ?? "—"}회</li>
              <li>과거 검증 결과이며 미래 성과를 보장하지 않습니다.</li>
            </ul>
          </div>
        </>
      ) : (
        <p className="ss-completed-briefing__empty">
          추천할 합격 후보가 없어 브리핑은 제한적입니다. 평가 결과와 퍼널을
          확인한 뒤 조건을 조정해 다시 탐색하세요.
        </p>
      )}
    </section>
  );
}
