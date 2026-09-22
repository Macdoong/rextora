"use client";

import type { PatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import { guidedModeSelectionSummary } from "./guidedModeCopy";

export function GuidedModeOutcomePanel(props: { mode: PatternSelectionMode }) {
  const summary = guidedModeSelectionSummary(props.mode);
  return (
    <div
      className="ss-guided-mode-outcome"
      data-testid="ss-guided-mode-outcome"
      data-selection-mode={props.mode}
    >
      <p className="ss-guided-mode-outcome__label">선택 결과</p>
      <dl className="ss-guided-mode-outcome__rows">
        <div>
          <dt>현재 방식</dt>
          <dd data-testid="ss-guided-mode-outcome-current">{summary.currentLabel}</dd>
        </div>
        <div>
          <dt>다음 단계에서</dt>
          <dd data-testid="ss-guided-mode-outcome-next">{summary.nextStepHint}</dd>
        </div>
      </dl>
    </div>
  );
}
