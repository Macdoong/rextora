import { NextResponse } from "next/server";
import { runAndSaveBacktest, runConfiguredBacktest } from "@/src/lib/rextora/backtest/backtestRunner";
import { listSavedBacktests } from "@/src/lib/rextora/backtest/backtestStore";
import { ensureStrategyStore } from "@/src/lib/rextora/strategy/strategyStore";
import type { BacktestConfig } from "@/src/lib/rextora/backtest/backtestTypes";

export async function GET() {
  return NextResponse.json({ ok: true, data: listSavedBacktests(30) });
}

export async function POST(request: Request) {
  ensureStrategyStore();
  const body = (await request.json()) as Partial<BacktestConfig> & { save?: boolean; action?: string };
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
    costStressMultipliers: body.costStressMultipliers?.length ? body.costStressMultipliers : [1, 1.5, 2],
    costGuardK: body.costGuardK ?? 3,
    baseBalPct: body.baseBalPct,
    maxConcurrent: body.maxConcurrent
  };

  // Hard guarantee: never place live orders from backtest path.
  if (body.action === "live_order") {
    return NextResponse.json({ ok: false, error: "backtest cannot place live orders" }, { status: 400 });
  }

  const result = body.save ? runAndSaveBacktest(config) : runConfiguredBacktest(config);
  return NextResponse.json({
    ok: true,
    data: {
      report: result.report,
      trades: result.trades.slice(0, 200),
      equityCurve: result.equityCurve.slice(-200),
      saved: "saved" in result ? result.saved : null,
      note: "No live orders are placed by backtest."
    }
  });
}
