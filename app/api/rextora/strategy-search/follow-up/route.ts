import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import {
  buildFollowUpResearch,
  FollowUpResearchError,
  type FollowUpSource,
} from "@/src/lib/rextora/strategySearch/followUpResearch";
import { StrategySearchApiError } from "@/src/lib/rextora/strategySearch/jobApiService";
import { requirePermission } from "@/src/lib/rextora/auth/requireUser";
import { canReadStoredStrategy } from "@/src/lib/rextora/auth/searchResourceAccess";
import { getStrategyById } from "@/src/lib/rextora/strategy/strategyStore";
import { NextResponse } from "next/server";

/**
 * POST /api/rextora/strategy-search/follow-up
 * Returns a suggested create-job body + researchBasis metadata.
 * Does NOT create/start a job and does NOT touch SAFE.
 */
export async function POST(request: Request) {
  const auth = requirePermission(request, "research:run");
  if (!auth.ok) return auth.response;
  const start = Date.now();
  try {
    const body = (await request.json().catch(() => null)) as {
      source?: FollowUpSource;
      strategyId?: string;
      notes?: string;
      paperRealizedPnl?: number | null;
      paperUnrealizedPnl?: number | null;
      paperTradeCount?: number | null;
      strategyName?: string;
    } | null;

    if (!body || typeof body !== "object") {
      throw new FollowUpResearchError("JSON body required", "INVALID_REQUEST");
    }

    if (body.strategyId) {
      let strategy;
      try {
        strategy = getStrategyById(body.strategyId);
      } catch {
        strategy = null;
      }
      if (!strategy || !canReadStoredStrategy(auth.user, strategy)) {
        return NextResponse.json(
          { ok: false, error: "전략을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
    }

    const result = buildFollowUpResearch({
      source: body.source as FollowUpSource,
      strategyId: body.strategyId,
      notes: body.notes,
      paperRealizedPnl: body.paperRealizedPnl,
      paperUnrealizedPnl: body.paperUnrealizedPnl,
      paperTradeCount: body.paperTradeCount,
      strategyName: body.strategyName,
    });

    return strategySearchJson(result, Date.now() - start);
  } catch (err) {
    if (err instanceof FollowUpResearchError) {
      const code =
        err.code === "SAFE_MUTATION_BLOCKED"
          ? "PROTECTED_STRATEGY_VIOLATION"
          : "INVALID_REQUEST";
      return strategySearchError(
        new StrategySearchApiError(code, err.message, err.httpStatus),
        Date.now() - start,
      );
    }
    return strategySearchError(err, Date.now() - start);
  }
}
