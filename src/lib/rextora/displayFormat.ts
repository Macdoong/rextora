/** UI number formatting — labels live in displayLabels.ts */

export { displayLabel } from "./displayLabels";

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatPercent(value: number, decimals?: number): string {
  const abs = Math.abs(value);
  const d = decimals ?? (abs > 0 && abs < 0.1 ? 3 : 2);
  return `${roundTo(value, d).toFixed(d)}%`;
}

export function formatUsdt(value: number): string {
  return `${roundTo(value, 2).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return Number.isInteger(value) ? String(value) : roundTo(value, 1).toFixed(1);
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return roundTo(value, decimals).toFixed(decimals);
}

/**
 * Display-only price formatter. Does not mutate stored numeric values or
 * execution math. Trims IEEE float noise while keeping small-asset precision.
 * Not a tick-size / order-rounding helper.
 */
export function formatDisplayPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  const decimals =
    abs >= 1000 ? 2 : abs >= 0.01 ? 8 : abs >= 0.0001 ? 10 : 12;
  let out = roundTo(abs, decimals).toFixed(decimals);
  if (out.includes(".")) {
    out = out.replace(/0+$/, "").replace(/\.$/, "");
  }
  return sign + out;
}

/** Display-only leverage multiple, e.g. 2 → 2.0x. */
export function formatLeverageMultiple(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(1)}x`;
}

export function formatVolumeChange(value: number): string {
  return formatPercent(value, 2);
}

export function formatVolatility(value: number): string {
  return formatPercent(value, 2);
}

export function formatSpread(value: number): string {
  return formatPercent(value, 3);
}

export function formatFundingFee(value: number): string {
  return formatPercent(value * 100, 3);
}

export function hasLongFloatString(text: string): boolean {
  return /\d\.\d{6,}/.test(text);
}

export {
  formatDataSourceMeta,
  formatDurationMs,
  formatLastCheckTime,
  formatRuntimeMeta,
  formatScanStatus
} from "./displayLabels";
