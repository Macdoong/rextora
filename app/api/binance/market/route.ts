import { NextResponse } from "next/server";
import { getMarketTicker } from "@/src/lib/rextora/binanceReadOnlyService";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  return NextResponse.json(await getMarketTicker(searchParams.get("symbol") ?? "BTCUSDT"));
}
