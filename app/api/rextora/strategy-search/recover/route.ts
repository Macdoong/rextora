import { recoverOrphanSearchJobs } from "@/src/lib/rextora/strategySearch";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";

/**
 * POST /api/rextora/strategy-search/recover
 * Resume disk-marked running/queued jobs that are not active in this process.
 */
export async function POST() {
  const start = Date.now();
  try {
    const data = recoverOrphanSearchJobs();
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}

/** GET also triggers recovery (idempotent) for restart hooks / health probes. */
export async function GET() {
  return POST();
}
