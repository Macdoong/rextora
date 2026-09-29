/**
 * Single source for Strategy Search page presentation mode (UI only).
 */

export type StrategySearchPresentationMode =
  | "guided_setup"
  | "running"
  | "outcome_primary";

export function resolveStrategySearchPresentationMode(input: {
  clientReady: boolean;
  showRunningVisual: boolean;
  outcomeViewPrimary: boolean;
}): StrategySearchPresentationMode {
  if (!input.clientReady) return "guided_setup";
  if (input.showRunningVisual) return "running";
  if (input.outcomeViewPrimary) return "outcome_primary";
  return "guided_setup";
}

export function isGuidedSetupActive(
  mode: StrategySearchPresentationMode,
): boolean {
  return mode === "guided_setup";
}

/** Compact “최근 작업” strip under Step 1 — not when a non-completed job is in context. */
export function shouldShowGuidedCompactSecondary(input: {
  guidedSetupActive: boolean;
  guidedOperationalExpanded: boolean;
  selectedJobStatus?: string | null;
  jobMissing?: boolean;
  hasSelectedJob: boolean;
}): boolean {
  if (!input.guidedSetupActive || input.guidedOperationalExpanded) {
    return false;
  }
  if (input.jobMissing) {
    return false;
  }
  if (!input.hasSelectedJob) {
    return true;
  }
  const status = input.selectedJobStatus ?? "";
  if (!status) {
    return false;
  }
  return status === "completed";
}
