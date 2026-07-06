import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { closeAllLivePositions } from "@/src/lib/rextora/emergencyControls";
import type { TradingMode } from "@/lib/types";

export async function POST(request: Request) {
  const start = Date.now();
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode ?? "PAPER") as TradingMode;
  try {
    const result = await closeAllLivePositions(mode);
    return apiJsonResponse(result, { source: "close-all", cached: false, durationMs: Date.now() - start });
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "close all failed", Date.now() - start);
  }
}
