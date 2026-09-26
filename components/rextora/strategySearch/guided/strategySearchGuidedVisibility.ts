import type { PatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import type { StrategySearchOperatorFormState } from "../formDefaults";

/** Pattern detail disclosure only when customer can change pattern parameters. */
export function showGuidedPatternDetailDisclosure(input: {
  selectionMode: PatternSelectionMode;
  patternConfigLevel: StrategySearchOperatorFormState["patternConfigLevel"];
}): boolean {
  if (input.selectionMode === "automatic" && input.patternConfigLevel === "automatic") {
    return false;
  }
  return input.patternConfigLevel === "basic" || input.patternConfigLevel === "expert";
}

/** Step 4 D-band only when advanced validation controls are meaningful in guided flow. */
export function showGuidedValidationAdvancedBand(input: {
  selectionMode: PatternSelectionMode;
  patternConfigLevel: StrategySearchOperatorFormState["patternConfigLevel"];
}): boolean {
  if (input.selectionMode === "automatic" && input.patternConfigLevel === "automatic") {
    return false;
  }
  return true;
}
