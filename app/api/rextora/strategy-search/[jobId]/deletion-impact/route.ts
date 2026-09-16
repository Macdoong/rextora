import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { previewResearchJobDeletion } from "@/src/lib/rextora/strategySearch/deletionSafety";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

type Ctx = { params: Promise<{ jobId: string }> };

/** GET /api/rextora/strategy-search/[jobId]/deletion-impact */
export async function GET(_request: Request, context: Ctx) {
  const denied = await denyUnlessAuthenticated(_request);
  if (denied) return denied;

  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const data = previewResearchJobDeletion(jobId);
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
