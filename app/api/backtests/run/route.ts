import { NextResponse } from "next/server";
import { runBacktest } from "@/src/lib/rextora/backtestEngine";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await runBacktest(body.strategyId);

  return NextResponse.json(result);
}
