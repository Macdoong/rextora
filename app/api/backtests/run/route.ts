import { NextResponse } from "next/server";
import { runBacktest } from "@/src/lib/rextora/backtestEngine";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "backtest:run");
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const result = await runBacktest(body.strategyId);

  return NextResponse.json(result);
}
