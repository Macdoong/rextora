import { NextResponse } from "next/server";
import { getBacktestValidation } from "@/src/lib/rextora/backtestEngine";

export function GET() {
  return NextResponse.json({ validation: getBacktestValidation(), data_source: "seeded_from_preserved_snapshot" });
}
