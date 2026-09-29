"use client";

import { formatCount } from "../formatters";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import { useCompletedMotion } from "./useCompletedMotion";

const FLOW_STAGES: Array<{
  key: "generated" | "evaluated" | "passed" | "qualified";
  suffix: string;
  testId: string;
}> = [
  { key: "generated", suffix: "생성", testId: "ss-verification-flow-generated" },
  { key: "evaluated", suffix: "평가", testId: "ss-verification-flow-evaluated" },
  { key: "passed", suffix: "검증 통과", testId: "ss-verification-flow-passed" },
  { key: "qualified", suffix: "최종 적격", testId: "ss-verification-flow-qualified" },
];

export function CompletedVerificationFlowCard(props: {
  model: CompletedDashboardViewModel;
}) {
  const animate = useCompletedMotion() && props.model.dataStable;
  const { funnel, passFail, passRatePct } = props.model;
  const max = Math.max(
    ...FLOW_STAGES.map((s) => funnel[s.key] ?? 0),
    1,
  );

  return (
    <section
      className="ss-completed-verification-flow ss-completed-verification-flow--enter"
      data-testid="ss-completed-verification-flow"
      aria-label="후보 검증 흐름"
    >
      <h3 className="ss-completed-verification-flow__title">후보 검증 흐름</h3>
      <ol className="ss-completed-verification-flow__steps">
        {FLOW_STAGES.map((stage, index) => {
          const value = funnel[stage.key];
          const width =
            value != null && max > 0
              ? `${Math.max(6, (Number(value) / max) * 100)}%`
              : "6%";
          return (
            <li
              key={stage.key}
              className="ss-completed-verification-flow__step"
              data-testid={stage.testId}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="ss-completed-verification-flow__head">
                <span className="ss-completed-verification-flow__value">
                  {value == null ? "—" : formatCount(value)}
                </span>
                <span className="ss-completed-verification-flow__label">
                  {stage.suffix}
                </span>
              </div>
              <div className="ss-completed-verification-flow__track">
                <div
                  className={
                    "ss-completed-verification-flow__fill" +
                    (animate ? " ss-completed-verification-flow__fill--animate" : "")
                  }
                  style={
                    animate
                      ? ({ ["--ss-flow-width" as string]: width } as React.CSSProperties)
                      : { width }
                  }
                />
              </div>
              {index < FLOW_STAGES.length - 1 ? (
                <span className="ss-completed-verification-flow__arrow" aria-hidden="true">
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {passFail.failed != null && passFail.failed > 0 ? (
        <p className="ss-completed-verification-flow__rejected" data-testid="ss-verification-flow-rejected">
          {formatCount(passFail.failed)} 탈락
        </p>
      ) : null}
      {passFail.passed != null &&
      funnel.evaluated != null &&
      passRatePct != null ? (
        <p className="ss-completed-verification-flow__secondary">
          {formatCount(passFail.passed)} / {formatCount(funnel.evaluated)} 후보
          통과 · 통과율 {passRatePct.toFixed(2)}%
        </p>
      ) : null}
      <details className="ss-completed-verification-flow__help">
        <summary>통과율이란?</summary>
        <p>
          평가를 완료한 후보 가운데 설정한 검증 기준을 충족한 후보의
          비율입니다. 통과율 자체가 전략의 품질을 의미하지는 않습니다.
        </p>
      </details>
    </section>
  );
}
