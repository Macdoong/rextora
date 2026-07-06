import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { stopExecution } from "@/src/lib/rextora/executionEngine";

export async function POST() {
  const start = Date.now();

  try {
    const result = await stopExecution("PAPER");
    return apiJsonResponse(result, { source: "execution-engine", cached: false, durationMs: Date.now() - start });
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "bot stop failed", Date.now() - start);
  }
}
