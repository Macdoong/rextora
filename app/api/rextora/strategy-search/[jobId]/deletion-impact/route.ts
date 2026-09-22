import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { previewResearchJobDeletion } from "@/src/lib/rextora/strategySearch/deletionSafety";
import { requireSearchJobAccess } from "@/src/lib/rextora/auth/requireSearchJobAccess";

type Ctx = { params: Promise<{ jobId: string }> };

/** GET /api/rextora/strategy-search/[jobId]/deletion-impact */
export async function GET(request: Request, context: Ctx) {
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const access = requireSearchJobAccess(request, jobId, "read");
    if (!access.ok) return access.response;
    const data = previewResearchJobDeletion(jobId);
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
