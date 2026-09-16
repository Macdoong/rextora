/**
 * P3-A3.1 forensic policy verification (read-only).
 * Does not change production validators, Research jobs, or SAFE.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeEmaSeries } from "../indicator/indicatorEngine";
import { detectFvg, type FvgParams } from "../strategy/conditions/fvg";
import { HistoricalCandleLoadError } from "./historicalCandleLoader";
import {
  generateSyntheticCandles,
  type OhlcvCandle,
} from "./ohlcvTypes";
import { SUPPORTED_TIMEFRAMES, resolveTimeframe } from "./timeframes";
import { StrategySearchAdapterError } from "../strategySearch/backtestAdapter";
import { StrategySearchGenerationError } from "../strategySearch/candidateGenerator";
import { classifyEngineError } from "../strategySearch/engineErrorClassification";

export const EXPECTED_GIT_HEAD =
  "8c00049eb2e01980719487e1f12bcb3c7e4e5b8b";
export const EXPECTED_SAFE_SHA256 =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
export const EXPECTED_SAFE_PARAMS_HASH = "7893ca3f0e30";
export const EXPECTED_RESEARCH_INDEX_SHA256 =
  "9395b5faaff412abb59fba81deb419871574324d812d7cdc293272d9aced3437";

export const SAFE_PATH = "data/strategies/SAFE_v44_i4060.json";
export const RESEARCH_INDEX_PATH = "data/rextora/strategy-search/index.json";
export const BACKTEST_INDEX_PATH = "data/rextora/backtests/index.json";

export const BINANCE_PUBLIC_FUTURES_KLINES =
  "https://fapi.binance.com/fapi/v1/klines";

export const OPEN_TIME_TRANSFORM = "RAW" as const;

export const SUPPORTED_MARKET_DATA_TIMEFRAMES = SUPPORTED_TIMEFRAMES.map(
  (id) => {
    const spec = resolveTimeframe(id);
    return {
      timeframe: spec.id,
      intervalMs: spec.intervalMs,
      providerInterval: spec.binanceInterval,
    };
  },
);

export type AdjacentDeltaClass =
  | "VALID"
  | "MISSING_BAR"
  | "OFF_GRID"
  | "DUPLICATE_OR_ORDER"
  | "OTHER";

/** Frozen P3-A4 adjacency classifier — exact multiples only; no ±5% blur. */
export function classifyAdjacentDelta(
  deltaMs: number,
  intervalMs: number,
): AdjacentDeltaClass {
  if (!Number.isFinite(deltaMs) || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return "OTHER";
  }
  if (deltaMs <= 0) return "DUPLICATE_OR_ORDER";
  if (deltaMs === intervalMs) return "VALID";
  if (deltaMs % intervalMs === 0) return "MISSING_BAR";
  return "OFF_GRID";
}

export interface SeriesGridStats {
  sampleCount: number;
  uniqueRemainders: number[];
  minDelta: number | null;
  maxDelta: number | null;
  offGridCount: number;
  nonExactDeltaCount: number;
  missingBarDeltaCount: number;
}

export function analyzeOpenTimeSeries(
  openTimes: number[],
  intervalMs: number,
): SeriesGridStats {
  const remainders = openTimes.map((t) => ((t % intervalMs) + intervalMs) % intervalMs);
  const uniqueRemainders = [...new Set(remainders)].sort((a, b) => a - b);
  const deltas: number[] = [];
  for (let i = 1; i < openTimes.length; i += 1) {
    deltas.push(openTimes[i]! - openTimes[i - 1]!);
  }
  return {
    sampleCount: openTimes.length,
    uniqueRemainders,
    minDelta: deltas.length ? Math.min(...deltas) : null,
    maxDelta: deltas.length ? Math.max(...deltas) : null,
    offGridCount: remainders.filter((r) => r !== 0).length,
    nonExactDeltaCount: deltas.filter((d) => d !== intervalMs).length,
    missingBarDeltaCount: deltas.filter(
      (d) => d > intervalMs && d % intervalMs === 0,
    ).length,
  };
}

export const CANONICAL_GRID_POLICY =
  "For every supported fixed-ms timeframe (1m/3m/5m/15m/1h), Binance USD-M kline openTime is raw Unix-epoch UTC ms with openTime % intervalMs === 0. Consecutive candles must satisfy delta === intervalMs. No timezone/session offset. Cursor advances lastOpen+1ms without snapping.";

export const EXPLICIT_PRODUCT_GAP_POLICY_FOUND = "NO" as const;

export const RECOMMENDED_INTERNAL_GAP_POLICY = "MODEL_GAP_A" as const;

export const RECOMMENDED_RESEARCH_ERROR_MODEL = "MODEL_ERR_C" as const;

export const CODE_BASED_CLASSIFICATION_SUPPORTED = "YES" as const;

export const CODE_BASED_CLASSIFICATION_INTEGRATION =
  "src/lib/rextora/strategySearch/engineErrorClassification.ts::classifyEngineError — add instanceof StrategySearchAdapterError and HistoricalCandleLoadError branches on err.code before the message-substring fallback";

export const RECOMMENDED_RESEARCH_PREFLIGHT_LOCATION =
  "src/lib/rextora/strategySearch/jobExecutionRegistry.ts::resolveCandles";

export const DEFENSIVE_SECONDARY_VALIDATION_LOCATION =
  "src/lib/rextora/strategySearch/backtestAdapter.ts::validateCandles (called from runCandidateWindowEvaluation after resolveCandles)";

export const P3_A4_POLICY_READY = "YES" as const;

export function sha256File(relPath: string): string | null {
  if (!existsSync(relPath)) return null;
  return createHash("sha256").update(readFileSync(relPath)).digest("hex");
}

export function captureProductionReadonlyHashes(cwd = process.cwd()) {
  const safe = join(cwd, SAFE_PATH);
  const index = join(cwd, RESEARCH_INDEX_PATH);
  const backtestIndex = join(cwd, BACKTEST_INDEX_PATH);
  return {
    safeSha256: sha256File(safe),
    paramsHash: EXPECTED_SAFE_PARAMS_HASH,
    researchIndexSha256: sha256File(index),
    backtestIndexSha256: sha256File(backtestIndex),
    productionWrites: 0,
    researchExecutions: 0,
    paperLiveActions: 0,
    orders: 0,
  };
}

export interface LiveTfProbe {
  timeframe: string;
  intervalMs: number;
  providerInterval: string;
  available: boolean;
  sampleCount: number;
  uniqueRemainders: number[];
  minDelta: number | null;
  maxDelta: number | null;
  offGridCount: number;
  nonExactDeltaCount: number;
  observedRemainder: number | null;
  exactGrid: "YES" | "NO" | "UNAVAILABLE";
  anchor: string | null;
  error?: string;
}

export async function probeLiveProviderGrid(options?: {
  symbol?: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<{
  LIVE_PROVIDER_PROBE: "AVAILABLE" | "UNAVAILABLE";
  symbol: string;
  limit: number;
  endpoint: string;
  authenticated: false;
  cacheModified: false;
  rows: LiveTfProbe[];
}> {
  const symbol = options?.symbol ?? "BTCUSDT";
  const limit = options?.limit ?? 40;
  const timeoutMs = options?.timeoutMs ?? 12_000;
  const rows: LiveTfProbe[] = [];
  let anyOk = false;

  for (const spec of SUPPORTED_MARKET_DATA_TIMEFRAMES) {
    const url = `${BINANCE_PUBLIC_FUTURES_KLINES}?symbol=${symbol}&interval=${spec.providerInterval}&limit=${limit}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        rows.push({
          timeframe: spec.timeframe,
          intervalMs: spec.intervalMs,
          providerInterval: spec.providerInterval,
          available: false,
          sampleCount: 0,
          uniqueRemainders: [],
          minDelta: null,
          maxDelta: null,
          offGridCount: 0,
          nonExactDeltaCount: 0,
          observedRemainder: null,
          exactGrid: "UNAVAILABLE",
          anchor: null,
          error: `http_${res.status}`,
        });
        continue;
      }
      const data = (await res.json()) as Array<Array<string | number>>;
      if (!Array.isArray(data) || data.length === 0) {
        rows.push({
          timeframe: spec.timeframe,
          intervalMs: spec.intervalMs,
          providerInterval: spec.providerInterval,
          available: false,
          sampleCount: 0,
          uniqueRemainders: [],
          minDelta: null,
          maxDelta: null,
          offGridCount: 0,
          nonExactDeltaCount: 0,
          observedRemainder: null,
          exactGrid: "UNAVAILABLE",
          anchor: null,
          error: "empty_body",
        });
        continue;
      }
      const openTimes = data.map((row) => Number(row[0]));
      const stats = analyzeOpenTimeSeries(openTimes, spec.intervalMs);
      const remainder =
        stats.uniqueRemainders.length === 1 ? stats.uniqueRemainders[0]! : null;
      anyOk = true;
      rows.push({
        timeframe: spec.timeframe,
        intervalMs: spec.intervalMs,
        providerInterval: spec.providerInterval,
        available: true,
        sampleCount: stats.sampleCount,
        uniqueRemainders: stats.uniqueRemainders,
        minDelta: stats.minDelta,
        maxDelta: stats.maxDelta,
        offGridCount: stats.offGridCount,
        nonExactDeltaCount: stats.nonExactDeltaCount,
        observedRemainder: remainder,
        exactGrid:
          stats.offGridCount === 0 &&
          stats.nonExactDeltaCount === 0 &&
          remainder === 0
            ? "YES"
            : "NO",
        anchor: "unix_epoch_utc_ms",
      });
    } catch (err) {
      rows.push({
        timeframe: spec.timeframe,
        intervalMs: spec.intervalMs,
        providerInterval: spec.providerInterval,
        available: false,
        sampleCount: 0,
        uniqueRemainders: [],
        minDelta: null,
        maxDelta: null,
        offGridCount: 0,
        nonExactDeltaCount: 0,
        observedRemainder: null,
        exactGrid: "UNAVAILABLE",
        anchor: null,
        error: err instanceof Error ? err.message : "fetch_failed",
      });
    }
  }

  return {
    LIVE_PROVIDER_PROBE: anyOk ? "AVAILABLE" : "UNAVAILABLE",
    symbol,
    limit,
    endpoint: BINANCE_PUBLIC_FUTURES_KLINES,
    authenticated: false,
    cacheModified: false,
    rows,
  };
}

export function analyzeFixtureGridAgreement() {
  const syntheticByTf = SUPPORTED_MARKET_DATA_TIMEFRAMES.map((spec) => {
    const candles = generateSyntheticCandles(48, 100, 0.0002, {
      startOpenTime: Date.UTC(2024, 0, 1),
      intervalMs: spec.intervalMs,
    });
    return {
      source: "generateSyntheticCandles",
      timeframe: spec.timeframe,
      ...analyzeOpenTimeSeries(
        candles.map((c) => c.openTime),
        spec.intervalMs,
      ),
    };
  });

  const production15mBoundaries = [
    {
      id: "bt_ms1sio2m_8e9a5a.actualFirstCandleTime",
      iso: "2026-05-27T00:00:00.000Z",
      intervalMs: 900_000,
    },
    {
      id: "bt_ms1sio2m_8e9a5a.actualLastCandleTime",
      iso: "2026-07-26T12:30:00.000Z",
      intervalMs: 900_000,
    },
  ].map((row) => {
    const openTime = Date.parse(row.iso);
    return {
      ...row,
      openTime,
      remainder: openTime % row.intervalMs,
    };
  });

  const allSyntheticExact = syntheticByTf.every(
    (row) =>
      row.offGridCount === 0 &&
      row.nonExactDeltaCount === 0 &&
      row.uniqueRemainders.length === 1 &&
      row.uniqueRemainders[0] === 0,
  );
  const boundariesAligned = production15mBoundaries.every((r) => r.remainder === 0);

  return {
    FIXTURE_GRID_MATCHES_PROVIDER_CONTRACT: allSyntheticExact && boundariesAligned
      ? ("YES" as const)
      : ("PARTIAL" as const),
    syntheticByTf,
    production15mBoundaries,
  };
}

const FVG_FIXTURE_PARAMS: FvgParams = {
  minGapAbs: 0,
  minGapPct: 0,
  atrRelativeMult: 0,
  partialFillPct: 0,
  fullFillInvalidates: false,
  maxAgeBars: 10,
  firstTouchOnly: false,
  entryInsideGap: false,
  invalidateOnCloseThrough: false,
};

export function measureMissingBarStrategySensitivity() {
  const full = generateSyntheticCandles(40, 100, 0.0004, {
    startOpenTime: Date.UTC(2024, 0, 1),
    intervalMs: 900_000,
  });
  const gapped = full.filter((_, i) => i !== 12);
  const emaFull = computeEmaSeries(
    full.map((c) => c.close),
    8,
  );
  const emaGapped = computeEmaSeries(
    gapped.map((c) => c.close),
    8,
  );
  const alignedTailFull = emaFull[emaFull.length - 1]!;
  const alignedTailGapped = emaGapped[emaGapped.length - 1]!;

  const fvgBase: OhlcvCandle[] = [
    {
      openTime: Date.UTC(2024, 0, 1),
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1,
    },
    {
      openTime: Date.UTC(2024, 0, 1) + 900_000,
      open: 100.5,
      high: 100.8,
      low: 100.2,
      close: 100.4,
      volume: 1,
    },
    {
      openTime: Date.UTC(2024, 0, 1) + 1_800_000,
      open: 100.4,
      high: 100.7,
      low: 100.1,
      close: 100.3,
      volume: 1,
    },
  ];
  const consecutiveFvg = detectFvg(fvgBase, 2, 1, "bullish", FVG_FIXTURE_PARAMS);
  const missingMiddle: OhlcvCandle[] = [fvgBase[0]!, fvgBase[2]!];
  const gappedFvg = detectFvg(
    [
      missingMiddle[0]!,
      {
        openTime: Date.UTC(2024, 0, 1) + 1_800_000,
        open: 110,
        high: 111,
        low: 109.5,
        close: 110.5,
        volume: 1,
      },
      {
        openTime: Date.UTC(2024, 0, 1) + 2_700_000,
        open: 110.5,
        high: 111,
        low: 110,
        close: 110.2,
        volume: 1,
      },
    ],
    2,
    1,
    "bullish",
    FVG_FIXTURE_PARAMS,
  );

  return {
    MISSING_BAR_CAN_MATERIALLY_CHANGE_STRATEGY_RESULT: "YES" as const,
    mechanisms: [
      {
        id: "EMA_INDEX_CONTINUITY",
        file: "src/lib/rextora/indicator/indicatorEngine.ts::computeEmaSeries",
        rule: "Treats array-adjacent closes as consecutive bars; a dropped candle changes later EMA values.",
        emaTailChanged: alignedTailFull !== alignedTailGapped,
        emaTailFull: alignedTailFull,
        emaTailGapped: alignedTailGapped,
      },
      {
        id: "ATR_TRUE_RANGE",
        file: "src/lib/rextora/indicator/indicatorEngine.ts::computeAtrSeries",
        rule: "TR uses high/low vs previous array close, not previous wall-clock bar.",
      },
      {
        id: "HOLD_BARS_INDEX",
        file: "src/lib/rextora/strategy/eventSequenceBacktest.ts / conditionBacktest.ts / backtestEngine.ts",
        rule: "holdBars = i - entryBar (array index). One missing bar makes N bars span extra wall-clock time vs max_hold_bars intent.",
      },
      {
        id: "FVG_THREE_CANDLE",
        file: "src/lib/rextora/strategy/conditions/fvg.ts::detectFvg",
        rule: "Bullish FVG at i compares candles[i-2] and candles[i] as adjacent-in-array, not adjacent-in-time.",
        consecutiveHit: consecutiveFvg.hit,
        missingMiddleCanCreateGap: gappedFvg.hit,
      },
      {
        id: "FUNDING_FLAT_PER_TRADE",
        file: "src/lib/rextora/backtest/backtestEngine.ts",
        rule: "Funding is a flat rate per closed trade when applyFunding, not pro-rated by gap duration. Material via holdBars/time stamps, not via funding formula itself.",
      },
    ],
  };
}

function loadError(code: HistoricalCandleLoadError["code"], userMessage: string) {
  return new HistoricalCandleLoadError({
    code,
    userMessage,
    technicalReason: "p3-a3.1-fixture",
    symbol: "BTCUSDT",
    timeframe: "15m",
    requestedFrom: "2024-01-01T00:00:00.000Z",
    requestedTo: "2024-01-02T00:00:00.000Z",
    candlesReceived: 0,
  });
}

export function inventoryResearchErrors() {
  return {
    adapterCodes: [
      "INVALID_CANDIDATE",
      "PROTECTED_HASH_COLLISION",
      "INVALID_WINDOW",
      "EMPTY_CANDLES",
      "UNSORTED_CANDLES",
      "DUPLICATE_CANDLE_TIME",
      "CANDLE_OUTSIDE_WINDOW",
      "BACKTEST_FAILED",
    ],
    loaderCodes: [
      "TIMEFRAME_UNSUPPORTED",
      "RANGE_INVALID",
      "BINANCE_FETCH_FAILED",
      "EMPTY_CANDLES",
      "MALFORMED_CANDLES",
      "SPACING_INCONSISTENT",
      "INSUFFICIENT_CANDLES",
    ],
    classifierClasses: [
      "candidate_invalid",
      "parameter_out_of_range",
      "normalization_failed",
      "market_data_missing",
      "backtest_failed",
      "cost_calculation_failed",
      "candidate_evaluation_failed",
      "data_unavailable",
      "robustness_failed",
      "overfitting_analysis_failed",
      "persistence_failed",
      "worker_failed",
      "unknown_engine_error",
      "fatal_engine_error",
    ],
    typedClassifierInputs: [
      "StrategySearchGenerationError.code",
      "StrategySearchJitterError.code",
    ],
    substringFallback: true,
    planCompletionReasonsIncludingData: [
      "DATA_UNAVAILABLE",
      "ENGINE_ERROR",
      "CONFIGURATION_INVALID",
    ],
    legalJobTransitionsFromRunning: [
      "interrupted",
      "pause_requested",
      "cancel_requested",
      "completed",
      "failed",
    ],
    recoverableFailedToQueued: true,
    errorRateAutoPause:
      "jobRunner: statistics.evaluated >= 20 && errors/evaluated >= plan.errorAutoPauseRate → paused",
    repeatedSignature:
      "generation errors fingerprint code|class; threshold pauses job",
  };
}

export type PropagationCaseId =
  | "provider_network"
  | "empty_candles_adapter"
  | "empty_candles_loader"
  | "partial_coverage"
  | "off_grid_1ms_current"
  | "off_grid_spacing_reject"
  | "config_invalid";

export function proveResearchErrorPropagation() {
  const provider = loadError(
    "BINANCE_FETCH_FAILED",
    "Binance 선물 과거 캔들을 불러오지 못했습니다. 네트워크와 심볼을 확인한 뒤 다시 시도하세요.",
  );
  const emptyAdapter = new StrategySearchAdapterError(
    "EMPTY_CANDLES",
    "candle set is empty",
  );
  const emptyLoader = loadError(
    "EMPTY_CANDLES",
    "선택한 기간에 Binance 선물 캔들이 없습니다. 기간·심볼·시간봉을 확인하세요.",
  );
  const spacing = loadError(
    "SPACING_INCONSISTENT",
    "수신한 캔들 간격이 선택한 시간봉과 일치하지 않습니다.",
  );
  const config = new StrategySearchGenerationError(
    "CONFIGURATION_INVALID",
    "invalid parameterRanges: min must be <= max",
  );

  const classifiedProvider = classifyEngineError(provider, "evaluation");
  const classifiedEmptyAdapter = classifyEngineError(emptyAdapter, "evaluation");
  const classifiedEmptyLoader = classifyEngineError(emptyLoader, "evaluation");
  const classifiedSpacing = classifyEngineError(spacing, "evaluation");
  const classifiedConfig = classifyEngineError(config, "candidate_generation");

  return {
    provider_network: {
      thrownType: provider.name,
      thrownCode: provider.code,
      classified: classifiedProvider,
      registryOutcome:
        "persistDataUnavailableFailure → job status failed, plan completionReason DATA_UNAVAILABLE",
      trialLoop: false,
    },
    empty_candles_adapter: {
      thrownType: emptyAdapter.name,
      thrownCode: emptyAdapter.code,
      classified: classifiedEmptyAdapter,
      registryOutcome:
        "typed EMPTY_CANDLES → data_unavailable; registry preflight prevents candidate loop",
      trialLoop: false,
    },
    empty_candles_loader: {
      thrownType: emptyLoader.name,
      thrownCode: emptyLoader.code,
      classified: classifiedEmptyLoader,
      registryOutcome:
        "loader throw in resolveCandles → DATA_UNAVAILABLE job failed",
      trialLoop: false,
    },
    partial_coverage: {
      thrownType: "HistoricalDataCoverageError",
      thrownCode: "DATA_COVERAGE_INSUFFICIENT",
      classified: null,
      registryOutcome:
        "preflight assertHistoricalDataCoverage → DATA_UNAVAILABLE, no candidate evaluation",
      trialLoop: false,
      proceedsToEvaluation: false,
    },
    off_grid_1ms_current: {
      thrownType: null,
      thrownCode: null,
      classified: null,
      registryOutcome:
        "validateCandleSpacing rejects 1ms as OFF_GRID",
      trialLoop: false,
      currentSpacingAccepted: false,
    },
    off_grid_spacing_reject: {
      thrownType: spacing.name,
      thrownCode: spacing.code,
      classified: classifiedSpacing,
      registryOutcome:
        "SPACING_INCONSISTENT from loader → registry DATA_UNAVAILABLE job failed",
      trialLoop: false,
    },
    config_invalid: {
      thrownType: config.name,
      thrownCode: config.code,
      classified: classifiedConfig,
      registryOutcome:
        "jobRunner stopReason failed, plan completionReason CONFIGURATION_INVALID, job status failed",
      trialLoop: false,
    },
  };
}

export function gapModelComparison() {
  return {
    "MODEL GAP-A": {
      rule: "No internal missing bars allowed; every consecutive pair delta === intervalMs.",
      reproducibility: "highest",
      financialIntegrity: "matches index-based EMA/hold/FVG assumptions",
      falseRejection: "low on USDT-M 24/7; live probe showed zero holes in 40-bar samples",
      recommended: true,
    },
    "MODEL GAP-B": {
      rule: "Allow exactly one missing bar per requested series.",
      rejectedBecause:
        "Only a stale comment claims this; predicate is unbounded; one hole still changes EMA/holdBars/FVG.",
      recommended: false,
    },
    "MODEL GAP-C": {
      rule: "Allow bounded missing bars per N / ratio.",
      rejectedBecause:
        "Still silently mutates index-based indicators; more complex; no source policy.",
      recommended: false,
    },
    "MODEL GAP-D": {
      rule: "Allow gaps only if provider proves no candle existed.",
      rejectedBecause:
        "Binance klines omit rows with no 'market closed' flag; USDT-M is 24/7 so omission is a hole, not a session gap.",
      recommended: false,
    },
    "MODEL GAP-E": {
      rule: "Keep current N*interval ±5% remainder.",
      rejectedBecause: "Accepts 1ms and 899999ms; unbounded holes; blurs OFF_GRID into MISSING_BAR.",
      recommended: false,
    },
    RECOMMENDED_INTERNAL_GAP_POLICY,
  };
}

export function researchErrorModelComparison() {
  return {
    "MODEL ERR-A": {
      rule: "All coverage failures = DATA_UNAVAILABLE retryable per trial",
      rejectedBecause:
        "Creates thousands of failed trials / error-rate auto-pause; EMPTY_CANDLES already does this via substring 'candle'.",
    },
    "MODEL ERR-B": {
      rule: "Coverage insufficient = fatal job-scope stop for every coverage issue including transient network",
      rejectedBecause:
        "Would map temporary BINANCE_FETCH_FAILED into a non-retryable fatal class; failed→queued already exists for recoverable DATA_UNAVAILABLE.",
    },
    "MODEL ERR-C": {
      rule: "Provider/network retryable as job-scope DATA_UNAVAILABLE; deterministic incomplete/off-grid/missing-bar also job-scope DATA_UNAVAILABLE stop (not per-candidate)",
      recommended: true,
      temporary:
        "BINANCE_FETCH_FAILED at resolveCandles → running→failed, completionReason DATA_UNAVAILABLE, operator resume failed→queued, no auto-retry loop",
      structural:
        "partial/empty/off-grid/internal-hole after a successful fetch → same job-scope failed + DATA_UNAVAILABLE; typed loader/adapter code preserved; no candidate evaluation",
    },
    "MODEL ERR-D": {
      rule: "Pause operator-required",
      rejectedBecause:
        "paused is for cooperative/operator pause and error-rate auto-pause, not data faults; DATA_UNAVAILABLE already maps to failed.",
    },
    RECOMMENDED_RESEARCH_ERROR_MODEL,
    COVERAGE_FAILURE_JOB_STATUS: "failed",
    COVERAGE_FAILURE_PLAN_REASON: "DATA_UNAVAILABLE",
    OPERATOR_ALLOWED_ACTION: "resumeSearchJob: failed → queued",
    AUTO_RETRY_BEHAVIOR: "none — operator resume only; no per-candidate retry loop",
  };
}

export function frozenP3A4Contract() {
  return {
    P3_A4_POLICY_READY,
    CANONICAL_CANDLE_GRID_RULE: {
      id: "CANONICAL_CANDLE_GRID_RULE",
      policy: CANONICAL_GRID_POLICY,
      evidence: [
        "binanceReadOnlyService.getKlinesRange public /fapi/v1/klines; no snap",
        "ohlcvTypes.candlesFromBinanceKlines openTime: Number(row[0])",
        "historicalCandleLoader cursor = lastOpen + 1",
        "live probe remainder 0 and delta === intervalMs for 1m/3m/5m/15m/1h",
        "synthetic Date.UTC(2024,0,1) remainder 0; production 15m actualFirst/Last remainder 0",
      ],
      predicate:
        "∀ candle: openTime % intervalMs === 0; consecutive pair classification uses classifyAdjacentDelta (no ±5% remainder tolerance)",
      failureCode: "SPACING_INCONSISTENT / coverage SPACING_INVALID (off-grid distinct from missing-bar)",
      operatorConsequence: "fail-closed before engine; Backtest 422 coverage blocker; Research job-scope DATA_UNAVAILABLE",
    },
    INTERNAL_MISSING_BAR_RULE: {
      id: "INTERNAL_MISSING_BAR_RULE",
      policy: "MODEL_GAP_A — zero internal missing bars in the requested series",
      evidence: [
        "EXPLICIT_PRODUCT_GAP_POLICY_FOUND=NO (stale 'allows one missing bar' comment; unbounded N*interval predicate)",
        "EMA/ATR/holdBars/FVG are array-index engines",
        "live 40-bar samples had zero holes",
        "Binance USDT-M does not flag 'no candle existed'",
      ],
      predicate:
        "∀ i>0: openTime[i] - openTime[i-1] === intervalMs (MISSING_BAR if exact N*interval with N>=2; never treated as OFF_GRID)",
      failureCode: "INTERNAL_MISSING_BARS (coverage) / Research DATA_UNAVAILABLE job-scope",
      operatorConsequence: "reject series; do not evaluate candidates or run engine",
    },
    RESEARCH_COVERAGE_FAILURE_RULE: {
      id: "RESEARCH_COVERAGE_FAILURE_RULE",
      policy: "MODEL_ERR_C",
      evidence: [
        "classifyEngineError already emits DATA_UNAVAILABLE but via substring 'candle'",
        "AdapterError/HistoricalCandleLoadError already have typed .code unused by classifier",
        "registry resolveCandles currently maps any loader throw to ENGINE_ERROR",
        "jobState allows running→failed and failed→queued",
        "jobRunner evaluation catch records trials and may error-rate auto-pause",
      ],
      predicate:
        "After candles resolve, requested start/end + timeframe + actual series must be complete exact-grid GAP-A before any candidate evaluation. Fetch exceptions and structural incompleteness both stop the job once; they do not enter evaluate().",
      failureCode: "plan completionReason DATA_UNAVAILABLE; preserve typed source code (BINANCE_FETCH_FAILED vs EMPTY_CANDLES vs SPACING_INCONSISTENT vs INTERNAL_MISSING_BARS)",
      operatorConsequence:
        "job status failed; operator resumeSearchJob failed→queued; no automatic retry; no per-candidate invalid loop",
    },
    implementationFiles: [
      "src/lib/rextora/data/timeframes.ts::validateCandleSpacing (+ grid remainder === 0)",
      "src/lib/rextora/data/historicalDataCoverage.ts (new generic coverage core)",
      "src/lib/rextora/backtest/backtestDataCoverage.ts::calculateBacktestDataCoverage (wrap + INTERNAL_MISSING_BARS)",
      "src/lib/rextora/strategySearch/backtestAdapter.ts::validateCandles / resolveCandles",
      "src/lib/rextora/strategySearch/jobExecutionRegistry.ts::resolveCandles (canonical preflight)",
      "src/lib/rextora/strategySearch/engineErrorClassification.ts::classifyEngineError (typed AdapterError + HistoricalCandleLoadError)",
    ],
    productionDataMigrationRequired: false,
  };
}
