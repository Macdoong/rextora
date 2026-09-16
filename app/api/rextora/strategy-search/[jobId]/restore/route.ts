import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { restoreStrategySearchJobApi } from "@/src/lib/rextora/strategySearch/jobApiService";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

type Ctx = { params: Promise<{ jobId: string }> };

/** POST /api/rextora/strategy-search/[jobId]/restore — restore archived job to history */
export async function POST(_request: Request, context: Ctx) {
  const denied = await denyUnlessPermitted(_request, "research:run");
  if (denied) return denied;
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const data = restoreStrategySearchJobApi(jobId);
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
