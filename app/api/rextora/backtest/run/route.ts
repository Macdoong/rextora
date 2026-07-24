import { NextResponse } from "next/server";
import {
  BacktestPipelineError,
  runAndSaveBacktest,
  runConfiguredBacktest,
} from "@/src/lib/rextora/backtest/backtestRunner";
import {
  getSavedBacktest,
  listSavedBacktests,
  listSavedBacktestsForStrategy,
} from "@/src/lib/rextora/backtest/backtestStore";
import {
  ensureStrategyStore,
  getStrategyById,
} from "@/src/lib/rextora/strategy/strategyStore";
import type { BacktestConfig } from "@/src/lib/rextora/backtest/backtestTypes";
import {
  HistoricalCandleLoadError,
  loadHistoricalCandles,
} from "@/src/lib/rextora/data/historicalCandleLoader";
import { probeAvailableCandleDateRange } from "@/src/lib/rextora/backtest/availableCandleRange";
import { resolveEffectiveEndFromOpenTime } from "@/src/lib/rextora/backtest/backtestDateRange";
import { resolveChartEvidence } from "@/src/lib/rextora/backtest/chartEvidenceStore";
import {
  configuredBacktestSymbols,
  isSymbolAllowedForStrategy,
  resolveStrategySymbolCompatibility,
} from "@/src/lib/rextora/backtest/strategySymbolCompatibility";
import type { StoredStrategyV1 } from "@/src/lib/rextora/strategy/definition/bridge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const strategyId = searchParams.get("strategyId");
  const runId = searchParams.get("runId") ?? searchParams.get("id");
  const dataRange = searchParams.get("dataRange");
  const hydrateChart =
    searchParams.get("hydrateChart") === "1" ||
    searchParams.get("hydrateChart") === "true";
  if (dataRange === "1" || dataRange === "true") {
    const symbol = (searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
    const timeframe = searchParams.get("timeframe") ?? "15m";
    const range = await probeAvailableCandleDateRange(symbol, timeframe);
    if (!range) {
      return NextResponse.json(
        {
          ok: false,
          error: "사용 가능한 캔들 기간을 조회하지 못했습니다.",
          code: "DATA_RANGE_UNAVAILABLE",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, data: range });
  }
  if (runId) {
    const one = getSavedBacktest(runId);
    if (!one) {
      return NextResponse.json(
        { ok: false, error: "저장된 백테스트 실행을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    if (!hydrateChart) {
      return NextResponse.json({ ok: true, data: one });
    }
    // Prefer persisted sidecar evidence (own path or chartEvidenceRef).
    // Never re-executes strategy or places orders.
    const evidence = resolveChartEvidence({
      runId,
      chartEvidenceRef: one.chartEvidenceRef,
    });
    if (evidence && evidence.candles.length > 0) {
      return NextResponse.json({
        ok: true,
        data: {
          run: one,
          chartCandles: evidence.candles,
          equityCurve: evidence.equityCurve,
          drawdownCurve: evidence.drawdownCurve,
          chartSamplingApplied: evidence.chartSamplingApplied,
          processedCandleCount: evidence.processedCandleCount,
          chartSource: "persisted" as const,
          reproducibilityGuaranteed: true,
        },
      });
    }
    // Legacy runs: best-effort remote hydrate (not guaranteed identical).
    try {
      const symbol = (one.config.symbols?.[0] ?? one.report.symbol ?? "BTCUSDT").toUpperCase();
      const fromOpenTime =
        one.config.fromOpenTime ??
        (one.report.actualFirstCandleTime
          ? Date.parse(one.report.actualFirstCandleTime)
          : one.report.fromDate
            ? Date.parse(`${one.report.fromDate}T00:00:00.000Z`)
            : NaN);
      const toOpenTime =
        one.config.toOpenTime ??
        (one.report.actualLastCandleTime
          ? Date.parse(one.report.actualLastCandleTime)
          : one.report.toDate
            ? Date.parse(`${one.report.toDate}T23:59:59.999Z`)
            : NaN);
      if (!Number.isFinite(fromOpenTime) || !Number.isFinite(toOpenTime)) {
        return NextResponse.json(
          {
            ok: false,
            error: "저장된 실행에 차트 복원에 필요한 기간이 없습니다.",
            code: "CHART_HYDRATE_RANGE_MISSING",
            data: {
              run: one,
              chartCandles: [],
              equityCurve: [],
              chartSamplingApplied: false,
              processedCandleCount: 0,
              chartSource: "legacy_remote_hydrate" as const,
              reproducibilityGuaranteed: false,
            },
          },
          { status: 422 },
        );
      }
      const loaded = await loadHistoricalCandles({
        symbol,
        timeframe: one.config.timeframe,
        fromOpenTime,
        toOpenTime,
      });
      return NextResponse.json({
        ok: true,
        data: {
          run: one,
          chartCandles: loaded.candles,
          equityCurve: [],
          chartSamplingApplied: false,
          processedCandleCount: loaded.candles.length,
          chartSource: "legacy_remote_hydrate" as const,
          reproducibilityGuaranteed: false,
          reproducibilityWarningKo:
            "이 실행에는 저장된 차트 증거가 없어 원격 데이터로 복원했습니다. 캔들·자산곡선이 당시와 완전히 같지 않을 수 있습니다.",
        },
      });
    } catch (error) {
      const message =
        error instanceof HistoricalCandleLoadError
          ? error.userMessage
          : error instanceof Error
            ? error.message
            : "차트 캔들을 불러오지 못했습니다.";
      return NextResponse.json(
        {
          ok: false,
          error: message,
          code: "CHART_HYDRATE_FAILED",
          data: {
            run: one,
            chartCandles: [],
            equityCurve: [],
            chartSamplingApplied: false,
            processedCandleCount: 0,
            chartSource: "legacy_remote_hydrate" as const,
            reproducibilityGuaranteed: false,
          },
        },
        { status: 502 },
      );
    }
  }
  if (strategyId) {
    const symbolFilter = searchParams.get("symbol");
    const allSymbols = searchParams.get("allSymbols") === "1";
    return NextResponse.json({
      ok: true,
      data: listSavedBacktestsForStrategy(strategyId, 40, {
        symbol: allSymbols ? null : symbolFilter,
      }),
    });
  }
  return NextResponse.json({ ok: true, data: listSavedBacktests(30) });
}

/** Cap equity points for chart payload; preserve first + last. Trades are never truncated. */
function sampleEquityCurve(equity: number[], limit = 800): number[] {
  if (equity.length <= limit) return equity;
  const step = Math.ceil(equity.length / limit);
  const sampled: number[] = [];
  for (let i = 0; i < equity.length; i += step) {
    sampled.push(equity[i]);
  }
  const last = equity[equity.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

function serializeSymbolResult(
  r: Awaited<ReturnType<typeof runConfiguredBacktest>>["symbolResults"][number],
) {
  return {
    symbol: r.symbol,
    status: r.status,
    error: r.error ?? null,
    report: r.report,
    /** Full canonical ledger — do not slice; timeline/coverage need every trade. */
    trades: r.trades,
    tradesReturned: r.trades.length,
    equityCurve: sampleEquityCurve(r.equityCurve),
    candles: r.chartCandles,
    chartCandles: r.chartCandles,
    chartSamplingApplied: r.chartSamplingApplied,
    processedCandleCount: r.processedCandleCount,
  };
}

export async function POST(request: Request) {
  const started = Date.now();
  ensureStrategyStore();
  try {
    const body = (await request.json()) as Partial<BacktestConfig> & {
      save?: boolean;
      action?: string;
      dataMode?: string;
      strategyHash?: string;
    };

    if (body.action === "live_order") {
      return NextResponse.json(
        {
          ok: false,
          error: "backtest cannot place live orders",
          code: "LIVE_ORDER_BLOCKED",
        },
        { status: 400 },
      );
    }

    if (!body.strategyId?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "strategyId가 필요합니다. SAFE로 자동 대체하지 않습니다.",
          code: "STRATEGY_ID_REQUIRED",
        },
        { status: 400 },
      );
    }

    let strategy;
    try {
      strategy = getStrategyById(body.strategyId);
    } catch {
      strategy = null;
    }
    if (!strategy) {
      return NextResponse.json(
        { ok: false, error: "전략을 찾을 수 없습니다.", code: "STRATEGY_NOT_FOUND" },
        { status: 404 },
      );
    }
    if (
      body.strategyHash &&
      strategy.paramsHash &&
      body.strategyHash !== strategy.paramsHash
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "전략 해시가 저장된 전략과 일치하지 않습니다.",
          code: "STRATEGY_HASH_MISMATCH",
        },
        { status: 400 },
      );
    }
    const nowMs = Date.now();
    let effectiveToOpenTime = body.toOpenTime;
    if (body.toOpenTime != null) {
      const end = resolveEffectiveEndFromOpenTime(body.toOpenTime, nowMs);
      if (!end.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: end.error,
            code: end.code,
          },
          { status: 400 },
        );
      }
      effectiveToOpenTime = end.endOpenTime;
    }
    if (
      body.fromOpenTime != null &&
      effectiveToOpenTime != null &&
      body.fromOpenTime >= effectiveToOpenTime
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "시작일은 종료일보다 이전이어야 합니다.",
          code: "INVALID_DATE_RANGE",
        },
        { status: 400 },
      );
    }

    const config: BacktestConfig = {
      strategyId: body.strategyId,
      symbols: body.symbols?.length ? body.symbols : ["BTCUSDT"],
      timeframe:
        body.timeframe ??
        (strategy.timeframe !== "unknown" ? strategy.timeframe : "15m"),
      fromOpenTime: body.fromOpenTime,
      toOpenTime: effectiveToOpenTime,
      balance: body.balance ?? 10_000,
      feeRate: body.feeRate ?? 0.0004,
      slippageRate: body.slippageRate ?? 0.0002,
      fundingRate: body.fundingRate ?? 0.0001,
      applyFunding: body.applyFunding ?? false,
      applySpread: body.applySpread ?? false,
      spreadRate: body.spreadRate ?? 0.0001,
      costStressMultipliers: body.costStressMultipliers?.length
        ? body.costStressMultipliers
        : [1, 1.5, 2],
      costGuardK: body.costGuardK ?? 3,
      baseBalPct: body.baseBalPct,
      maxConcurrent: body.maxConcurrent,
      dataMode: "binance",
    };

    const provider = configuredBacktestSymbols();
    const requestedSymbols = config.symbols.map((s) => s.toUpperCase());
    for (const sym of requestedSymbols) {
      if (!provider.includes(sym)) {
        return NextResponse.json(
          {
            ok: false,
            error: `${sym}은(는) 설정된 마켓 데이터에서 지원하지 않습니다.`,
            code: "SYMBOL_UNSUPPORTED",
          },
          { status: 400 },
        );
      }
      if (
        !isSymbolAllowedForStrategy(
          strategy as StoredStrategyV1,
          sym,
          provider,
        )
      ) {
        const compat = resolveStrategySymbolCompatibility(
          strategy as StoredStrategyV1,
          provider,
        );
        return NextResponse.json(
          {
            ok: false,
            error:
              compat.reasonKo ??
              `${sym}은(는) 이 전략에서 사용할 수 없습니다.`,
            code: "SYMBOL_STRATEGY_INCOMPATIBLE",
          },
          { status: 400 },
        );
      }
    }
    config.symbols = requestedSymbols;

    const result = body.save
      ? await runAndSaveBacktest(config)
      : await runConfiguredBacktest(config);

    return NextResponse.json({
      ok: true,
      data: {
        report: result.report,
        /** Full canonical ledger — never truncated (fixes May timeline cutoff). */
        trades: result.trades,
        tradesReturned: result.trades.length,
        equityCurve: sampleEquityCurve(result.equityCurve),
        candles: result.chartCandles,
        processedCandleCount: result.processedCandleCount,
        chartSamplingApplied: result.chartSamplingApplied,
        chartCandles: result.chartCandles,
        symbolResults: result.symbolResults.map(serializeSymbolResult),
        combinedReport: result.combinedReport,
        requestedSymbols: result.requestedSymbols,
        successSymbols: result.successSymbols,
        failedSymbols: result.failedSymbols,
        saved: "saved" in result ? result.saved : null,
        note: "No live orders are placed by backtest.",
        dataSource: result.report.dataSource,
      },
      meta: {
        source: result.report.dataSource,
        durationMs: Date.now() - started,
        cached: false,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (
      error instanceof BacktestPipelineError ||
      error instanceof HistoricalCandleLoadError
    ) {
      const payload =
        error instanceof BacktestPipelineError
          ? error.toJSON()
          : error.toJSON();
      return NextResponse.json(
        {
          ok: false,
          error: error.userMessage,
          code: error.code,
          details: payload,
          data: null,
          meta: {
            source: "rextora",
            durationMs: Date.now() - started,
            cached: false,
            updatedAt: new Date().toISOString(),
          },
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "백테스트를 실행하지 못했습니다.",
        code: "ENGINE_FAILURE",
        data: null,
        meta: {
          source: "rextora",
          durationMs: Date.now() - started,
          cached: false,
          updatedAt: new Date().toISOString(),
        },
      },
      { status: 500 },
    );
  }
}
