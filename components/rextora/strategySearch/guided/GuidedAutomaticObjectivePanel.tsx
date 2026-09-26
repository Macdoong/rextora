"use client";

import type { ReactNode } from "react";
import type { AutoSearchObjective } from "../formDefaults";

export const AUTOMATIC_OBJECTIVE_COPY: Record<
  AutoSearchObjective,
  { title: string; primary: string; compact: string }
> = {
  time_budget: {
    title: "시간 기준 자동 탐색",
    primary: "정해진 시간 동안 여러 후보를 탐색하고 비교합니다.",
    compact:
      "목표 조건을 충족한 후보가 생겨도 설정한 탐색 시간까지 탐색합니다.",
  },
  qualified_target: {
    title: "목표 기준 자동 탐색",
    primary:
      "설정한 모든 필수 조건을 통과한 첫 후보를 찾으면 탐색을 종료합니다.",
    compact:
      "조건을 만족하지 못하면 최대 탐색 시간 또는 안전 한도에서 종료됩니다.",
  },
};

export function GuidedAutomaticObjectivePanel(props: {
  objective: AutoSearchObjective;
  analysisLine: ReactNode;
  children: ReactNode;
  testId: string;
  compactGuidanceTestId: string;
}) {
  const copy = AUTOMATIC_OBJECTIVE_COPY[props.objective];
  return (
    <section
      className="ss-guided-auto-objective-panel"
      data-testid={props.testId}
      aria-labelledby={`ss-auto-objective-panel-title-${props.objective}`}
    >
      <header className="ss-guided-auto-objective-panel__head">
        <h3
          id={`ss-auto-objective-panel-title-${props.objective}`}
          className="ss-guided-auto-objective-panel__title"
        >
          {copy.title}
        </h3>
        <p className="ss-guided-auto-objective-panel__primary">{copy.primary}</p>
      </header>

      {props.analysisLine}

      <div className="ss-guided-auto-objective-panel__body">{props.children}</div>

      <div
        className="ss-guided-auto-objective-panel__auto-config"
        data-testid="ss-auto-config-notice"
      >
        <p className="ss-guided-auto-objective-panel__auto-config-title">
          Rextora 자동 설정
        </p>
        <p className="ss-guided-auto-objective-panel__auto-config-copy">
          전략 조합 · 탐색 범위 · 파라미터
        </p>
      </div>

      <p
        className="ss-guided-auto-objective-panel__compact"
        data-testid={props.compactGuidanceTestId}
      >
        {copy.compact}
      </p>
    </section>
  );
}
