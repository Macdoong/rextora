"use client";

export function GuidedSectionCoach(props: {
  taskKo: string;
  recommendKo: string;
  defaultOkKo?: string;
  testId?: string;
}) {
  return (
    <aside
      className="ss-guided-section-coach"
      data-testid={props.testId ?? "ss-guided-section-coach"}
      aria-label="AI 연구원 안내"
    >
      <p className="ss-guided-section-coach__role">AI 연구원 · 세부 조정</p>
      <p className="ss-guided-section-coach__task">
        <span className="ss-guided-section-coach__label">지금 할 일</span>
        {props.taskKo}
      </p>
      <p className="ss-guided-section-coach__rec">
        <span className="ss-guided-section-coach__label">추천</span>
        {props.recommendKo}
      </p>
      {props.defaultOkKo ? (
        <p className="ss-guided-section-coach__default">
          <span className="ss-guided-section-coach__label">기본값</span>
          {props.defaultOkKo}
        </p>
      ) : null}
    </aside>
  );
}
