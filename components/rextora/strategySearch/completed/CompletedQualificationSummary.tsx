"use client";

import { formatCount } from "../formatters";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import { useCountUpDisplay } from "./useCountUpDisplay";
import { useCompletedMotion } from "./useCompletedMotion";

function FlowStep(props: {
  label: string;
  value: number | null;
  testId: string;
  animate: boolean;
  delayMs: number;
}) {
  const display = useCountUpDisplay(props.value, {
    enabled: props.animate,
    durationMs: 580,
  });
  return (
    <li
      className="ss-completed-qual-flow__step"
      data-testid={props.testId}
      style={{ animationDelay: `${props.delayMs}ms` }}
    >
      <span className="ss-completed-qual-flow__value">
        {props.value == null ? "—" : formatCount(Number(display))}
      </span>
      <span className="ss-completed-qual-flow__label">{props.label}</span>
    </li>
  );
}

export function CompletedQualificationSummary(props: {
  model: CompletedDashboardViewModel;
}) {
  const animate = useCompletedMotion() && props.model.dataStable;
  const evaluated = props.model.funnel.evaluated;
  const passed = props.model.passFail.passed;
  const qualified = props.model.funnel.qualified;
  const passRate = props.model.passRatePct;

  return (
    <section
      className="ss-completed-qual-summary ss-completed-qual-summary--enter"
      data-testid="ss-completed-qual-summary"
      aria-label="검증 결과 요약"
    >
      <h3 className="ss-completed-qual-summary__title">검증 결과</h3>
      <ol className="ss-completed-qual-flow">
        <FlowStep
          label="개 평가"
          value={evaluated}
          testId="ss-qual-flow-evaluated"
          animate={animate}
          delayMs={0}
        />
        <li className="ss-completed-qual-flow__arrow" aria-hidden="true">
          →
        </li>
        <FlowStep
          label="개 검증 통과"
          value={passed}
          testId="ss-qual-flow-passed"
          animate={animate}
          delayMs={80}
        />
        <li className="ss-completed-qual-flow__arrow" aria-hidden="true">
          →
        </li>
        <FlowStep
          label="개 최종 적격"
          value={qualified}
          testId="ss-qual-flow-qualified"
          animate={animate}
          delayMs={160}
        />
      </ol>
      {passed != null && evaluated != null && passRate != null ? (
        <p className="ss-completed-qual-summary__secondary">
          {formatCount(passed)} / {formatCount(evaluated)} 후보 통과 · 통과율{" "}
          {passRate.toFixed(2)}%
        </p>
      ) : null}
      <details className="ss-completed-qual-summary__help">
        <summary>통과율이란?</summary>
        <p>
          평가를 완료한 후보 가운데 설정한 검증 기준을 충족한 후보의
          비율입니다. 통과율 자체가 전략의 품질을 의미하지는 않습니다.
        </p>
      </details>
      {passRate != null && evaluated != null && passed != null ? (
        <div
          className="ss-completed-qual-summary__ring"
          aria-hidden="true"
          data-testid="ss-completed-passfail-ring-pass"
          data-passed={passed}
          data-failed={props.model.passFail.failed ?? undefined}
          data-pass-rate={passRate.toFixed(4)}
        >
          <svg viewBox="0 0 100 100">
            <circle className="ss-completed-qual-summary__track" cx="50" cy="50" r="42" />
            <circle
              className="ss-completed-qual-summary__arc"
              cx="50"
              cy="50"
              r="42"
              strokeDasharray={`${(passRate / 100) * (2 * Math.PI * 42)} ${2 * Math.PI * 42}`}
              transform="rotate(-90 50 50)"
            />
          </svg>
        </div>
      ) : null}
    </section>
  );
}
