import {
  inspectOrphanSearchJobs,
  recoverOrphanSearchJobs,
} from "@/src/lib/rextora/strategySearch/orphanJobRecovery";
import { requireAdmin } from "@/src/lib/rextora/auth/requireUser";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";

/**
 * POST /api/rextora/strategy-search/recover
 * Global process-loss recovery. Not a customer-scoped job mutation.
 * CEO/admin maintenance only (requireAdmin). Ordinary operators cannot
 * recover another user's jobs or ownerless records through this route.
 */
export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;
  const start = Date.now();
  try {
    const data = recoverOrphanSearchJobs();
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}

/** GET inspects recovery candidates only. Does not mutate. CEO/admin only. */
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const start = Date.now();
  try {
    const data = inspectOrphanSearchJobs();
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
