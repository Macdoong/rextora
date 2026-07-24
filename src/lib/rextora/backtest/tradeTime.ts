/** Parse trade entry/exit timestamps from persisted number ms or ISO strings. */
export function parseTradeTimeMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(trimmed)) {
      return asNum;
    }
    const asDate = Date.parse(trimmed);
    if (Number.isFinite(asDate)) return asDate;
  }
  return NaN;
}

export function tradeFocusTimeRange(input: {
  entryTime?: unknown;
  exitTime?: unknown;
}): { fromMs: number; toMs: number } | null {
  const fromMs = parseTradeTimeMs(input.entryTime);
  const toMs = parseTradeTimeMs(input.exitTime);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return null;
  }
  return { fromMs, toMs };
}
