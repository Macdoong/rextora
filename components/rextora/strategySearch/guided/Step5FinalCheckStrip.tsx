"use client";

import { Check, Sparkles } from "lucide-react";
import { GUIDE_COPY } from "./strategySearchStepModel";

const REVIEW_AREA_SHORT_KO = [
  "분석·탐색",
  "전략·범위",
  "검증·비용",
] as const;

export function Step5FinalCheckStrip(props: { warningKo?: string }) {
  const copy = GUIDE_COPY.review;
  const total = REVIEW_AREA_SHORT_KO.length;

  return (
    <aside
      className="ss-step5-final-check ss-step5-final-check--progress-rail"
      data-testid="ss-step5-final-check-strip"
      aria-label="AI 연구원 안내"
    >
      <header className="ss-step5-final-check__head">
        <Sparkles
          className="ss-step5-final-check__icon"
          aria-hidden="true"
          strokeWidth={2}
        />
        <div className="ss-step5-final-check__head-text">
          <p className="ss-step5-final-check__title">AI 최종 점검</p>
          <p
            className="ss-step5-final-check__progress"
            data-testid="ss-step5-final-check-progress"
          >
            {total}/{total} 확인
          </p>
        </div>
        <p className="ss-step5-final-check__status" data-testid="ss-guided-guide-status">
          {copy.statusKo}
        </p>
      </header>
      <div
        className="ss-step5-final-check__progress-rail ss-step5-final-check__progress-rail--enter"
        role="list"
        aria-label="확인 항목"
        data-testid="ss-step5-final-check-progress-rail"
      >
        {REVIEW_AREA_SHORT_KO.map((label, index) => (
          <div
            key={label}
            className="ss-step5-final-check__rail-segment"
            role="listitem"
            style={{ ["--rail-i" as string]: index }}
          >
            {index > 0 ? (
              <span
                className="ss-step5-final-check__rail-connector"
                aria-hidden="true"
              />
            ) : null}
            <span
              className="ss-step5-final-check__rail-node ss-step5-final-check__rail-node--complete"
              data-testid="ss-step5-final-check-item"
            >
              <span className="ss-step5-final-check__rail-dot-wrap" aria-hidden="true">
                <span className="ss-step5-final-check__rail-dot" />
                <Check className="ss-step5-final-check__rail-check" />
              </span>
              <span className="ss-step5-final-check__rail-label">{label}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="ss-step5-final-check__task">{copy.taskKo}</p>
      {props.warningKo ? (
        <p className="ss-step5-final-check__warn" role="alert">
          {props.warningKo}
        </p>
      ) : null}
    </aside>
  );
}
