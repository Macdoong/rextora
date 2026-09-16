import { NextResponse } from "next/server";
import { getPaperBotStatus } from "@/src/lib/rextora/paperTradingEngine";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  return NextResponse.json({ bot: getPaperBotStatus(), defaultMode: "PAPER" });
}
