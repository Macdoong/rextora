import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { cancelAllLiveOrders } from "@/src/lib/rextora/emergencyControls";
import type { TradingMode } from "@/lib/types";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "live:emergency_stop");
  if (denied) return denied;
  const start = Date.now();
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode ?? "PAPER") as TradingMode;
  try {
    const result = await cancelAllLiveOrders(mode);
    return apiJsonResponse(result, { source: "cancel-all", cached: false, durationMs: Date.now() - start });
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "cancel all failed", Date.now() - start);
  }
}
