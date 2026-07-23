import {
  createStrategySearchJobApi,
  listStrategySearchJobsApi,
} from "@/src/lib/rextora/strategySearch/jobApiService";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";

/** GET /api/rextora/strategy-search — list newest jobs (default limit 20) */
export async function GET(request?: Request) {
  const start = Date.now();
  try {
    const url = new URL(
      request?.url ?? "http://localhost/api/rextora/strategy-search",
    );
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
    const data = listStrategySearchJobsApi({ limit, offset });
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}

/** POST /api/rextora/strategy-search — create job */
export async function POST(request: Request) {
  const start = Date.now();
  try {
    const body = await request.json().catch(() => null);
    const data = createStrategySearchJobApi(body);
    return strategySearchJson(data, Date.now() - start, { status: 201 });
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
