import { NextResponse } from "next/server";
import { getProviderConfig } from "@/src/lib/rextora/agent/providerConfig";
import { runProviderHealthChecks } from "@/src/lib/rextora/agent/agentLLM";

/** GET /api/rextora/agent/health — Provider connectivity check. Never exposes key values. */
export async function GET() {
  const config = getProviderConfig();

  const checks = await runProviderHealthChecks();

  return NextResponse.json({
    activeProvider: config.provider,
    openaiConfigured: config.openaiConfigured,
    geminiConfigured: config.geminiConfigured,
    checks,
    checkedAt: new Date().toISOString(),
  });
}
