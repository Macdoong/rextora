import type { StrategySearchSetupStepId } from "./strategySearchStepModel";

const STEP_NUMBER: Record<StrategySearchSetupStepId, number> = {
  market: 1,
  approach: 2,
  strategy: 3,
  validation: 4,
  review: 5,
};

export function guidedStepBadgeKo(stepId: StrategySearchSetupStepId): string {
  return `${STEP_NUMBER[stepId]}단계`;
}
