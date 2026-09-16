import { NextResponse } from "next/server";
import { stopExecution } from "@/src/lib/rextora/executionEngine";
import type { TradingMode } from "@/lib/types";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "live:emergency_stop");
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode ?? "PAPER") as TradingMode;
  return NextResponse.json(await stopExecution(mode));
}
