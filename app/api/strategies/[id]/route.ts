import { NextResponse } from "next/server";
import { evaluateLiveSafetyGate } from "@/src/lib/rextora/liveSafetyGate";
import { getStrategyById, validateSafeStrategyHash } from "@/src/lib/rextora/strategyRepository";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  const { id } = await params;
  const strategy = getStrategyById(id);

  if (!strategy) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }

  const gate = evaluateLiveSafetyGate({ readinessOnly: true });

  return NextResponse.json({
    strategy,
    hash: validateSafeStrategyHash(),
    liveBlockReasons: gate.blockedReasons
  });
}
