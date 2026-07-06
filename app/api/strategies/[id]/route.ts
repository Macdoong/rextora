import { NextResponse } from "next/server";
import { evaluateLiveSafetyGate } from "@/src/lib/rextora/liveSafetyGate";
import { getStrategyById, validateSafeStrategyHash } from "@/src/lib/rextora/strategyRepository";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
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
