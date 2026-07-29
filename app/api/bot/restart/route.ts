import { NextResponse } from "next/server";
import { restartPaperBotGuarded } from "@/src/lib/rextora/paper/paperSessionService";

/**
 * Legacy bot restart — gated by authoritative active Paper session.
 * Commercial Paper UI must use /api/rextora/paper/session lifecycle instead.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    strategyId?: string | null;
  };
  const result = await restartPaperBotGuarded({
    strategyId: body.strategyId ?? null,
  });
  const status = result.ok ? 200 : 403;
  return NextResponse.json(result, { status });
}
