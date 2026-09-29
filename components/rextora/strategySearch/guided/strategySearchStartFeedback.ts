import { isAutomaticQualifiedTargetMode } from "../formDefaults";
import type { StrategySearchOperatorFormState } from "../formDefaults";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";

/**
 * Customer success detail after create+start.
 * Qualified-target stops when a candidate meets Step 2 conditions
 * (stopWhenQualifiedTarget), otherwise at max runtime or safety limits.
 * Time-budget and direct runs do not stop on a qualified-target count.
 */
export function strategySearchStartedDetail(
  form: StrategySearchOperatorFormState,
  searchName: string,
): string {
  const name = searchName.trim() || "탐색";
  if (isAutomaticQualifiedTargetMode(form)) {
    return `${name} · 목표 조건을 만족하는 후보를 찾으면 종료하고, 못 찾으면 최대 탐색 시간 또는 안전 한도에서 종료합니다.`;
  }
  const mode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });
  if (mode === "automatic") {
    return `${name} · 설정한 탐색 시간 또는 안전 한도까지 연구를 진행합니다.`;
  }
  return `${name} · 확인한 설정으로 연구를 진행합니다. 설정한 탐색 시간 또는 안전 한도에서 종료합니다.`;
}

export function tryAcquireSubmitLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseSubmitLock(lock: { current: boolean }): void {
  lock.current = false;
}
