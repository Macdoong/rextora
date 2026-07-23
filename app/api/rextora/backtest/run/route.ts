import { NextResponse } from "next/server";
import {
  BacktestPipelineError,
  runAndSaveBacktest,
  runConfiguredBacktest,
} from "@/src/lib/rextora/backtest/backtestRunner";
import { listSavedBacktests } from "@/src/lib/rextora/backtest/backtestStore";
import { ensureStrategyStore } from "@/src/lib/rextora/strategy/strategyStore";
import type { BacktestConfig } from "@/src/lib/rextora/backtest/backtestTypes";
import { HistoricalCandleLoadError } from "@/src/lib/rextora/data/historicalCandleLoader";

export async function GET() {
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

    const config: BacktestConfig = {
      strategyId: body.strategyId ?? "SAFE_v44_i4060",
      symbols: body.symbols?.length ? body.symbols : ["BTCUSDT"],
      timeframe: body.timeframe ?? "15m",
      fromOpenTime: body.fromOpenTime,
      toOpenTime: body.toOpenTime,
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
