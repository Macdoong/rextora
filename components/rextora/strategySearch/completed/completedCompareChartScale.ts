/** Bar-scale helpers for candidate comparison charts (presentation only). */

export function compareBarDomainMax(
  values: number[],
  threshold?: number | null,
): number {
  const nums = values.filter((v) => Number.isFinite(v) && v >= 0);
  if (threshold != null && Number.isFinite(threshold) && threshold >= 0) {
    nums.push(threshold);
  }
  return Math.max(...nums, 0.01);
}

export function compareBarWidthPct(value: number, domainMax: number): number {
  if (domainMax <= 0) return 0;
  return Math.min(100, (value / domainMax) * 100);
}

export function compareThresholdMarkerPct(
  threshold: number,
  domainMax: number,
): number {
  return compareBarWidthPct(threshold, domainMax);
}
