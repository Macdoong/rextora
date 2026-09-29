import type { DurationPresetId } from "../formDefaults";
import {
  SEARCHABLE_SPACE_OPTIONS,
  type StrategySearchOperatorFormState,
} from "../formDefaults";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import { DURATION_PRESET_MINUTES } from "./GuidedApproachEssentials";

export const STEP5_DURATION_PRESET_RAIL: Array<{
  id: Exclude<DurationPresetId, "custom">;
  shortKo: string;
}> = [
  { id: "60", shortKo: "1h" },
  { id: "180", shortKo: "3h" },
  { id: "360", shortKo: "6h" },
  { id: "720", shortKo: "12h" },
  { id: "1440", shortKo: "24h" },
];

export function step5StrategyFamilyNodeCount(
  form: StrategySearchOperatorFormState,
): number {
  const mode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });
  if (mode === "automatic") {
    return SEARCHABLE_SPACE_OPTIONS.length;
  }
  return Math.max(0, form.selectedSpaceIds.length);
}

export function step5ObjectiveModePillKo(
  form: StrategySearchOperatorFormState,
): "목표 기준" | "시간 기준" | "직접 선택" {
  const mode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });
  if (mode !== "automatic") return "직접 선택";
  return form.autoSearchObjective === "qualified_target" ? "목표 기준" : "시간 기준";
}

export function parseBoundedPercent0To100(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export function formatCustomDurationKo(
  maxRuntimeMinutesOverride: string,
): string {
  const trimmed = maxRuntimeMinutesOverride.trim();
  if (!trimmed) return "사용자 설정";
  const n = Number(trimmed);
  if (Number.isFinite(n) && n >= 60 && n % 60 === 0) {
    return `사용자 설정 · ${n / 60}시간`;
  }
  return `사용자 설정 · ${trimmed}분`;
}

export function durationPresetMinutesLabel(preset: DurationPresetId): string {
  if (preset === "custom") return "custom";
  return DURATION_PRESET_MINUTES[preset] ?? preset;
}

export type Step5DirectionKind = "long" | "short" | "both";

export function step5PatternDirectionKind(
  form: Pick<StrategySearchOperatorFormState, "patternDirection">,
): Step5DirectionKind {
  const d = form.patternDirection;
  if (d === "long" || d === "short" || d === "both") return d;
  return "both";
}
