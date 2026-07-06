import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { startExecution } from "@/src/lib/rextora/executionEngine";
import type { TradingMode } from "@/lib/types";

export async function POST(request: Request) {
  const start = Date.now();
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode ?? "PAPER") as TradingMode;

  try {
    const result = await startExecution(mode);
    return apiJsonResponse(result, { source: "execution-engine", cached: false, durationMs: Date.now() - start }, result.ok ? undefined : { status: 403 });
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "bot start failed", Date.now() - start);
  }
}
