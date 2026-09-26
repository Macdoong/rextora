"use client";

export function GuidedSectionCoach(props: {
  taskKo: string;
  recommendKo: string;
  defaultOkKo?: string;
  testId?: string;
}) {
  return (
    <aside
      className="ss-guided-section-coach ss-guided-section-coach--compact"
      data-testid={props.testId ?? "ss-guided-section-coach"}
      aria-label="AI 연구원 안내"
    >
      <p className="ss-guided-section-coach__line">
        <span className="ss-guided-section-coach__label">AI 연구원 추천</span>
        {props.recommendKo}
      </p>
      <p className="ss-guided-section-coach__line">
        <span className="ss-guided-section-coach__label">영향</span>
        {props.taskKo}
      </p>
      {props.defaultOkKo ? (
        <p className="ss-guided-section-coach__line ss-guided-section-coach__line--muted">
          {props.defaultOkKo}
        </p>
      ) : null}
    </aside>
  );
}
