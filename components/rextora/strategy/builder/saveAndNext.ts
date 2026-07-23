/**
 * Explicit save-and-advance sequence for Strategy Builder.
 * Kept separate so behavior can be unit-tested without a React render harness.
 */

export type SaveAndNextResult =
  | "locked"
  | "busy"
  | "validation"
  | "persist_failed"
  | "advanced";

/** Editable wizard steps that persist via save (전략 선택 … 설정 확인). */
export const SAVEABLE_STEP_MAX = 5;

export const SKIP_SAVE_CONFIRM_MESSAGE =
  "현재 단계의 변경사항은 저장되지 않습니다.\n다음 단계로 이동하시겠습니까?";

export function canShowSaveActions(
  step: number,
  isLocked: boolean,
): boolean {
  return !isLocked && step >= 0 && step <= SAVEABLE_STEP_MAX;
}

/** dirty → both save-and-next + skip; clean → plain next */
export function getNavButtonMode(
  dirty: boolean,
): "dirty" | "clean" {
  return dirty ? "dirty" : "clean";
}

export async function runSaveAndNext(input: {
  isLocked: boolean;
  saving: boolean;
  validate: () => string | null;
  persist: () => Promise<boolean>;
  advance: () => void;
}): Promise<{ result: SaveAndNextResult; validationMessage?: string }> {
  if (input.isLocked) return { result: "locked" };
  if (input.saving) return { result: "busy" };
  const validationMessage = input.validate();
  if (validationMessage) {
    return { result: "validation", validationMessage };
  }
  const ok = await input.persist();
  if (!ok) return { result: "persist_failed" };
  input.advance();
  return { result: "advanced" };
}

export function shouldConfirmUnsavedNext(dirty: boolean): boolean {
  return dirty;
}

export type StepChipState = "completed" | "current" | "unsaved" | "upcoming";

export function getStepChipState(input: {
  index: number;
  currentStep: number;
  dirty: boolean;
  completedSteps: ReadonlySet<number>;
}): StepChipState {
  const { index, currentStep, dirty, completedSteps } = input;
  if (index === currentStep) {
    return dirty ? "unsaved" : "current";
  }
  if (completedSteps.has(index) || index < currentStep) {
    return "completed";
  }
  return "upcoming";
}
