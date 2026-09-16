import { NextResponse } from "next/server";
import { getKlines } from "@/src/lib/rextora/binanceReadOnlyService";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  return NextResponse.json(await getKlines(
    searchParams.get("symbol") ?? "BTCUSDT",
    searchParams.get("interval") ?? "1h",
    Number(searchParams.get("limit") ?? 100)
  ));
}
