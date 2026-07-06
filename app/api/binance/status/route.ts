import { NextResponse } from "next/server";
import { getReadOnlyHealth } from "@/src/lib/rextora/binanceReadOnlyService";

export async function GET() {
  return NextResponse.json(await getReadOnlyHealth());
}
