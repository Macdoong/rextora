import { NextResponse } from "next/server";
import { getApiStatus } from "@/src/lib/rextora/apiStatusService";
import { generateAiBriefing } from "@/src/lib/rextora/aiBriefingService";
import { getAlertHistory, getAlertRules } from "@/src/lib/rextora/alertRuleEngine";
import { dashboardDataSeed } from "@/src/lib/rextora/seedData";
import { getStrategies } from "@/src/lib/rextora/strategyRepository";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  return NextResponse.json({
    ...dashboardDataSeed,
    api: getApiStatus(),
    strategies: getStrategies(),
    alertRules: getAlertRules(),
    alertHistory: getAlertHistory(),
    briefing: generateAiBriefing()
  });
}
