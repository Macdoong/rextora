import type { PatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import type { StrategySearchOperatorFormState } from "../formDefaults";

/** Pattern detail disclosure for all guided config levels (automatic is read-only inside). */
export function showGuidedPatternDetailDisclosure(input: {
  selectionMode: PatternSelectionMode;
  patternConfigLevel: StrategySearchOperatorFormState["patternConfigLevel"];
}): boolean {
  return (
    input.patternConfigLevel === "automatic" ||
    input.patternConfigLevel === "basic" ||
    input.patternConfigLevel === "expert"
  );
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
