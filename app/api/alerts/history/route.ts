import { NextResponse } from "next/server";
import { generateAiBriefing } from "@/src/lib/rextora/aiBriefingService";
import { evaluateMockAlertConditions, getAlertHistory } from "@/src/lib/rextora/alertRuleEngine";
import { denyUnlessPermitted, denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  return NextResponse.json({ alerts: getAlertHistory(), briefing: generateAiBriefing() });
}

export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "settings:write");
  if (denied) return denied;
  return NextResponse.json({ alerts: evaluateMockAlertConditions() });
}
