import type { PatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";

export function guidedModeSelectionSummary(mode: PatternSelectionMode): {
  currentLabel: string;
  nextStepHint: string;
} {
  if (mode === "automatic") {
    return {
      currentLabel: "자동 탐색",
      nextStepHint: "다음 단계에서 자동 구성된 전략 범위를 확인합니다.",
    };
  }
  return {
    currentLabel: "직접 선택",
    nextStepHint: "다음 단계에서 전략군과 방향을 직접 설정합니다.",
  };
}
