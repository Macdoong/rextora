import { NextResponse } from "next/server";
import { createAlertRule, getAlertRules } from "@/src/lib/rextora/alertRuleEngine";

export function GET() {
  return NextResponse.json({ rules: getAlertRules() });
}

export async function POST(request: Request) {
  const body = await request.json();

  return NextResponse.json({ rule: createAlertRule(body) });
}
