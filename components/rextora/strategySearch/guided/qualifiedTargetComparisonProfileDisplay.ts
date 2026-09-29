import {
  QUALIFICATION_PROFILES,
  type QualificationProfileId,
} from "@/components/rextora/strategySearch/formDefaults";

/** Qualified-target Step 4/5 후보 비교 기준 only — value stays `custom`. */
export const QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO =
  "직접 설정 (균형형 점수 기준)" as const;

export function qualifiedTargetComparisonProfileLabel(
  id: QualificationProfileId,
): string {
  if (id === "custom") return QUALIFIED_TARGET_CUSTOM_COMPARISON_LABEL_KO;
  if (id === "conservative" || id === "balanced" || id === "aggressive") {
    return QUALIFICATION_PROFILES[id].labelKo;
  }
  return id;
}
