"use client";

import type { StrategySearchOperatorFormState } from "../formDefaults";
import { Step5LaunchPipelineVisual } from "./Step5LaunchPipelineVisual";

/** Step 5 launch configuration pipeline (truthful visuals). */
export function Step5LaunchFlowMap(props: {
  form: StrategySearchOperatorFormState;
  combinationSentence: string;
}) {
  return <Step5LaunchPipelineVisual {...props} />;
}
