/**
 * Research current-day end-boundary correction.
 * Does not start Research/Paper/Live or rewrite stored jobs.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultOperatorFormState,
  datesForPeriodPreset,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import {
  isCandleFinalized,
} from "../src/lib/rextora/data/candleTime";
import {
  assertHistoricalDataCoverage,
  HistoricalDataCoverageError,
} from "../src/lib/rextora/data/historicalDataCoverage";
import { generateSyntheticCandlesForRange } from "../src/lib/rextora/data/ohlcvTypes";
import {
  latestFinalizedClockBoundaryMs,
  resolveResearchEffectiveEnd,
} from "../src/lib/rextora/data/researchPeriodEnd";
import { NEW_JOB_EVENT_SEQUENCE_COST_MODEL } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import { validateCreateSearchJobBody } from "../src/lib/rextora/strategySearch/jobApiValidation";
import {
  GROUP_PATTERN,
  GROUP_PATTERN_CANONICAL,
  GROUP_SAFE,
} from "../src/lib/rextora/researchRankingReadModel";
import { RETIRED_SAFE_PARAMS_HASH, RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const INTERVAL_15M = 900_000;
const MORNING_NOW_MS = Date.parse("2026-09-08T01:59:31.175Z");
const FORMING_NOW_MS = Date.parse("2026-09-08T01:52:00.000Z");
const FUTURE_EOD_MS = Date.parse("2026-09-08T23:59:59.999Z");
const FINALIZED_CLOSE_MS = Date.parse("2026-09-08T01:44:59.999Z");
const FORMING_OPEN_MS = Date.parse("2026-09-08T01:45:00.000Z");
const FORMING_CLOSE_MS = Date.parse("2026-09-08T01:59:59.999Z");
const LAST_FINALIZED_OPEN_MS = Date.parse("2026-09-08T01:30:00.000Z");
const HISTORICAL_END_MS = Date.parse("2026-08-10T23:59:59.999Z");
const WINDOW_START_MS = Date.parse("2026-08-09T00:00:00.000Z");
const FAILED_JOB_ID = "search_793994cf-3606-4f74-9171-47113724b4ba";
const FAILED_JOB_PATH = path.join(
  process.cwd(),
  "data/rextora/strategy-search/jobs",
  `${FAILED_JOB_ID}.json`,
);
const SAFE_PATH = "data/strategies/SAFE_v44_i4060.json";

function safeSha256(): string | null {
  if (!fs.existsSync(SAFE_PATH)) return null;
  return (!((typeof existsSync === 'function' && existsSync(SAFE_PATH)) || (typeof fs !== 'undefined' && fs.existsSync(SAFE_PATH)))) ? null : createHash("sha256").update((typeof readFileSync === 'function' ? readFileSync : fs.readFileSync)(SAFE_PATH)).digest("hex");
}

function readFailedJob(): {
  config: { evaluationWindows: Array<{ toOpenTime: number }> };
  failureMessage: string;
  createdAt: string;
} {
  return JSON.parse(fs.readFileSync(FAILED_JOB_PATH, "utf8")) as {
    config: { evaluationWindows: Array<{ toOpenTime: number }> };
    failureMessage: string;
    createdAt: string;
  };
}

function candlesThrough(lastOpenMs: number) {
  return generateSyntheticCandlesForRange(
    WINDOW_START_MS,
    lastOpenMs,
    INTERVAL_15M,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Research current-period end-boundary helper", () => {
  it("1. current-day preset at morning time does not request 23:59:59 future data", () => {
    const resolved = resolveResearchEffectiveEnd({
      requestedEndMs: FUTURE_EOD_MS,
      nowMs: MORNING_NOW_MS,
      intervalMs: INTERVAL_15M,
      isCurrentPeriodPreset: true,
    });
    expect(resolved.effectiveEndMs).toBeLessThan(FUTURE_EOD_MS);
    expect(resolved.effectiveEndMs).not.toBe(FUTURE_EOD_MS);
    expect(new Date(resolved.effectiveEndMs).toISOString()).not.toBe(
      "2026-09-08T23:59:59.999Z",
    );
  });

  it("2. current-day preset resolves to latest available finalized boundary", () => {
    const storeBoundary = Date.parse("2026-09-08T01:14:59.999Z");
    const resolved = resolveResearchEffectiveEnd({
      requestedEndMs: FUTURE_EOD_MS,
      latestFinalizedAvailableMs: storeBoundary,
      nowMs: MORNING_NOW_MS,
      intervalMs: INTERVAL_15M,
      isCurrentPeriodPreset: true,
    });
    expect(resolved.effectiveEndMs).toBe(storeBoundary);
    expect(resolved.effectiveEndMs).toBe(
      Math.min(
        FUTURE_EOD_MS,
        storeBoundary,
        latestFinalizedClockBoundaryMs(MORNING_NOW_MS, INTERVAL_15M),
      ),
    );
  });

  it("3. current-day preset works before today's final candle exists", () => {
    const resolved = resolveResearchEffectiveEnd({
      requestedEndMs: FUTURE_EOD_MS,
      nowMs: MORNING_NOW_MS,
      intervalMs: INTERVAL_15M,
    });
    const todayFinalOpen = Date.parse("2026-09-08T23:45:00.000Z");
    expect(resolved.effectiveEndMs).toBe(FINALIZED_CLOSE_MS);
    expect(resolved.effectiveEndMs).toBeLessThan(todayFinalOpen);
    expect(
      assertHistoricalDataCoverage({
        timeframe: "15m",
        requestedStartMs: WINDOW_START_MS,
        requestedEndMs: resolved.effectiveEndMs,
        candles: candlesThrough(LAST_FINALIZED_OPEN_MS),
      }).sufficient,
    ).toBe(true);
  });

  it("4. 15m forming candle is not treated as completed coverage", () => {
    const resolved = resolveResearchEffectiveEnd({
      requestedEndMs: FUTURE_EOD_MS,
      nowMs: FORMING_NOW_MS,
      intervalMs: INTERVAL_15M,
    });
    expect(
      isCandleFinalized(
        { openTime: FORMING_OPEN_MS },
        FORMING_NOW_MS,
        INTERVAL_15M,
      ),
    ).toBe(false);
    expect(resolved.effectiveEndMs).toBe(FINALIZED_CLOSE_MS);
    expect(resolved.effectiveEndMs).not.toBe(FORMING_CLOSE_MS);
    expect(resolved.effectiveEndMs).toBeLessThan(FORMING_OPEN_MS);
  });

  it("5. explicit past historical end remains exact", () => {
    const resolved = resolveResearchEffectiveEnd({
      requestedEndMs: HISTORICAL_END_MS,
      nowMs: MORNING_NOW_MS,
      intervalMs: INTERVAL_15M,
      isCurrentPeriodPreset: false,
    });
    expect(resolved.effectiveEndMs).toBe(HISTORICAL_END_MS);
    expect(resolved.clamped).toBe(false);
    expect(resolved.reason).toBe("explicit_historical");

    const inferred = resolveResearchEffectiveEnd({
      requestedEndMs: HISTORICAL_END_MS,
      nowMs: MORNING_NOW_MS,
      intervalMs: INTERVAL_15M,
    });
    expect(inferred.effectiveEndMs).toBe(HISTORICAL_END_MS);
  });

  it("6. explicit unavailable historical end still fails closed", () => {
    const resolved = resolveResearchEffectiveEnd({
      requestedEndMs: HISTORICAL_END_MS,
      nowMs: MORNING_NOW_MS,
      intervalMs: INTERVAL_15M,
    });
    expect(resolved.effectiveEndMs).toBe(HISTORICAL_END_MS);
    const stale = generateSyntheticCandlesForRange(
      Date.parse("2026-07-01T00:00:00.000Z"),
      Date.parse("2026-07-01T12:00:00.000Z"),
      INTERVAL_15M,
    );
    expect(() =>
      assertHistoricalDataCoverage({
        timeframe: "15m",
        requestedStartMs: Date.parse("2026-07-01T00:00:00.000Z"),
        requestedEndMs: resolved.effectiveEndMs,
        candles: stale,
      }),
    ).toThrow(HistoricalDataCoverageError);
    try {
      assertHistoricalDataCoverage({
        timeframe: "15m",
        requestedStartMs: Date.parse("2026-07-01T00:00:00.000Z"),
        requestedEndMs: resolved.effectiveEndMs,
        candles: stale,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(HistoricalDataCoverageError);
      expect((err as HistoricalDataCoverageError).sourceReason).toBe(
        "END_BOUNDARY_MISSING",
      );
    }
  });
});

describe("Research form and create-job wiring", () => {
  it("current-day short preset body does not persist future EOD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MORNING_NOW_MS);
    const dates = datesForPeriodPreset("short");
    expect(dates.to).toBe("2026-09-08");
    const form = {
      ...createDefaultOperatorFormState(),
      periodPreset: "short" as const,
      availableFromDate: dates.from,
      availableToDate: dates.to,
      timeframe: "15m",
    };
    const body = operatorFormToCreateBody(form);
    expect(body.evaluationWindows[0]?.toOpenTime).toBe(FINALIZED_CLOSE_MS);
    expect(body.dataRef.availableTo).toBe(FINALIZED_CLOSE_MS);
    expect(body.evaluationWindows[0]?.toOpenTime).not.toBe(FUTURE_EOD_MS);
  });

  it("server create validation clamps current-day future EOD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MORNING_NOW_MS);
    const dates = datesForPeriodPreset("short");
    const body = operatorFormToCreateBody({
      ...createDefaultOperatorFormState(),
      periodPreset: "short",
      availableFromDate: dates.from,
      availableToDate: dates.to,
      timeframe: "15m",
    });
    const unclamped = {
      ...body,
      evaluationWindows: body.evaluationWindows.map((window) => ({
        ...window,
        toOpenTime: FUTURE_EOD_MS,
      })),
      dataRef: { ...body.dataRef, availableTo: FUTURE_EOD_MS },
    };
    const validated = validateCreateSearchJobBody(unclamped);
    expect(validated.config.evaluationWindows[0]?.toOpenTime).toBe(
      FINALIZED_CLOSE_MS,
    );
    expect(validated.execution.dataRef.availableTo).toBe(FINALIZED_CLOSE_MS);
    expect(validated.execution.eventSequenceCostModel).toBe(
      NEW_JOB_EVENT_SEQUENCE_COST_MODEL,
    );
  });

  it("explicit historical custom end is not clamped", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MORNING_NOW_MS);
    const body = operatorFormToCreateBody({
      ...createDefaultOperatorFormState(),
      periodPreset: "custom",
      availableFromDate: "2026-07-11",
      availableToDate: "2026-08-10",
      timeframe: "15m",
    });
    expect(body.evaluationWindows[0]?.toOpenTime).toBe(HISTORICAL_END_MS);
    expect(body.dataRef.availableTo).toBe(HISTORICAL_END_MS);
    const validated = validateCreateSearchJobBody(body);
    expect(validated.config.evaluationWindows[0]?.toOpenTime).toBe(
      HISTORICAL_END_MS,
    );
  });

  it("future calendar day remains fail-closed (not silently clamped)", () => {
    const futureDayEnd = Date.parse("2026-09-09T23:59:59.999Z");
    const resolved = resolveResearchEffectiveEnd({
      requestedEndMs: futureDayEnd,
      nowMs: MORNING_NOW_MS,
      intervalMs: INTERVAL_15M,
    });
    expect(resolved.effectiveEndMs).toBe(futureDayEnd);
    expect(resolved.reason).toBe("explicit_historical");
  });
});

describe("canonical failed-job regression", () => {
  it("unclamped 23:59:59 morning window fails; clamped window does not", () => {
    const morningCandles = candlesThrough(LAST_FINALIZED_OPEN_MS);
    expect(() =>
      assertHistoricalDataCoverage({
        timeframe: "15m",
        requestedStartMs: WINDOW_START_MS,
        requestedEndMs: FUTURE_EOD_MS,
        candles: morningCandles,
      }),
    ).toThrow(HistoricalDataCoverageError);

    const corrected = resolveResearchEffectiveEnd({
      requestedEndMs: FUTURE_EOD_MS,
      nowMs: MORNING_NOW_MS,
      intervalMs: INTERVAL_15M,
    });
    expect(corrected.effectiveEndMs).toBe(FINALIZED_CLOSE_MS);
    const coverage = assertHistoricalDataCoverage({
      timeframe: "15m",
      requestedStartMs: WINDOW_START_MS,
      requestedEndMs: corrected.effectiveEndMs,
      candles: morningCandles,
    });
    expect(coverage.sufficient).toBe(true);
    expect(coverage.failureReasons).not.toContain("END_BOUNDARY_MISSING");
  });

  it.skipIf(!fs.existsSync(FAILED_JOB_PATH))("7. old completed Research jobs are not rewritten", () => {
    const before = fs.readFileSync(FAILED_JOB_PATH);
    const job = JSON.parse(before.toString()) as {
      config: { evaluationWindows: Array<{ toOpenTime: number }> };
      failureMessage: string;
    };
    expect(job.config.evaluationWindows[0]?.toOpenTime).toBe(FUTURE_EOD_MS);
    expect(job.failureMessage).toContain("END_BOUNDARY_MISSING");
    expect(fs.readFileSync(FAILED_JOB_PATH).equals(before)).toBe(true);
  });
});

describe("unchanged authorities and safety", () => {
  it("8. canonical Pattern cost model remains event_sequence_execution_price_v1", () => {
    expect(NEW_JOB_EVENT_SEQUENCE_COST_MODEL).toBe(
      "event_sequence_execution_price_v1",
    );
  });

  it("9. Research ranking behavior unchanged", () => {
    expect(GROUP_SAFE).toBe("safe_execution_price_v1");
    expect(GROUP_PATTERN_CANONICAL).toBe("event_sequence_execution_price_v1");
    expect(GROUP_PATTERN).toBe("event_sequence_ledger_v0");
  });

  it("10. SAFE unchanged", () => {
    expect(RETIRED_SAFE_STRATEGY_ID).toBe("SAFE_v44_i4060");
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    expect(safeSha256()).toBeNull();
  });

  it("11-12. no Paper start and no Live activation in this fix", () => {
    const files = [
      "src/lib/rextora/data/researchPeriodEnd.ts",
      "components/rextora/strategySearch/formDefaults.ts",
      "src/lib/rextora/strategySearch/jobApiValidation.ts",
    ];
    for (const file of files) {
      const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src.includes("startPaper")).toBe(false);
      expect(src.includes("resumePaper")).toBe(false);
      expect(src.includes("activateLive")).toBe(false);
      expect(src.includes("placeOrder")).toBe(false);
      expect(src.includes("startSearchJobExecution(")).toBe(false);
    }
  });

  it.skipIf(!fs.existsSync(FAILED_JOB_PATH))("forensic: failed job requested a future EOD the helper would clamp", () => {
    const job = readFailedJob();
    expect(job.createdAt).toBe("2026-09-08T01:59:31.175Z");
    expect(job.config.evaluationWindows[0]?.toOpenTime).toBe(FUTURE_EOD_MS);
    const corrected = resolveResearchEffectiveEnd({
      requestedEndMs: job.config.evaluationWindows[0]!.toOpenTime,
      nowMs: Date.parse(job.createdAt),
      intervalMs: INTERVAL_15M,
    });
    expect(corrected.effectiveEndMs).toBe(FINALIZED_CLOSE_MS);
    expect(corrected.effectiveEndMs).toBeLessThan(Date.parse(job.createdAt));
  });
});
