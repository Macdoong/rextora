/**
 * Single verified mapping between operator percentage inputs and backend ratios.
 * Backend passPolicy uses decimal fractions (0.10 = 10%, maxMdd = -0.25 for 25% DD).
 */

/** Operator percent (e.g. 10) → backend ratio (0.10). Empty → null. */
export function percentInputToRatio(
  percentText: string | null | undefined,
): number | null {
  if (percentText == null) return null;
  const t = String(percentText).trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

/** Backend ratio → operator percent string for form display. */
export function ratioToPercentInput(
  ratio: number | null | undefined,
): string {
  if (ratio == null || !Number.isFinite(ratio)) return "";
  return String(Number((Math.abs(ratio) * 100).toFixed(4)));
}

/**
 * Operator max-drawdown percent (e.g. 25) → signed backend maxMdd (-0.25).
 * Empty → null (no limit).
 */
export function maxDrawdownPercentToPolicy(
  percentText: string | null | undefined,
): number | null {
  const ratio = percentInputToRatio(percentText);
  if (ratio == null) return null;
  return -Math.abs(ratio);
}

/** Win rate percent (45) → ratio (0.45). */
export function winRatePercentToRatio(
  percentText: string | null | undefined,
): number | null {
  return percentInputToRatio(percentText);
}
