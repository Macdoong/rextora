import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { buildStorageSummary } from "@/src/lib/rextora/strategySearch/storageSummary";
import { requireAdmin } from "@/src/lib/rextora/auth/requireUser";

/**
 * GET /api/rextora/strategy-search/storage-summary
 * Global operational storage diagnostics. CEO/admin maintenance only.
 * Does not include job IDs, strategy IDs, names, or per-user counts.
 */
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const start = Date.now();
  try {
    const data = buildStorageSummary();
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
