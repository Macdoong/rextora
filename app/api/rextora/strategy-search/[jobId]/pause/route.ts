import { pauseStrategySearchJobApi } from "@/src/lib/rextora/strategySearch/jobApiService";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";

type Ctx = { params: Promise<{ jobId: string }> };

/** POST /api/rextora/strategy-search/[jobId]/pause */
export async function POST(_request: Request, context: Ctx) {
  const denied = await denyUnlessPermitted(_request, "research:run");
  if (denied) return denied;
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const data = pauseStrategySearchJobApi(jobId);
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
