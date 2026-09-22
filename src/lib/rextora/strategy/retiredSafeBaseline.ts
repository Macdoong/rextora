/**
 * Retired SAFE_v44_i4060 identity.
 * Used only to detect and neutralize stale persisted references.
 * Never inject, select, approve, or execute this identity.
 */

export const RETIRED_SAFE_STRATEGY_ID = "SAFE_v44_i4060";
export const RETIRED_SAFE_PARAMS_HASH = "7893ca3f0e30";
export const RETIRED_SAFE_FILE_NAME = "SAFE_v44_i4060.json";

export const NO_SELECTED_STRATEGY = "선택된 전략이 없습니다";
export const NO_PAPER_STRATEGY = "모의매매에 적용된 전략이 없습니다";
export const NO_LIVE_APPROVED_STRATEGY = "실전 승인된 전략이 없습니다";

export function isRetiredSafeId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.trim() === RETIRED_SAFE_STRATEGY_ID;
}

export function isRetiredSafeHash(hash: string | null | undefined): boolean {
  return typeof hash === "string" && hash.trim() === RETIRED_SAFE_PARAMS_HASH;
}

export function isRetiredSafeFileName(name: string | null | undefined): boolean {
  return typeof name === "string" && name.trim() === RETIRED_SAFE_FILE_NAME;
}

/** True only for stale historical SAFE identity. Never a product privilege. */
export function isRetiredSafeIdentity(value: string | null | undefined): boolean {
  return isRetiredSafeId(value) || isRetiredSafeHash(value) || isRetiredSafeFileName(value);
}

export function neutralizeRetiredStrategyId(
  id: string | null | undefined,
): string | null {
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed || isRetiredSafeId(trimmed)) return null;
  return trimmed;
}
