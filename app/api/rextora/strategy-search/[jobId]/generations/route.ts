import { listResearchGenerations } from "@/src/lib/rextora/strategySearch/researchGeneration";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { getSearchJob } from "@/src/lib/rextora/strategySearch/jobStore";
import { StrategySearchApiError } from "@/src/lib/rextora/strategySearch/jobApiService";

type Ctx = { params: Promise<{ jobId: string }> };

/** GET /api/rextora/strategy-search/[jobId]/generations */
export async function GET(_request: Request, context: Ctx) {
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const job = getSearchJob(jobId);
    if (!job) {
      throw new StrategySearchApiError(
        "JOB_NOT_FOUND",
        `strategy-search job not found: ${jobId}`,
        404,
      );
    }
    const generations = listResearchGenerations(jobId);
    const latest = generations[generations.length - 1] ?? null;
    return strategySearchJson(
      {
        jobId,
        generationCount: generations.length,
        latestWeakness: latest?.weaknessAnalysis ?? null,
        latestAdjustment: latest?.adjustmentPlan ?? null,
        generations,
      },
      Date.now() - start,
    );
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
