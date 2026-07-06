import { NextResponse } from "next/server";
import { stopExecution } from "@/src/lib/rextora/executionEngine";
import type { TradingMode } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode ?? "PAPER") as TradingMode;
  return NextResponse.json(await stopExecution(mode));
}
