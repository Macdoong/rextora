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
