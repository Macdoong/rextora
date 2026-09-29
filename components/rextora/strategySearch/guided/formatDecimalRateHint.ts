/** Customer hint only — does not change stored decimal rate values. */
export function formatDecimalRateAsPercentHint(rate: string): string | null {
  const n = Number(rate);
  if (!Number.isFinite(n)) return null;
  const pct = n * 100;
  const text = pct
    .toFixed(4)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  return `${text}%`;
}
