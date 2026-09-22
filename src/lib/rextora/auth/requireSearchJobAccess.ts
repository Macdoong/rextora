import type { AuthenticatedUser, RextoraPermission } from "./authTypes";
import {
  requireAuthenticatedUser,
  requirePermission,
  type AuthGateFailure,
} from "./requireUser";
import {
  canReadStoredStrategy,
  canReadStrategySearchResource,
  canWriteStoredStrategy,
  canWriteStrategySearchResource,
} from "./searchResourceAccess";
import { getStrategyById } from "../strategy/strategyStore";
import {
  getSearchJobForApi,
  StrategySearchApiError,
} from "../strategySearch/jobApiService";
import { strategySearchError } from "../strategySearch/jobApiHttp";
import { NextResponse } from "next/server";

const HIDDEN = new StrategySearchApiError(
  "JOB_NOT_FOUND",
  "strategy-search job not found",
  404,
);

export function requireSearchJobAccess(
  request: Request,
  jobId: string,
  mode: "read" | "write",
  permission?: RextoraPermission,
):
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: AuthGateFailure | ReturnType<typeof strategySearchError> } {
  const auth = permission
    ? requirePermission(request, permission)
    : requireAuthenticatedUser(request);
  if (!auth.ok) return auth;
  const job = getSearchJobForApi(jobId);
  if (!job) {
    return { ok: false, response: strategySearchError(HIDDEN, 0) };
  }
  const allowed =
    mode === "write"
      ? canWriteStrategySearchResource(auth.user, job)
      : canReadStrategySearchResource(auth.user, job);
  if (!allowed) {
    return { ok: false, response: strategySearchError(HIDDEN, 0) };
  }
  return { ok: true, user: auth.user };
}

function hiddenStrategyResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "전략을 찾을 수 없습니다." },
    { status: 404 },
  );
}

export function requireStoredStrategyAccess(
  request: Request,
  strategyId: string,
  mode: "read" | "write",
  permission?: RextoraPermission,
):
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: AuthGateFailure | NextResponse } {
  const auth = permission
    ? requirePermission(request, permission)
    : requireAuthenticatedUser(request);
  if (!auth.ok) return auth;
  let strategy;
  try {
    strategy = getStrategyById(strategyId);
  } catch {
    strategy = null;
  }
  if (!strategy) {
    return { ok: false, response: hiddenStrategyResponse() };
  }
  const allowed =
    mode === "write"
      ? canWriteStoredStrategy(auth.user, strategy)
      : canReadStoredStrategy(auth.user, strategy);
  if (!allowed) {
    return { ok: false, response: hiddenStrategyResponse() };
  }
  return { ok: true, user: auth.user };
}
