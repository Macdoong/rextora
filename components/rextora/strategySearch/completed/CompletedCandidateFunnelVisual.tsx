"use client";

import { formatCount } from "../formatters";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import { usePresentationEnter } from "./usePresentationEnter";

export function CompletedCandidateFunnelVisual(props: {
  model: CompletedDashboardViewModel;
}) {
  const { funnel, passFail, passRatePct } = props.model;
  const entered = usePresentationEnter(300, props.model.dataStable);
  const gen = funnel.generated;
  const ev = funnel.evaluated;
  const passed = passFail.passed;
  const qualified = funnel.qualified;
  const failed = passFail.failed;

  const wGen = 100;
  const wEv = 92;
  const wPass = Math.max(28, passed != null && ev ? (passed / ev) * 100 : 28);
  const wQual = wPass;

  return (
    <section
      className={
        "ss-completed-funnel-visual" +
        (entered ? " ss-completed-funnel-visual--entered" : "")
      }
      data-testid="ss-completed-verification-flow"
      aria-label="후보 검증 흐름"
    >
      <h3 className="ss-completed-funnel-visual__title">후보 검증 흐름</h3>
      <div className="ss-completed-funnel-visual__flow">
        <div
          className="ss-completed-funnel-visual__stage"
          data-testid="ss-verification-flow-generated"
          style={{ ["--ss-funnel-width" as string]: `${wGen}%` }}
        >
          <span className="ss-completed-funnel-visual__value">
            {gen == null ? "—" : formatCount(gen)}
          </span>
          <span className="ss-completed-funnel-visual__label">후보 생성</span>
          <div className="ss-completed-funnel-visual__shape" />
        </div>
        <span className="ss-completed-funnel-visual__connector" aria-hidden="true">
          ↓
        </span>
        <div
          className="ss-completed-funnel-visual__stage"
          data-testid="ss-verification-flow-evaluated"
          style={{ ["--ss-funnel-width" as string]: `${wEv}%` }}
        >
          <span className="ss-completed-funnel-visual__value">
            {ev == null ? "—" : formatCount(ev)}
          </span>
          <span className="ss-completed-funnel-visual__label">평가</span>
          <div className="ss-completed-funnel-visual__shape" />
        </div>
        <span className="ss-completed-funnel-visual__connector" aria-hidden="true">
          ↓
        </span>
        <div className="ss-completed-funnel-visual__split">
          {failed != null && failed > 0 ? (
            <div
              className="ss-completed-funnel-visual__reject"
              data-testid="ss-verification-flow-rejected"
            >
              <span className="ss-completed-funnel-visual__value">
                {formatCount(failed)}
              </span>
              <span className="ss-completed-funnel-visual__label">탈락</span>
            </div>
          ) : null}
          <div
            className="ss-completed-funnel-visual__stage ss-completed-funnel-visual__stage--pass"
            data-testid="ss-verification-flow-passed"
            style={{ ["--ss-funnel-width" as string]: `${wPass}%` }}
          >
            <span className="ss-completed-funnel-visual__value">
              {passed == null ? "—" : formatCount(passed)}
            </span>
            <span className="ss-completed-funnel-visual__label">검증 통과</span>
            <div className="ss-completed-funnel-visual__shape" />
          </div>
        </div>
        <span className="ss-completed-funnel-visual__connector" aria-hidden="true">
          ↓
        </span>
        <div
          className="ss-completed-funnel-visual__stage ss-completed-funnel-visual__stage--qualified"
          data-testid="ss-verification-flow-qualified"
          style={{ ["--ss-funnel-width" as string]: `${wQual}%` }}
        >
          <span className="ss-completed-funnel-visual__value">
            {formatCount(qualified)}
          </span>
          <span className="ss-completed-funnel-visual__label">최종 적격</span>
          <div className="ss-completed-funnel-visual__shape" />
        </div>
      </div>
      {passed != null && ev != null && passRatePct != null ? (
        <p className="ss-completed-funnel-visual__secondary">
          {formatCount(passed)} / {formatCount(ev)} 후보 통과 · 통과율{" "}
          {passRatePct.toFixed(2)}%
        </p>
      ) : null}
      <details className="ss-completed-funnel-visual__help">
        <summary>통과율이란?</summary>
        <p>
          평가를 완료한 후보 가운데 설정한 검증 기준을 충족한 후보의
          비율입니다. 통과율 자체가 전략의 품질을 의미하지는 않습니다.
        </p>
      </details>
    </section>
  );
}
