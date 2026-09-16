import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { buildResearchResultsSummary } from "@/src/lib/rextora/strategySearch/researchResultsSummary";
import { StrategySearchApiError } from "@/src/lib/rextora/strategySearch/jobApiService";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

type Ctx = { params: Promise<{ jobId: string }> };

/**
 * GET /api/rextora/strategy-search/[jobId]/results-summary
 * Canonical counts + clusters + bounded recommendations from persisted trials.
 */
export async function GET(_request: Request, context: Ctx) {
  const denied = await denyUnlessAuthenticated(_request);
  if (denied) return denied;

  const start = Date.now();
  try {
    const { jobId } = await context.params;
    try {
      const data = buildResearchResultsSummary(jobId);
      return strategySearchJson(data, Date.now() - start);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        throw new StrategySearchApiError("JOB_NOT_FOUND", err.message, 404);
      }
      throw err;
    }
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
