/**
 * Pure risk presentation formulas — no store imports (avoids cycles).
 */

/** Loss-only daily % (profits → 0). Convention: negative = loss. */
export function normalizeDailyLossPct(dailyLossPct: number): number {
  if (!Number.isFinite(dailyLossPct)) return 0;
  return Number(Math.min(0, dailyLossPct).toFixed(4));
}

/**
 * usage = abs(min(0, dailyLossPct) / limit) * 100.
 * Profit never inflates usage. Result ≥ 0.
 */
export function computeRiskUsagePct(dailyLossPct: number, dailyLossLimitPct: number): number {
  if (dailyLossLimitPct === 0 || !Number.isFinite(dailyLossPct) || !Number.isFinite(dailyLossLimitPct)) return 0;
  const lossMagnitude = Math.abs(Math.min(0, dailyLossPct));
  const limitMagnitude = Math.abs(dailyLossLimitPct);
  if (limitMagnitude === 0) return 0;
  return Number(((lossMagnitude / limitMagnitude) * 100).toFixed(2));
}

/** Non-negative remaining loss room (e.g. 5 when unused against −5% limit). */
export function computeRemainingLossAllowancePct(dailyLossPct: number, dailyLossLimitPct: number): number {
  const limitMagnitude = Math.abs(dailyLossLimitPct);
  const lossMagnitude = Math.abs(Math.min(0, dailyLossPct));
  return Number(Math.max(0, limitMagnitude - lossMagnitude).toFixed(4));
}
