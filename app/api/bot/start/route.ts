import { NextResponse } from "next/server";
import { startExecution } from "@/src/lib/rextora/executionEngine";
import { runBacktest } from "@/src/lib/rextora/backtestEngine";
import type { TradingMode } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode ?? "PAPER") as TradingMode;

  if (mode === "BACKTEST") return NextResponse.json(await runBacktest(body.strategyId));
  const result = await startExecution(mode);
  if (mode === "LIVE" && !result.ok) {
    return NextResponse.json(result, { status: 403 });
  }
  return NextResponse.json(result);
}
