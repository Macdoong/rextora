import { NextResponse } from "next/server";
import { cancelAllOrders } from "@/src/lib/rextora/orderManager";
import type { TradingMode } from "@/lib/types";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "live:emergency_stop");
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(await cancelAllOrders((body.mode ?? "PAPER") as TradingMode));
}
