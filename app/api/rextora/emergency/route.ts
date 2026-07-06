import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { emergencyStopAll } from "@/src/lib/rextora/orderManager";
import type { TradingMode } from "@/lib/types";

export async function POST(request: Request) {
  const start = Date.now();
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode ?? "PAPER") as TradingMode;

  try {
    const result = await emergencyStopAll(mode);
    return apiJsonResponse(result, { source: "emergency", cached: false, durationMs: Date.now() - start });
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "emergency stop failed", Date.now() - start);
  }
}
