import { NextResponse } from "next/server";
import { getFuturesAccountBalanceReadOnly } from "@/src/lib/rextora/binanceReadOnlyService";

export async function GET() {
  return NextResponse.json(await getFuturesAccountBalanceReadOnly());
}
