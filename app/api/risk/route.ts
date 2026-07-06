import { NextResponse } from "next/server";
import { getRiskStatus, updateRiskSettings } from "@/src/lib/rextora/riskManager";

export function GET() {
  return NextResponse.json({ risk: getRiskStatus() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  return NextResponse.json({ risk: updateRiskSettings(body.settings ?? {}) });
}
