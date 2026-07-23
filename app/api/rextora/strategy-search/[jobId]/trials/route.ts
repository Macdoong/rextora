import { listStrategySearchTrialsApi } from "@/src/lib/rextora/strategySearch/jobApiService";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";

type Ctx = { params: Promise<{ jobId: string }> };

/** GET /api/rextora/strategy-search/[jobId]/trials?limit=&offset=&passedOnly= */
export async function GET(request: Request, context: Ctx) {
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const passedOnly = url.searchParams.get("passedOnly") === "true";
    const data = listStrategySearchTrialsApi(jobId, {
      limit,
      offset,
      passedOnly,
    });
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
