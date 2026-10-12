/**
 * Presentation helpers for the compare dashboard.
 * They only parse or count values the comparison model already displays.
 */

import type { SearchJobCompareRow } from "./searchJobComparison";

export const COMPARE_FUNNEL_STAGE_IDS = [
  "funnel-evaluated",
  "funnel-qualified",
  "funnel-final",
  "funnel-top10",
] as const;

export const COMPARE_RATE_IDS = ["funnel-pass-rate", "funnel-final-rate"] as const;

export function parseDisplayedCompareNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Existing formatted rate such as "40.6%". Does not recompute a denominator. */
export function parseDisplayedRate(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** Position on the true shared 0–100% comparison scale. Missing stays unavailable. */
export function rateScalePosition(value: string): number | null {
  const rate = parseDisplayedRate(value);
  return rate == null ? null : Math.min(100, rate);
}

/** Real interval between two values on that scale; equal or missing rates have no interval. */
export function rateDifferenceInterval(
  leftText: string,
  rightText: string,
): { startPct: number; endPct: number } | null {
  const left = rateScalePosition(leftText);
  const right = rateScalePosition(rightText);
  if (left == null || right == null || left === right) return null;
  return { startPct: Math.min(left, right), endPct: Math.max(left, right) };
}

/** Absolute difference between two already-displayed authoritative rates, in percentage points. */
export function rateDifferencePercentagePoints(
  leftText: string,
  rightText: string,
): number | null {
  const left = parseDisplayedRate(leftText);
  const right = parseDisplayedRate(rightText);
  if (left == null || right == null) return null;
  return Math.abs(left - right);
}

const COMPARE_FAMILY_DISPLAY: Record<string, string> = {
  "통합 SafeV44 (전체 파라미터)": "통합 기술 전략",
};

/** Map only the exact customer-visible family label; comparison identities stay raw. */
export function formatCompareFamilyDisplay(value: string): string {
  return value
    .split(/,\s*/)
    .map((name) => COMPARE_FAMILY_DISPLAY[name] ?? name)
    .join(", ");
}

/** Compact display-only setting date; the original comparison value is left untouched. */
export function formatCompactCompareDate(value: string): string {
  const match = value.trim().match(
    /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(오전|오후|AM|PM)\s*(\d{1,2}):(\d{2})(?::\d{2})?)?$/i,
  );
  if (!match) return value;
  const [, yearText, monthText, dayText, meridiem, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const dateCheck = new Date(year, month - 1, day);
  if (
    month < 1 || month > 12 || day < 1 ||
    dateCheck.getFullYear() !== year ||
    dateCheck.getMonth() !== month - 1 ||
    dateCheck.getDate() !== day
  ) return value;

  const date = `${yearText}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
  if (!hourText || !minuteText) return date;
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (minute > 59) return value;
  if (meridiem) {
    if (hour < 1 || hour > 12) return value;
    if (/오후|pm/i.test(meridiem) && hour < 12) hour += 12;
    if (/오전|am/i.test(meridiem) && hour === 12) hour = 0;
  } else if (hour > 23) {
    return value;
  }
  return `${date} ${String(hour).padStart(2, "0")}:${minuteText}`;
}

export function isMissingCompareDisplay(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "—" || trimmed === "-";
}

/** Parses a displayed count or percentage. Missing markers stay null, never zero. */
export function displayedCompareMagnitude(value: string): number | null {
  if (isMissingCompareDisplay(value)) return null;
  const rate = parseDisplayedRate(value);
  if (rate != null) return rate;
  return parseDisplayedCompareNumber(value);
}

/**
 * Bar length is value / max(left, right) for this metric only.
 * Missing stays missing. Zero stays zero width.
 */
export function pairRelativeBarWidths(
  leftText: string,
  rightText: string,
): {
  left: { missing: boolean; widthPct: number };
  right: { missing: boolean; widthPct: number };
} {
  const leftMissing = isMissingCompareDisplay(leftText) || displayedCompareMagnitude(leftText) == null;
  const rightMissing = isMissingCompareDisplay(rightText) || displayedCompareMagnitude(rightText) == null;
  const leftValue = leftMissing ? null : displayedCompareMagnitude(leftText);
  const rightValue = rightMissing ? null : displayedCompareMagnitude(rightText);
  const present = [leftValue, rightValue].filter((value): value is number => value != null);
  const max =
    present.length > 0 ? Math.max(...present.map((value) => Math.abs(value))) : 0;
  const side = (value: number | null, missing: boolean) => {
    if (missing || value == null) return { missing: true, widthPct: 0 };
    const magnitude = Math.abs(value);
    if (magnitude === 0 || max <= 0) return { missing: false, widthPct: 0 };
    return { missing: false, widthPct: (magnitude / max) * 100 };
  };
  return {
    left: side(leftValue, leftMissing),
    right: side(rightValue, rightMissing),
  };
}

export function pairedCompareBarPercents(
  left: number | null,
  right: number | null,
): { left: number; right: number } | null {
  if (left == null || right == null) return null;
  if (left < 0 || right < 0) return null;
  if (left === 0 && right === 0) return null;
  const max = Math.max(left, right);
  if (max <= 0) return null;
  return { left: (left / max) * 100, right: (right / max) * 100 };
}

/** Width within one search, relative to that search's evaluated count. */
export function funnelStageWidthPct(
  stageCount: number | null,
  evaluatedCount: number | null,
): number | null {
  if (stageCount == null || evaluatedCount == null) return null;
  if (evaluatedCount <= 0) return null;
  return Math.max(0, Math.min(100, (stageCount / evaluatedCount) * 100));
}

/** Bars below this width use a marker only; width is not inflated. */
export const FUNNEL_TINY_BAR_THRESHOLD_PCT = 2;

export function funnelStageBarDisplay(
  stageCount: number | null,
  evaluatedCount: number | null,
): { widthPct: number; showMarker: boolean; isZero: boolean } {
  const width = funnelStageWidthPct(stageCount, evaluatedCount);
  if (stageCount == null || stageCount === 0 || width == null || width === 0) {
    return { widthPct: 0, showMarker: false, isZero: true };
  }
  if (width < FUNNEL_TINY_BAR_THRESHOLD_PCT) {
    return { widthPct: 0, showMarker: true, isZero: false };
  }
  return { widthPct: width, showMarker: false, isZero: false };
}

/** Horizontal rate bar on a fixed 0–100% scale from an existing formatted rate. */
export function rateBarWidthPct(value: string): number | null {
  const rate = parseDisplayedRate(value);
  if (rate == null) return null;
  return Math.min(100, Math.max(0, rate));
}

export function compareFieldInventory(rows: readonly Pick<SearchJobCompareRow, "tone">[]): {
  same: number;
  different: number;
} {
  let same = 0;
  let different = 0;
  for (const row of rows) {
    if (row.tone === "same") same += 1;
    else if (row.tone === "different") different += 1;
  }
  return { same, different };
}

export function splitStrategyFamilySet(value: string): string[] {
  if (!value || value.trim() === "—") return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of value.split(/[,·]/)) {
    const name = part.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function strategyFamilyZones(left: string, right: string): {
  leftOnly: string[];
  shared: string[];
  rightOnly: string[];
} {
  const leftNames = splitStrategyFamilySet(left);
  const rightNames = splitStrategyFamilySet(right);
  const rightSet = new Set(rightNames);
  const leftSet = new Set(leftNames);
  return {
    leftOnly: leftNames.filter((name) => !rightSet.has(name)),
    shared: leftNames.filter((name) => rightSet.has(name)),
    rightOnly: rightNames.filter((name) => !leftSet.has(name)),
  };
}

/** Parses the customer date string already shown for 분석 구간. */
export function parseDisplayedSearchDate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return null;
  const match = trimmed.match(
    /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!match) return null;
  let hour = match[5] != null ? Number(match[5]) : 0;
  const minute = match[6] != null ? Number(match[6]) : 0;
  const second = match[7] != null ? Number(match[7]) : 0;
  if (match[4] === "오후" && hour < 12) hour += 12;
  if (match[4] === "오전" && hour === 12) hour = 0;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    hour,
    minute,
    second,
  );
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

export function parseDisplayedDurationMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return null;
  const ms = trimmed.match(/^(\d+)ms$/);
  if (ms) return Number(ms[1]);
  const seconds = trimmed.match(/^(\d+(?:\.\d+)?)초$/);
  if (seconds) return Number(seconds[1]) * 1000;
  const minutes = trimmed.match(/^(\d+)분(?:\s*(\d+)초)?$/);
  if (minutes) {
    return Number(minutes[1]) * 60_000 + (minutes[2] ? Number(minutes[2]) * 1000 : 0);
  }
  return null;
}

export function sharedPeriodTimeline(input: {
  leftStart: string;
  leftEnd: string;
  rightStart: string;
  rightEnd: string;
}): {
  left: { startPct: number; widthPct: number };
  right: { startPct: number; widthPct: number };
  overlap: { startPct: number; widthPct: number } | null;
} | null {
  const leftStart = parseDisplayedSearchDate(input.leftStart);
  const leftEnd = parseDisplayedSearchDate(input.leftEnd);
  const rightStart = parseDisplayedSearchDate(input.rightStart);
  const rightEnd = parseDisplayedSearchDate(input.rightEnd);
  if (leftStart == null || leftEnd == null || rightStart == null || rightEnd == null) {
    return null;
  }
  const spanStart = Math.min(leftStart, rightStart);
  const spanEnd = Math.max(leftEnd, rightEnd);
  const span = spanEnd - spanStart;
  if (span <= 0) return null;
  const band = (start: number, end: number) => {
    const startPct = ((start - spanStart) / span) * 100;
    const widthPct = Math.max(0, ((end - start) / span) * 100);
    return { startPct, widthPct };
  };
  const overlapStart = Math.max(leftStart, rightStart);
  const overlapEnd = Math.min(leftEnd, rightEnd);
  return {
    left: band(leftStart, leftEnd),
    right: band(rightStart, rightEnd),
    overlap: overlapEnd > overlapStart ? band(overlapStart, overlapEnd) : null,
  };
}
