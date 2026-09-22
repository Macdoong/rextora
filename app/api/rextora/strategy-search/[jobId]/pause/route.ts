import { pauseStrategySearchJobApi } from "@/src/lib/rextora/strategySearch/jobApiService";
import { requireSearchJobAccess } from "@/src/lib/rextora/auth/requireSearchJobAccess";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";

type Ctx = { params: Promise<{ jobId: string }> };

/** POST /api/rextora/strategy-search/[jobId]/pause */
export async function POST(request: Request, context: Ctx) {
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const access = requireSearchJobAccess(request, jobId, "write", "research:run");
    if (!access.ok) return access.response;
    const data = pauseStrategySearchJobApi(jobId);
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
