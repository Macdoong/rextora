import { NextResponse } from "next/server";
import { getStrategies } from "@/src/lib/rextora/strategyRepository";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  return NextResponse.json({ strategies: getStrategies(), serviceState: "mixed: snapshot/live-blocked" });
}
