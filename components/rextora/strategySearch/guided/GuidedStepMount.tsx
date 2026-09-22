"use client";

import type { ReactNode } from "react";
import type { StrategySearchSetupStepId } from "./strategySearchStepModel";

export function GuidedStepMount(props: {
  active: boolean;
  stepId: StrategySearchSetupStepId;
  testId?: string;
  children: ReactNode;
}) {
  if (!props.active) return null;
  return (
    <div
      data-guided-step={props.stepId}
      data-testid={props.testId ?? `ss-guided-step-${props.stepId}`}
      className="ss-guided-step-mount"
    >
      {props.children}
    </div>
  );
}
