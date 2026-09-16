import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { startExecution } from "@/src/lib/rextora/executionEngine";
import type { TradingMode } from "@/lib/types";
import { roleHasPermission } from "@/src/lib/rextora/auth/permissions";
import { permissionForBotStart } from "@/src/lib/rextora/auth/routePermissions";
import {
  forbiddenResponse,
  originRejectedResponse,
  requireAuthenticatedUser,
} from "@/src/lib/rextora/auth/requireUser";
import { isSameOriginMutation } from "@/src/lib/rextora/auth/requestSecurity";

export async function POST(request: Request) {
  const start = Date.now();
  if (!isSameOriginMutation(request)) return originRejectedResponse();
  const auth = requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode ?? "PAPER") as TradingMode;
  if (!roleHasPermission(auth.user.role, permissionForBotStart(mode))) {
    return forbiddenResponse();
  }

  try {
    const result = await startExecution(mode);
    return apiJsonResponse(result, { source: "execution-engine", cached: false, durationMs: Date.now() - start }, result.ok ? undefined : { status: 403 });
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "bot start failed", Date.now() - start);
  }
}
