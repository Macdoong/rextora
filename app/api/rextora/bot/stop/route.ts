import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { stopExecution } from "@/src/lib/rextora/executionEngine";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "live:emergency_stop");
  if (denied) return denied;
  const start = Date.now();

  try {
    const result = await stopExecution("PAPER");
    return apiJsonResponse(result, { source: "execution-engine", cached: false, durationMs: Date.now() - start });
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "bot stop failed", Date.now() - start);
  }
}
