import {
  deleteStrategySearchConfig,
  loadStrategySearchConfig,
} from "@/src/lib/rextora/strategySearch/searchConfigStore";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { StrategySearchApiError } from "@/src/lib/rextora/strategySearch/jobApiService";
import { denyUnlessPermitted, denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

type RouteContext = { params: Promise<{ name: string }> };

/** GET /api/rextora/strategy-search/configs/[name] */
export async function GET(_request: Request, context: RouteContext) {
  const denied = await denyUnlessAuthenticated(_request);
  if (denied) return denied;

  const start = Date.now();
  try {
    const { name } = await context.params;
    const data = loadStrategySearchConfig(decodeURIComponent(name));
    if (!data) {
      throw new StrategySearchApiError("JOB_NOT_FOUND", "config not found", 404);
    }
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}

/** DELETE /api/rextora/strategy-search/configs/[name] */
export async function DELETE(_request: Request, context: RouteContext) {
  const denied = await denyUnlessPermitted(_request, "research:run");
  if (denied) return denied;
  const start = Date.now();
  try {
    const { name } = await context.params;
    const deleted = deleteStrategySearchConfig(decodeURIComponent(name));
    if (!deleted) {
      throw new StrategySearchApiError("JOB_NOT_FOUND", "config not found", 404);
    }
    return strategySearchJson({ deleted: true }, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
