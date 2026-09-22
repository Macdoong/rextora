import { listResearchGenerations } from "@/src/lib/rextora/strategySearch/researchGeneration";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { requireSearchJobAccess } from "@/src/lib/rextora/auth/requireSearchJobAccess";

type Ctx = { params: Promise<{ jobId: string }> };

/** GET /api/rextora/strategy-search/[jobId]/generations */
export async function GET(request: Request, context: Ctx) {
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const access = requireSearchJobAccess(request, jobId, "read");
    if (!access.ok) return access.response;
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
