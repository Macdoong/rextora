"use client";

import { Target } from "lucide-react";
import type { ReactNode } from "react";
import { StrategySearchStepGuide } from "./StrategySearchStepGuide";
import { StrategySearchStepNavigation } from "./StrategySearchStepNavigation";
import {
  GUIDE_COPY,
  STRATEGY_SEARCH_SETUP_STEPS,
  guideWarningForStep,
  type StrategySearchSetupStepId,
} from "./strategySearchStepModel";
import type { StrategySearchGuidedSetupController } from "./useStrategySearchGuidedSetup";
import type { FormFieldError } from "../formValidation";

const STEP_SURFACE_ICONS: Partial<
  Record<StrategySearchSetupStepId, typeof Target>
> = {
  market: Target,
};

export function StrategySearchGuidedSetup(props: {
  guided: StrategySearchGuidedSetupController;
  allErrors: FormFieldError[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { guided, allErrors, children, footer } = props;
  const stepIndex = STRATEGY_SEARCH_SETUP_STEPS.findIndex(
    (s) => s.id === guided.currentStepId,
  );
  const stepMeta = STRATEGY_SEARCH_SETUP_STEPS.find(
    (s) => s.id === guided.currentStepId,
  );
  const StepIcon = stepMeta ? STEP_SURFACE_ICONS[stepMeta.id] : undefined;
  const warning =
    guided.stepErrors[0]?.message ??
    guideWarningForStep(guided.currentStepId, allErrors);

  return (
    <div className="ss-guided-setup-root" data-testid="ss-guided-setup">
      <StrategySearchStepNavigation
        currentStepId={guided.currentStepId}
        stepStates={guided.stepStates}
        onGoToStep={guided.goToStep}
      />
      <div className="ss-guided-setup__body">
        <StrategySearchStepGuide
          stepId={guided.currentStepId}
          warningKo={
            guided.stepErrors.length > 0 ? warning : undefined
          }
        />
        <div className="ss-guided-setup__content">
          <div
            key={guided.currentStepId}
            className="ss-guided-step-surface ss-guided-step-surface--enter"
            data-testid="ss-guided-step-surface"
            data-guided-step-id={guided.currentStepId}
          >
            <p
              className="ss-guided-step-surface__context"
              data-testid="ss-guided-step-context"
            >
              {stepIndex + 1} / {STRATEGY_SEARCH_SETUP_STEPS.length} ·{" "}
              {stepMeta?.navLabelKo}
            </p>
            <header className="ss-guided-step-surface__header">
              {StepIcon ? (
                <span className="ss-guided-step-surface__icon" aria-hidden="true">
                  <StepIcon strokeWidth={2} />
                </span>
              ) : null}
              <h2
                ref={guided.headingRef}
                tabIndex={-1}
                className="ss-guided-setup__heading"
                id={`ss-guided-heading-${guided.currentStepId}`}
                data-testid="ss-guided-step-heading"
              >
                {stepMeta?.headingKo}
              </h2>
            </header>
            {stepMeta?.surfaceIntroKo ? (
              <p
                className="ss-guided-step-surface__intro"
                data-testid="ss-guided-step-intro"
              >
                {stepMeta.surfaceIntroKo}
              </p>
            ) : null}
            <div className="ss-guided-step-surface__divider" aria-hidden="true" />
            <div className="ss-guided-step-surface__body">{children}</div>
            {footer ? (
              <div
                className="ss-guided-step-surface__footer"
                data-testid="ss-guided-footer"
              >
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export { GUIDE_COPY, type StrategySearchSetupStepId };
