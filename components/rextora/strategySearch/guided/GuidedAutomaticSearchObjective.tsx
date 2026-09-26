"use client";

import type { AutoSearchObjective } from "../formDefaults";

export function GuidedAutomaticSearchObjective(props: {
  value: AutoSearchObjective;
  disabled?: boolean;
  onChange: (next: AutoSearchObjective) => void;
}) {
  const time = props.value !== "qualified_target";
  return (
    <section
      className="ss-auto-objective"
      data-testid="ss-auto-objective"
      aria-label="탐색 목표"
    >
      <h3 className="ss-auto-objective__title">탐색 목표</h3>
      <div className="ss-auto-objective__grid">
        <button
          type="button"
          className={
            "ss-auto-objective__card ss-selection-card" +
            (time ? " ss-auto-objective__card--active" : "")
          }
          data-testid="ss-auto-objective-time"
          aria-pressed={time}
          disabled={props.disabled}
          onClick={() => props.onChange("time_budget")}
        >
          <strong>시간 기준</strong>
          {time ? null : (
            <span>정해진 시간 동안 가장 좋은 후보를 탐색합니다.</span>
          )}
        </button>
        <button
          type="button"
          className={
            "ss-auto-objective__card ss-selection-card" +
            (!time ? " ss-auto-objective__card--active" : "")
          }
          data-testid="ss-auto-objective-target"
          aria-pressed={!time}
          disabled={props.disabled}
          onClick={() => props.onChange("qualified_target")}
        >
          <strong>목표 기준</strong>
          {time ? (
            <span>설정한 검증 조건을 만족하는 후보를 찾으면 탐색을 종료합니다.</span>
          ) : null}
        </button>
      </div>
    </section>
  );
}
