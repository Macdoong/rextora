import { getStrategySearchBestApi } from "@/src/lib/rextora/strategySearch/jobApiService";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";

type Ctx = { params: Promise<{ jobId: string }> };

/** GET /api/rextora/strategy-search/[jobId]/best */
export async function GET(_request: Request, context: Ctx) {
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const data = getStrategySearchBestApi(jobId);
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
