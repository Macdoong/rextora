import { NextResponse } from "next/server";
import { blockUnverifiedStrategies, generateRandomStrategies, rankStrategies } from "@/src/lib/rextora/strategyDiscoveryEngine";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "strategy:write");
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const candidates = blockUnverifiedStrategies(rankStrategies(generateRandomStrategies(body.count ?? 20)));

  return NextResponse.json({
    ok: true,
    serviceState: "simulated",
    message: "Random Search 후보를 모의 생성했습니다. 생성 후보는 탐색 중이며 LIVE 차단 상태입니다.",
    symbol: body.symbol ?? "BTCUSDT",
    timeframe: body.timeframe ?? "1H",
    candidates
  });
}
