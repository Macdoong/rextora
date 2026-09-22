"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StrategySearchOperatorFormState } from "../formDefaults";
import type { FormFieldError } from "../formValidation";
import {
  STRATEGY_SEARCH_SETUP_STEPS,
  type StrategySearchSetupStepId,
  type StrategySearchStepUiState,
  buildStepCompactSummaries,
  detectDependencyInvalidatedSteps,
  filterInvalidatedForNeedsReview,
  isSetupStepValid,
  isStepEnterable,
  recalculateStepCompletionFromForm,
  resolveStepUiState,
  stepIndex,
  validateSetupStep,
} from "./strategySearchStepModel";

export function useStrategySearchGuidedSetup(
  form: StrategySearchOperatorFormState,
) {
  const [currentStepId, setCurrentStepId] =
    useState<StrategySearchSetupStepId>("market");
  const [visited, setVisited] = useState<Set<StrategySearchSetupStepId>>(
    () => new Set(["market"]),
  );
  const [completed, setCompleted] = useState<Set<StrategySearchSetupStepId>>(
    () => new Set(),
  );
  const [needsReview, setNeedsReview] = useState<
    Set<StrategySearchSetupStepId>
  >(() => new Set());
  const [stepErrors, setStepErrors] = useState<FormFieldError[]>([]);
  const prevFormRef = useRef(form);
  const visitedRef = useRef(visited);
  const completedRef = useRef(completed);
  visitedRef.current = visited;
  completedRef.current = completed;
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const prev = prevFormRef.current;
    if (prev === form) return;
    const invalidated = detectDependencyInvalidatedSteps(prev, form);
    if (invalidated.length > 0) {
      const forReview = filterInvalidatedForNeedsReview(invalidated, {
        visited: visitedRef.current,
        completed: completedRef.current,
      });
      if (forReview.length > 0) {
        setNeedsReview((nr) => {
          const next = new Set(nr);
          for (const id of forReview) next.add(id);
          return next;
        });
      }
      setCompleted((c) => {
        const next = new Set(c);
        for (const id of invalidated) {
          if (c.has(id)) next.delete(id);
        }
        return next;
      });
    }
    prevFormRef.current = form;
  }, [form]);

  const uiOpts = {
    currentStepId,
    visited,
    completed,
    needsReview,
  };

  const stepStates: Record<StrategySearchSetupStepId, StrategySearchStepUiState> =
    {} as Record<StrategySearchSetupStepId, StrategySearchStepUiState>;
  for (const { id } of STRATEGY_SEARCH_SETUP_STEPS) {
    stepStates[id] = resolveStepUiState(id, uiOpts);
  }

  const summaries = buildStepCompactSummaries(form);

  const focusHeading = useCallback(() => {
    window.requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
  }, []);

  const goToStep = useCallback(
    (stepId: StrategySearchSetupStepId) => {
      if (!isStepEnterable(stepId, uiOpts)) return false;
      setCurrentStepId(stepId);
      setVisited((v) => new Set(v).add(stepId));
      setStepErrors([]);
      focusHeading();
      return true;
    },
    [uiOpts, focusHeading],
  );

  const validateCurrentStep = useCallback(() => {
    const errors = validateSetupStep(form, currentStepId);
    setStepErrors(errors);
    return errors;
  }, [form, currentStepId]);

  const goNext = useCallback(() => {
    if (currentStepId === "review") return false;
    const errors = validateSetupStep(form, currentStepId);
    setStepErrors(errors);
    if (errors.length > 0) return false;

    setCompleted((c) => {
      const next = new Set(c);
      next.add(currentStepId);
      return next;
    });
    setNeedsReview((nr) => {
      const next = new Set(nr);
      next.delete(currentStepId);
      return next;
    });

    const nextIndex = stepIndex(currentStepId) + 1;
    const nextStep = STRATEGY_SEARCH_SETUP_STEPS[nextIndex]?.id;
    if (!nextStep) return false;
    setCurrentStepId(nextStep);
    setVisited((v) => new Set(v).add(nextStep));
    setStepErrors([]);
    focusHeading();
    return true;
  }, [currentStepId, form, focusHeading]);

  const goPrevious = useCallback(() => {
    const idx = stepIndex(currentStepId);
    if (idx <= 0) return false;
    const prevStep = STRATEGY_SEARCH_SETUP_STEPS[idx - 1]!.id;
    setCurrentStepId(prevStep);
    setVisited((v) => new Set(v).add(prevStep));
    setStepErrors([]);
    focusHeading();
    return true;
  }, [currentStepId, focusHeading]);

  const recalculateFromLoadedForm = useCallback(
    (loaded: StrategySearchOperatorFormState) => {
      const nextCompleted = recalculateStepCompletionFromForm(loaded);
      setCompleted(nextCompleted);
      setNeedsReview(new Set());
      setVisited(new Set(STRATEGY_SEARCH_SETUP_STEPS.map((s) => s.id)));
      const firstIncomplete = STRATEGY_SEARCH_SETUP_STEPS.find(
        (s) => s.id !== "review" && !nextCompleted.has(s.id),
      );
      setCurrentStepId(firstIncomplete?.id ?? "review");
      setStepErrors([]);
    },
    [],
  );

  const isStepActive = useCallback(
    (stepId: StrategySearchSetupStepId) => currentStepId === stepId,
    [currentStepId],
  );

  return {
    currentStepId,
    stepStates,
    stepErrors,
    summaries,
    headingRef,
    goToStep,
    goNext,
    goPrevious,
    validateCurrentStep,
    recalculateFromLoadedForm,
    isStepActive,
    canGoPrevious: stepIndex(currentStepId) > 0,
    isReviewStep: currentStepId === "review",
    isCurrentStepValid: isSetupStepValid(form, currentStepId),
  };
}

export type StrategySearchGuidedSetupController = ReturnType<
  typeof useStrategySearchGuidedSetup
>;
