import { NextResponse } from "next/server";
import { getMarketTicker } from "@/src/lib/rextora/binanceReadOnlyService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(await getMarketTicker(searchParams.get("symbol") ?? "BTCUSDT"));
}
