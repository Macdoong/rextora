import { NextResponse } from "next/server";
import { startExecution } from "@/src/lib/rextora/executionEngine";
import { runBacktest } from "@/src/lib/rextora/backtestEngine";
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
  if (!isSameOriginMutation(request)) return originRejectedResponse();
  const auth = requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode ?? "PAPER") as TradingMode;
  if (!roleHasPermission(auth.user.role, permissionForBotStart(mode))) {
    return forbiddenResponse();
  }

  if (mode === "BACKTEST") return NextResponse.json(await runBacktest(body.strategyId));
  const result = await startExecution(mode);
  if (mode === "LIVE" && !result.ok) {
    return NextResponse.json(result, { status: 403 });
  }
  return NextResponse.json(result);
}
