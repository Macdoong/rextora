import {
  deleteStrategySearchConfig,
  loadStrategySearchConfig,
} from "@/src/lib/rextora/strategySearch/searchConfigStore";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { StrategySearchApiError } from "@/src/lib/rextora/strategySearch/jobApiService";
import {
  requireAuthenticatedUser,
  requirePermission,
} from "@/src/lib/rextora/auth/requireUser";

type RouteContext = { params: Promise<{ name: string }> };

/** GET /api/rextora/strategy-search/configs/[name] */
export async function GET(request: Request, context: RouteContext) {
  const auth = requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const start = Date.now();
  try {
    const { name } = await context.params;
    const data = loadStrategySearchConfig(decodeURIComponent(name), {
      ownerUserId: auth.user.userId,
      viewerRole: auth.user.role,
    });
    if (!data) {
      throw new StrategySearchApiError("JOB_NOT_FOUND", "config not found", 404);
    }
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}

/** DELETE /api/rextora/strategy-search/configs/[name] */
export async function DELETE(request: Request, context: RouteContext) {
  const auth = requirePermission(request, "research:run");
  if (!auth.ok) return auth.response;
  const start = Date.now();
  try {
    const { name } = await context.params;
    const deleted = deleteStrategySearchConfig(decodeURIComponent(name), {
      ownerUserId: auth.user.userId,
    });
    if (!deleted) {
      throw new StrategySearchApiError("JOB_NOT_FOUND", "config not found", 404);
    }
    return strategySearchJson({ deleted: true }, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
