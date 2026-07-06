import { NextResponse } from "next/server";
import { getStrategies } from "@/src/lib/rextora/strategyRepository";

export function GET() {
  return NextResponse.json({ strategies: getStrategies(), serviceState: "mixed: snapshot/live-blocked" });
}
