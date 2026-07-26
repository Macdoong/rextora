import {
  promoteSelectedTrialsFromJob,
  promoteSearchCandidateToStrategy,
} from "@/src/lib/rextora/strategySearch/promoteFromSearch";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import {
  promoteTopResearchResults,
  registerTrialForBacktest,
} from "@/src/lib/rextora/strategySearch/researchResultsSummary";
import { StrategySearchApiError } from "@/src/lib/rextora/strategySearch/jobApiService";

type Ctx = { params: Promise<{ jobId: string }> };

/**
 * POST /api/rextora/strategy-search/[jobId]/promote
 * Explicit registration only.
 * - { iteration } | { iterations[] } for specific trials
 * - { mode: "top", limit? } for bounded top representatives (max 20)
 * - { mode: "register_for_backtest", iteration } → register then return Backtest href
 * Never auto-registers all qualified trials.
 */
export async function POST(request: Request, context: Ctx) {
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    let body: {
      iteration?: number;
      iterations?: number[];
      name?: string;
      mode?: "top" | "register_for_backtest";
      limit?: number;
      clusterId?: string;
    } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }

    if (body.mode === "top") {
      const data = promoteTopResearchResults(jobId, {
        limit: body.limit,
      });
      return strategySearchJson(
        {
          mode: "top",
          promoted: data.promoted,
          counts: data.summary.counts,
        },
        Date.now() - start,
      );
    }

    if (body.mode === "register_for_backtest") {
      if (body.iteration == null || !Number.isInteger(body.iteration)) {
        throw new StrategySearchApiError(
          "INVALID_REQUEST",
          "iteration is required for register_for_backtest",
          400,
        );
      }
      const data = registerTrialForBacktest(jobId, body.iteration);
      return strategySearchJson(
        {
          mode: "register_for_backtest",
          ...data.result,
          clusterId: data.clusterId,
          backtestHref: data.backtestHref,
          counts: data.summary.counts,
          reused: data.result.alreadyExists === true,
          messageKo: data.result.alreadyExists
            ? "이미 등록된 전략을 사용합니다."
            : "전략 라이브러리에 등록했습니다.",
        },
        Date.now() - start,
      );
    }

    if (Array.isArray(body.iterations) && body.iterations.length > 0) {
      const data = promoteSelectedTrialsFromJob(jobId, body.iterations);
      return strategySearchJson({ promoted: data }, Date.now() - start);
    }

    if (body.iteration == null || !Number.isInteger(body.iteration)) {
      throw new StrategySearchApiError(
        "INVALID_REQUEST",
        "iteration, iterations[], mode=top, or mode=register_for_backtest is required",
        400,
      );
    }

    const data = promoteSearchCandidateToStrategy({
      jobId,
      iteration: body.iteration,
      name: body.name,
      clusterId: body.clusterId,
    });
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
