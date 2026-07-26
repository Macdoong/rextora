import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { archiveResearchJob } from "@/src/lib/rextora/strategySearch/jobArchive";
import { StrategySearchApiError } from "@/src/lib/rextora/strategySearch/jobApiService";

type Ctx = { params: Promise<{ jobId: string }> };

/** POST /api/rextora/strategy-search/[jobId]/archive — soft-archive terminal jobs */
export async function POST(request: Request, context: Ctx) {
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    let reason = "operator_archive";
    try {
      const body = (await request.json()) as { reason?: string };
      if (typeof body.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch {
      /* empty body ok */
    }
    try {
      const data = archiveResearchJob(jobId, reason);
      return strategySearchJson(data, Date.now() - start);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        throw new StrategySearchApiError("JOB_NOT_FOUND", err.message, 404);
      }
      if (err instanceof Error && err.message.includes("cannot be archived")) {
        throw new StrategySearchApiError("INVALID_STATE", err.message, 409);
      }
      throw err;
    }
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
