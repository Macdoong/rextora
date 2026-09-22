"use client";

import { Sparkles } from "lucide-react";
import {
  GUIDE_COPY,
  type StrategySearchSetupStepId,
} from "./strategySearchStepModel";

export function StrategySearchStepGuide(props: {
  stepId: StrategySearchSetupStepId;
  warningKo?: string;
}) {
  const copy = GUIDE_COPY[props.stepId];
  return (
    <aside
      key={props.stepId}
      className="ss-guided-guide ss-guided-guide--enter"
      data-testid={`ss-guided-guide-${props.stepId}`}
      aria-label="AI 연구원 안내"
    >
      <header className="ss-guided-guide__head">
        <span className="ss-guided-guide__avatar" aria-hidden="true">
          <Sparkles className="ss-guided-guide__avatar-icon" strokeWidth={2} />
          <span className="ss-guided-guide__avatar-pulse" aria-hidden="true" />
        </span>
        <div className="ss-guided-guide__identity">
          <p className="ss-guided-guide__role" data-testid="ss-guided-guide-role">
            AI 연구원
          </p>
          <p
            className="ss-guided-guide__status"
            data-testid="ss-guided-guide-status"
          >
            <span className="ss-guided-guide__status-dot" aria-hidden="true" />
            {copy.statusKo}
          </p>
        </div>
      </header>
      <p className="ss-guided-guide__task">{copy.taskKo}</p>
      <div className="ss-guided-guide__block ss-guided-guide__rec">
        <span className="ss-guided-guide__block-label">추천</span>
        <p className="ss-guided-guide__block-body">{copy.recommendationKo}</p>
      </div>
      <div className="ss-guided-guide__block ss-guided-guide__impact">
        <span className="ss-guided-guide__block-label">영향</span>
        <p className="ss-guided-guide__block-body">{copy.impactKo}</p>
      </div>
      {props.warningKo ? (
        <p className="ss-guided-guide__warn" role="alert">
          {props.warningKo}
        </p>
      ) : null}
    </aside>
  );
}
