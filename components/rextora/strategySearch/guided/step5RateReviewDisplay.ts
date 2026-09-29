import { formatDecimalRateAsPercentHint } from "./formatDecimalRateHint";

export function step5StoredRateDisplay(rate: string): {
  rawKo: string;
  hintKo: string | null;
} {
  const raw = rate.trim();
  if (!raw) return { rawKo: "—", hintKo: null };
  return { rawKo: raw, hintKo: formatDecimalRateAsPercentHint(raw) };
}

/** Matches preview row when hint exists: "0.0004 (≈ 0.04%)" */
export function step5StoredRatePreviewLine(rate: string): string {
  const { rawKo, hintKo } = step5StoredRateDisplay(rate);
  if (rawKo === "—") return "—";
  return hintKo ? `${rawKo} (≈ ${hintKo})` : rawKo;
}
