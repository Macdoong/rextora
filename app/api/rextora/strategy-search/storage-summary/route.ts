import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { buildStorageSummary } from "@/src/lib/rextora/strategySearch/storageSummary";

/** GET /api/rextora/strategy-search/storage-summary */
export async function GET() {
  const start = Date.now();
  try {
    const data = buildStorageSummary();
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
