import { describe, expect, it } from "vitest";
import {
  BACKTEST_PERIOD_PRESETS,
  computeDayPresetRange,
  isFutureCalendarDate,
  resolveEffectiveEndFromOpenTime,
  resolveEffectiveEndOpenTime,
  todayCalendarUtc,
  validateBacktestCalendarRange,
} from "../src/lib/rextora/backtest/backtestDateRange";

describe("backtest date range / today validation", () => {
  const noonToday = Date.parse(`${todayCalendarUtc()}T12:00:00.000Z`);

  it("accepts today and clamps end to now (never rejects today)", () => {
    const today = todayCalendarUtc(noonToday);
    const end = resolveEffectiveEndOpenTime(today, noonToday);
    expect(end.ok).toBe(true);
    if (!end.ok) return;
    expect(end.endOpenTime).toBe(noonToday);
    expect(end.endOpenTime).toBeLessThanOrEqual(noonToday);

    const range = validateBacktestCalendarRange(
      computeDayPresetRange(30, noonToday).fromDate,
      today,
      noonToday,
    );
    expect(range.ok).toBe(true);
    if (!range.ok) return;
    expect(range.toOpenTime).toBe(noonToday);
  });

  it("rejects tomorrow calendar date", () => {
    const tomorrow = todayCalendarUtc(noonToday + 86_400_000);
    expect(isFutureCalendarDate(tomorrow, noonToday)).toBe(true);
    const end = resolveEffectiveEndOpenTime(tomorrow, noonToday);
    expect(end.ok).toBe(false);
    if (end.ok) return;
    expect(end.code).toBe("FUTURE_DATA_BLOCKED");

    const fromOpen = Date.parse(`${todayCalendarUtc(noonToday)}T00:00:00.000Z`);
    const toOpen = Date.parse(`${tomorrow}T23:59:59.999Z`);
    const fromMs = resolveEffectiveEndFromOpenTime(toOpen, noonToday);
    expect(fromMs.ok).toBe(false);
    expect(fromOpen).toBeLessThan(toOpen);
  });

  it("clamps end-of-day-today timestamp without rejecting", () => {
    const today = todayCalendarUtc(noonToday);
    const eod = Date.parse(`${today}T23:59:59.999Z`);
    const end = resolveEffectiveEndFromOpenTime(eod, noonToday);
    expect(end.ok).toBe(true);
    if (!end.ok) return;
    expect(end.endOpenTime).toBe(noonToday);
  });

  it("respects latest candle cap when provided", () => {
    const today = todayCalendarUtc(noonToday);
    const latestCandle = noonToday - 3_600_000;
    const end = resolveEffectiveEndOpenTime(today, noonToday, latestCandle);
    expect(end.ok).toBe(true);
    if (!end.ok) return;
    expect(end.endOpenTime).toBe(latestCandle);
  });

  it("exposes required presets including whole period", () => {
    const labels = BACKTEST_PERIOD_PRESETS.map((p) => p.label);
    expect(labels).toEqual([
      "최근 1개월",
      "최근 3개월",
      "최근 6개월",
      "최근 1년",
      "전체 기간",
    ]);
    expect(BACKTEST_PERIOD_PRESETS.find((p) => p.id === "all")?.days).toBeNull();
  });

  it("computes 1/3/6/12 month day presets from now", () => {
    const fixed = Date.parse("2026-07-24T12:00:00.000Z");
    expect(computeDayPresetRange(30, fixed)).toEqual({
      fromDate: "2026-06-24",
      toDate: "2026-07-24",
    });
    expect(computeDayPresetRange(90, fixed)).toEqual({
      fromDate: "2026-04-25",
      toDate: "2026-07-24",
    });
    expect(computeDayPresetRange(180, fixed)).toEqual({
      fromDate: "2026-01-25",
      toDate: "2026-07-24",
    });
    expect(computeDayPresetRange(365, fixed)).toEqual({
      fromDate: "2025-07-24",
      toDate: "2026-07-24",
    });
  });
});
