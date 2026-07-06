import { NextResponse } from "next/server";
import { cancelAllOrders } from "@/src/lib/rextora/orderManager";
import type { TradingMode } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(await cancelAllOrders((body.mode ?? "PAPER") as TradingMode));
}
