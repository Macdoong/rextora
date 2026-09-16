import {
  inspectOrphanSearchJobs,
  recoverOrphanSearchJobs,
} from "@/src/lib/rextora/strategySearch/orphanJobRecovery";
import { denyUnlessPermitted, denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";

/**
 * POST /api/rextora/strategy-search/recover
 * Resume disk-marked running/queued jobs that are not active in this process.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "research:run");
  if (denied) return denied;
  const start = Date.now();
  try {
    const data = recoverOrphanSearchJobs();
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}

/** GET inspects recovery candidates only. Does not mutate. */
export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  const start = Date.now();
  try {
    const data = inspectOrphanSearchJobs();
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
