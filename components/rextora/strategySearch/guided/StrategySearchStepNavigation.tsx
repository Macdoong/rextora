"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";
import {
  STRATEGY_SEARCH_SETUP_STEPS,
  type StrategySearchSetupStepId,
  type StrategySearchStepUiState,
} from "./strategySearchStepModel";

function stateHint(state: StrategySearchStepUiState): string {
  switch (state) {
    case "completed":
      return "완료";
    case "current":
      return "현재";
    case "needs_review":
      return "재확인";
    case "available":
      return "";
    default:
      return "";
  }
}

function stateSymbol(state: StrategySearchStepUiState): string {
  switch (state) {
    case "completed":
      return "✓";
    case "current":
      return "●";
    case "needs_review":
      return "!";
    case "available":
      return "○";
    default:
      return "○";
  }
}

function stepButtonClass(state: StrategySearchStepUiState): string {
  const parts = ["ss-guided-nav__step"];
  if (state === "current") parts.push("is-current");
  if (state === "completed") parts.push("is-completed");
  if (state === "needs_review") parts.push("is-needs-review");
  if (state === "locked") parts.push("is-locked");
  if (state === "available") parts.push("is-available");
  return parts.join(" ");
}

export function StrategySearchStepNavigation(props: {
  currentStepId: StrategySearchSetupStepId;
  stepStates: Record<StrategySearchSetupStepId, StrategySearchStepUiState>;
  onGoToStep: (stepId: StrategySearchSetupStepId) => void;
}) {
  const { currentStepId, stepStates, onGoToStep } = props;
  const menuId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentMeta = STRATEGY_SEARCH_SETUP_STEPS.find(
    (s) => s.id === currentStepId,
  );
  const currentIndex = STRATEGY_SEARCH_SETUP_STEPS.findIndex(
    (s) => s.id === currentStepId,
  );
  const travelerStyle = {
    "--ss-guided-travel-index": currentIndex,
    "--ss-guided-travel-steps": STRATEGY_SEARCH_SETUP_STEPS.length,
  } as CSSProperties;

  function handleSelect(stepId: StrategySearchSetupStepId) {
    const state = stepStates[stepId];
    if (state === "locked") return;
    onGoToStep(stepId);
    setMobileOpen(false);
  }

  function connectorBeforeStepComplete(stepIndex: number): boolean {
    if (stepIndex <= 0) return false;
    const prev = STRATEGY_SEARCH_SETUP_STEPS[stepIndex - 1];
    if (!prev) return false;
    return stepStates[prev.id] === "completed";
  }

  return (
    <nav
      className="ss-guided-nav"
      aria-label="탐색 설정 단계"
      data-testid="ss-guided-step-nav"
    >
      <div className="ss-guided-nav__desktop" data-testid="ss-guided-nav-desktop">
        <div
          className="ss-guided-nav__rail-wrap"
          style={travelerStyle}
          data-guided-current-step={currentStepId}
        >
          <div className="ss-guided-nav__track" aria-hidden="true">
            <span className="ss-guided-nav__traveler" />
          </div>
          <ol className="ss-guided-nav__rail">
          {STRATEGY_SEARCH_SETUP_STEPS.map((step, index) => {
            const state = stepStates[step.id];
            const locked = state === "locked";
            const hint = stateHint(state);
            const connectorDone = connectorBeforeStepComplete(index);
            return (
              <li
                key={step.id}
                className="ss-guided-nav__rail-item"
                data-state={state}
                data-segment-done={connectorDone ? "true" : undefined}
              >
                <button
                  type="button"
                  className={stepButtonClass(state)}
                  data-testid={`ss-guided-nav-step-${step.id}`}
                  aria-current={state === "current" ? "step" : undefined}
                  aria-disabled={locked ? true : undefined}
                  disabled={locked}
                  onClick={() => handleSelect(step.id)}
                >
                  <span className="ss-guided-nav__marker" aria-hidden="true">
                    {state === "completed" ? (
                      <Check className="ss-guided-nav__check" strokeWidth={2.5} />
                    ) : (
                      <span className="ss-guided-nav__index">{index + 1}</span>
                    )}
                  </span>
                  <span className="ss-guided-nav__copy">
                    <span className="ss-guided-nav__label">{step.navLabelKo}</span>
                    {hint ? (
                      <span className="ss-guided-nav__hint">{hint}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
          </ol>
        </div>
      </div>

      <div className="ss-guided-nav__mobile" data-testid="ss-guided-nav-mobile">
        <div className="ss-guided-nav__mobile-head">
          <p className="ss-guided-nav__mobile-progress" aria-hidden="true">
            <span className="ss-guided-nav__mobile-progress-num">
              {currentIndex + 1}
            </span>
            <span className="ss-guided-nav__mobile-progress-sep">/</span>
            <span className="ss-guided-nav__mobile-progress-total">
              {STRATEGY_SEARCH_SETUP_STEPS.length}
            </span>
          </p>
          <p className="ss-guided-nav__mobile-title">{currentMeta?.navLabelKo}</p>
        </div>
        <button
          type="button"
          className="ss-guided-nav__mobile-trigger"
          data-testid="ss-guided-nav-mobile-menu"
          aria-expanded={mobileOpen}
          aria-controls={menuId}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <span>전체 단계</span>
          <ChevronDown
            className={
              "ss-guided-nav__mobile-chevron" +
              (mobileOpen ? " is-open" : "")
            }
            aria-hidden="true"
          />
        </button>
        <div
          id={menuId}
          className={
            "ss-guided-nav__mobile-panel" + (mobileOpen ? " is-open" : "")
          }
          hidden={!mobileOpen}
        >
          <ul className="ss-guided-nav__mobile-timeline" role="list">
            {STRATEGY_SEARCH_SETUP_STEPS.map((step, index) => {
              const state = stepStates[step.id];
              const locked = state === "locked";
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    className={
                      "ss-guided-nav__mobile-item" +
                      (state === "current" ? " is-current" : "") +
                      (state === "needs_review" ? " is-needs-review" : "") +
                      (locked ? " is-locked" : "")
                    }
                    disabled={locked}
                    aria-current={state === "current" ? "step" : undefined}
                    data-testid={`ss-guided-nav-mobile-${step.id}`}
                    onClick={() => handleSelect(step.id)}
                  >
                    <span className="ss-guided-nav__mobile-item-main">
                      <span aria-hidden="true" className="ss-guided-nav__mobile-symbol">
                        {stateSymbol(state)}
                      </span>
                      <span>
                        {index + 1}. {step.navLabelKo}
                      </span>
                    </span>
                    {state === "needs_review" ? (
                      <span className="ss-guided-nav__status">재확인 필요</span>
                    ) : state === "completed" ? (
                      <span className="ss-guided-nav__status">완료</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
