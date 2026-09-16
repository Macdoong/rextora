import { NextResponse } from "next/server";
import { createAlertRule, getAlertRules } from "@/src/lib/rextora/alertRuleEngine";
import { denyUnlessPermitted, denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  return NextResponse.json({ rules: getAlertRules() });
}

export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "settings:write");
  if (denied) return denied;
  const body = await request.json();

  return NextResponse.json({ rule: createAlertRule(body) });
}
