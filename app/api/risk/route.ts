import { NextResponse } from "next/server";
import { getRiskStatus, updateRiskSettings } from "@/src/lib/rextora/riskManager";
import { denyUnlessPermitted, denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  return NextResponse.json({ risk: getRiskStatus() });
}

export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "risk:write");
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));

  return NextResponse.json({ risk: updateRiskSettings(body.settings ?? {}) });
}
