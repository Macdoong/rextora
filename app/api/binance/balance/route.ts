import { NextResponse } from "next/server";
import { getFuturesAccountBalanceReadOnly } from "@/src/lib/rextora/binanceReadOnlyService";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  return NextResponse.json(await getFuturesAccountBalanceReadOnly());
}
