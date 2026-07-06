import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { preflightLiveExecution } from "@/src/lib/rextora/liveExecutionEngine";

export async function POST(request: Request) {
  const start = Date.now();
  await request.json().catch(() => ({}));

  try {
    const preflight = preflightLiveExecution();
    return apiJsonResponse(
      preflight,
      { source: "live-safety-gate", cached: false, durationMs: Date.now() - start, ok: preflight.ok },
      { status: preflight.ok ? 200 : 403 }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "live preflight failed", Date.now() - start, 403);
  }
}
