import { NextResponse } from "next/server";
import { restartPaperBot } from "@/src/lib/rextora/paperTradingEngine";

export async function POST() {
  return NextResponse.json(await restartPaperBot());
}
