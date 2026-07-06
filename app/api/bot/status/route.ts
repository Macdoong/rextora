import { NextResponse } from "next/server";
import { getPaperBotStatus } from "@/src/lib/rextora/paperTradingEngine";

export function GET() {
  return NextResponse.json({ bot: getPaperBotStatus(), defaultMode: "PAPER" });
}
