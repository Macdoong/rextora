import { resumeStrategySearchJobApi } from "@/src/lib/rextora/strategySearch/jobApiService";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";

type Ctx = { params: Promise<{ jobId: string }> };

/** POST /api/rextora/strategy-search/[jobId]/resume */
export async function POST(_request: Request, context: Ctx) {
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const data = resumeStrategySearchJobApi(jobId);
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
