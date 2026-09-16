import { NextResponse } from "next/server";
import { getBacktestValidation } from "@/src/lib/rextora/backtestEngine";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  return NextResponse.json({ validation: getBacktestValidation(), data_source: "seeded_from_preserved_snapshot" });
}
