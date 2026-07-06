import { NextResponse } from "next/server";
import { generateAiBriefing } from "@/src/lib/rextora/aiBriefingService";
import { evaluateMockAlertConditions, getAlertHistory } from "@/src/lib/rextora/alertRuleEngine";

export function GET() {
  return NextResponse.json({ alerts: getAlertHistory(), briefing: generateAiBriefing() });
}

export function POST() {
  return NextResponse.json({ alerts: evaluateMockAlertConditions() });
}
