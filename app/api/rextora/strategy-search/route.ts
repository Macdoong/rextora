import {
  createStrategySearchJobApi,
  listStrategySearchJobsApi,
} from "@/src/lib/rextora/strategySearch/jobApiService";
import { denyUnlessPermitted, denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";

/** GET /api/rextora/strategy-search — list newest jobs (default limit 20) */
export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  const start = Date.now();
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");
    const limit =
      limitParam != null && limitParam !== ""
        ? Number(limitParam)
        : undefined;
    const offset =
      offsetParam != null && offsetParam !== ""
        ? Number(offsetParam)
        : undefined;
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const archivedOnly = url.searchParams.get("archivedOnly") === "true";
    const data = listStrategySearchJobsApi({
      limit,
      offset,
      includeArchived,
      archivedOnly,
    });
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}

/** POST /api/rextora/strategy-search — create job */
export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "research:run");
  if (denied) return denied;
  const start = Date.now();
  try {
    const body = await request.json().catch(() => null);
    const data = createStrategySearchJobApi(body);
    return strategySearchJson(data, Date.now() - start, { status: 201 });
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
