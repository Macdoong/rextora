/**
 * Canonical pattern-family selection mode for Strategy Search.
 * Client-safe (no Node FS). Mirrored into strategySearch for server imports.
 *
 * AUTOMATIC — system chooses spaces (depth profile / combination templates).
 *             Manual selectedSpaceIds are not applied.
 * MANUAL — user-selected selectedSpaceIds are persisted and drive the plan.
 */

export type PatternSelectionMode = "automatic" | "manual";

export type PatternSelectionModeInput = {
  patternConfigLevel?: "automatic" | "basic" | "expert" | string | null;
  autoStrategyCombo?: boolean | null;
  patternSelectionMode?: PatternSelectionMode | string | null;
};

/**
 * Resolve the effective selection mode from form / operator-plan fields.
 * Explicit `patternSelectionMode` wins when valid; otherwise derive from
 * config level and autoStrategyCombo.
 */
export function resolvePatternSelectionMode(
  input: PatternSelectionModeInput,
): PatternSelectionMode {
  if (
    input.patternSelectionMode === "automatic" ||
    input.patternSelectionMode === "manual"
  ) {
    return input.patternSelectionMode;
  }
  if (input.patternConfigLevel === "automatic") return "automatic";
  if (input.autoStrategyCombo === true) return "automatic";
  return "manual";
}

export function patternSelectionModeLabelKo(
  mode: PatternSelectionMode,
): string {
  return mode === "automatic" ? "자동 (시스템 관리)" : "수동 선택";
}

/**
 * When automatic, selectedSpaceIds must be null so the server uses depth /
 * combination defaults. When manual, pass the user selection (or null if empty
 * — validation should reject empty manual selections before create).
 */
export function selectedSpaceIdsForSelectionMode(
  mode: PatternSelectionMode,
  selectedSpaceIds: readonly string[] | null | undefined,
): string[] | null {
  if (mode === "automatic") return null;
  if (!selectedSpaceIds || selectedSpaceIds.length === 0) return null;
  return [...selectedSpaceIds];
}
