import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { buildStorageSummary } from "@/src/lib/rextora/strategySearch/storageSummary";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

/** GET /api/rextora/strategy-search/storage-summary */
export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  const start = Date.now();
  try {
    const data = buildStorageSummary();
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
