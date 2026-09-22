import type { RextoraPermission } from "./authTypes";

export type MutationRoutePermission = {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  permission: RextoraPermission | "auth" | "action";
  sourceFile: string;
};

/**
 * Explicit inventory of production mutation routes.
 * The coverage test fails if a route file exports POST/PUT/PATCH/DELETE
 * without a matching entry here (auth endpoints excepted as permission "auth").
 */
export const MUTATION_ROUTE_PERMISSIONS: MutationRoutePermission[] = [
  { method: "POST", path: "/api/rextora/auth/login", permission: "auth", sourceFile: "app/api/rextora/auth/login/route.ts" },
  { method: "POST", path: "/api/rextora/auth/logout", permission: "auth", sourceFile: "app/api/rextora/auth/logout/route.ts" },
  { method: "POST", path: "/api/rextora/admin/users", permission: "action", sourceFile: "app/api/rextora/admin/users/route.ts" },
  { method: "PATCH", path: "/api/rextora/admin/users/[userId]", permission: "action", sourceFile: "app/api/rextora/admin/users/[userId]/route.ts" },
  { method: "DELETE", path: "/api/rextora/admin/users/[userId]", permission: "action", sourceFile: "app/api/rextora/admin/users/[userId]/route.ts" },
  { method: "POST", path: "/api/rextora/strategy/approve", permission: "action", sourceFile: "app/api/rextora/strategy/approve/route.ts" },
  { method: "POST", path: "/api/rextora/bot/start", permission: "action", sourceFile: "app/api/rextora/bot/start/route.ts" },
  { method: "POST", path: "/api/bot/start", permission: "action", sourceFile: "app/api/bot/start/route.ts" },
  { method: "POST", path: "/api/rextora/bot/stop", permission: "live:emergency_stop", sourceFile: "app/api/rextora/bot/stop/route.ts" },
  { method: "POST", path: "/api/bot/stop", permission: "live:emergency_stop", sourceFile: "app/api/bot/stop/route.ts" },
  { method: "POST", path: "/api/bot/restart", permission: "paper:operate", sourceFile: "app/api/bot/restart/route.ts" },
  { method: "POST", path: "/api/rextora/emergency", permission: "live:emergency_stop", sourceFile: "app/api/rextora/emergency/route.ts" },
  { method: "POST", path: "/api/rextora/trading/emergency-stop", permission: "live:emergency_stop", sourceFile: "app/api/rextora/trading/emergency-stop/route.ts" },
  { method: "POST", path: "/api/emergency/stop-all", permission: "live:emergency_stop", sourceFile: "app/api/emergency/stop-all/route.ts" },
  { method: "PUT", path: "/api/rextora/settings", permission: "settings:write", sourceFile: "app/api/rextora/settings/route.ts" },
  { method: "POST", path: "/api/rextora/risk", permission: "risk:write", sourceFile: "app/api/rextora/risk/route.ts" },
  { method: "POST", path: "/api/risk", permission: "risk:write", sourceFile: "app/api/risk/route.ts" },
  { method: "DELETE", path: "/api/rextora/settings/ai-providers/credential", permission: "credentials:manage", sourceFile: "app/api/rextora/settings/ai-providers/credential/route.ts" },
  { method: "PATCH", path: "/api/rextora/settings/ai-providers", permission: "credentials:manage", sourceFile: "app/api/rextora/settings/ai-providers/route.ts" },
  { method: "POST", path: "/api/rextora/settings/ai-providers/test", permission: "credentials:manage", sourceFile: "app/api/rextora/settings/ai-providers/test/route.ts" },
  { method: "POST", path: "/api/rextora/paper/session", permission: "paper:operate", sourceFile: "app/api/rextora/paper/session/route.ts" },
  { method: "POST", path: "/api/rextora/paper/session/[id]", permission: "paper:operate", sourceFile: "app/api/rextora/paper/session/[id]/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/[jobId]/start", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/[jobId]/start/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/[jobId]/resume", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/[jobId]/resume/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/[jobId]/pause", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/[jobId]/pause/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/[jobId]/cancel", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/[jobId]/cancel/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/[jobId]/archive", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/[jobId]/archive/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/[jobId]/restore", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/[jobId]/restore/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/[jobId]/promote", permission: "strategy:write", sourceFile: "app/api/rextora/strategy-search/[jobId]/promote/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/[jobId]/raw-trials", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/[jobId]/raw-trials/route.ts" },
  { method: "DELETE", path: "/api/rextora/strategy-search/[jobId]", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/[jobId]/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/recover", permission: "action", sourceFile: "app/api/rextora/strategy-search/recover/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/follow-up", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/follow-up/route.ts" },
  { method: "POST", path: "/api/rextora/strategy-search/configs", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/configs/route.ts" },
  { method: "DELETE", path: "/api/rextora/strategy-search/configs/[name]", permission: "research:run", sourceFile: "app/api/rextora/strategy-search/configs/[name]/route.ts" },
  { method: "POST", path: "/api/rextora/backtest/run", permission: "backtest:run", sourceFile: "app/api/rextora/backtest/run/route.ts" },
  { method: "DELETE", path: "/api/rextora/backtest/run", permission: "backtest:run", sourceFile: "app/api/rextora/backtest/run/route.ts" },
  { method: "POST", path: "/api/backtests/run", permission: "backtest:run", sourceFile: "app/api/backtests/run/route.ts" },
  { method: "POST", path: "/api/rextora/strategies", permission: "action", sourceFile: "app/api/rextora/strategies/route.ts" },
  { method: "POST", path: "/api/rextora/strategies/compare", permission: "strategy:write", sourceFile: "app/api/rextora/strategies/compare/route.ts" },
  { method: "POST", path: "/api/strategies/discover", permission: "strategy:write", sourceFile: "app/api/strategies/discover/route.ts" },
  { method: "POST", path: "/api/rextora/trading/close-all", permission: "live:emergency_stop", sourceFile: "app/api/rextora/trading/close-all/route.ts" },
  { method: "POST", path: "/api/rextora/trading/cancel-all", permission: "live:emergency_stop", sourceFile: "app/api/rextora/trading/cancel-all/route.ts" },
  { method: "POST", path: "/api/orders/cancel-all", permission: "live:emergency_stop", sourceFile: "app/api/orders/cancel-all/route.ts" },
  { method: "POST", path: "/api/orders/close-position", permission: "live:emergency_stop", sourceFile: "app/api/orders/close-position/route.ts" },
  { method: "POST", path: "/api/orders/partial-close", permission: "live:emergency_stop", sourceFile: "app/api/orders/partial-close/route.ts" },
  { method: "POST", path: "/api/rextora/agent", permission: "agent:operate", sourceFile: "app/api/rextora/agent/route.ts" },
  { method: "PATCH", path: "/api/rextora/agent/session", permission: "agent:operate", sourceFile: "app/api/rextora/agent/session/route.ts" },
  { method: "POST", path: "/api/rextora/agent/session/reset", permission: "agent:operate", sourceFile: "app/api/rextora/agent/session/reset/route.ts" },
  { method: "POST", path: "/api/rextora/internal/orphan-recovery", permission: "research:run", sourceFile: "app/api/rextora/internal/orphan-recovery/route.ts" },
  { method: "POST", path: "/api/rextora/live/dry-run", permission: "live:request", sourceFile: "app/api/rextora/live/dry-run/route.ts" },
  { method: "POST", path: "/api/rextora/live/preflight", permission: "live:request", sourceFile: "app/api/rextora/live/preflight/route.ts" },
  { method: "POST", path: "/api/rextora/first-run/dismiss", permission: "settings:write", sourceFile: "app/api/rextora/first-run/dismiss/route.ts" },
  { method: "POST", path: "/api/rextora/first-run/demo", permission: "settings:write", sourceFile: "app/api/rextora/first-run/demo/route.ts" },
  { method: "POST", path: "/api/rextora/first-run/demo/reset", permission: "settings:write", sourceFile: "app/api/rextora/first-run/demo/reset/route.ts" },
  { method: "POST", path: "/api/rextora/binance/diagnostics", permission: "live:request", sourceFile: "app/api/rextora/binance/diagnostics/route.ts" },
  { method: "POST", path: "/api/rextora/telegram/test", permission: "settings:write", sourceFile: "app/api/rextora/telegram/test/route.ts" },
  { method: "POST", path: "/api/telegram/test", permission: "settings:write", sourceFile: "app/api/telegram/test/route.ts" },
  { method: "POST", path: "/api/alerts/rules", permission: "settings:write", sourceFile: "app/api/alerts/rules/route.ts" },
  { method: "POST", path: "/api/alerts/history", permission: "settings:write", sourceFile: "app/api/alerts/history/route.ts" },
];

export type GetRouteAccess = "AUTH_REQUIRED" | "AUTH_ENDPOINT" | "PUBLIC";

export type GetRoutePermission = {
  method: "GET";
  path: string;
  access: GetRouteAccess;
  sourceFile: string;
};

/**
 * Explicit inventory of production GET routes.
 * There are no anonymous application-data GET exceptions.
 * /api/rextora/auth/me remains an auth endpoint (401 or public user).
 */
export const PUBLIC_GET_EXCEPTIONS: readonly string[] = [];

export const GET_ROUTE_ACCESS: GetRoutePermission[] = [
  { method: "GET", path: "/api/alerts/history", access: "AUTH_REQUIRED", sourceFile: "app/api/alerts/history/route.ts" },
  { method: "GET", path: "/api/alerts/rules", access: "AUTH_REQUIRED", sourceFile: "app/api/alerts/rules/route.ts" },
  { method: "GET", path: "/api/backtests/validation", access: "AUTH_REQUIRED", sourceFile: "app/api/backtests/validation/route.ts" },
  { method: "GET", path: "/api/binance/balance", access: "AUTH_REQUIRED", sourceFile: "app/api/binance/balance/route.ts" },
  { method: "GET", path: "/api/binance/klines", access: "AUTH_REQUIRED", sourceFile: "app/api/binance/klines/route.ts" },
  { method: "GET", path: "/api/binance/market", access: "AUTH_REQUIRED", sourceFile: "app/api/binance/market/route.ts" },
  { method: "GET", path: "/api/binance/status", access: "AUTH_REQUIRED", sourceFile: "app/api/binance/status/route.ts" },
  { method: "GET", path: "/api/bot/status", access: "AUTH_REQUIRED", sourceFile: "app/api/bot/status/route.ts" },
  { method: "GET", path: "/api/dashboard", access: "AUTH_REQUIRED", sourceFile: "app/api/dashboard/route.ts" },
  { method: "GET", path: "/api/rextora/admin/users", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/admin/users/route.ts" },
  { method: "GET", path: "/api/rextora/agent/health", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/agent/health/route.ts" },
  { method: "GET", path: "/api/rextora/agent/session", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/agent/session/route.ts" },
  { method: "GET", path: "/api/rextora/auth/me", access: "AUTH_ENDPOINT", sourceFile: "app/api/rextora/auth/me/route.ts" },
  { method: "GET", path: "/api/rextora/backtest/run", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/backtest/run/route.ts" },
  { method: "GET", path: "/api/rextora/binance/diagnostics", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/binance/diagnostics/route.ts" },
  { method: "GET", path: "/api/rextora/bot/status", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/bot/status/route.ts" },
  { method: "GET", path: "/api/rextora/candidates", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/candidates/route.ts" },
  { method: "GET", path: "/api/rextora/charts/candles", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/charts/candles/route.ts" },
  { method: "GET", path: "/api/rextora/cost", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/cost/route.ts" },
  { method: "GET", path: "/api/rextora/first-run", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/first-run/route.ts" },
  { method: "GET", path: "/api/rextora/learning", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/learning/route.ts" },
  { method: "GET", path: "/api/rextora/live/readiness", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/live/readiness/route.ts" },
  { method: "GET", path: "/api/rextora/market", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/market/route.ts" },
  { method: "GET", path: "/api/rextora/paper/session/[id]", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/paper/session/[id]/route.ts" },
  { method: "GET", path: "/api/rextora/paper/session", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/paper/session/route.ts" },
  { method: "GET", path: "/api/rextora/risk", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/risk/route.ts" },
  { method: "GET", path: "/api/rextora/settings/ai-providers/models", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/settings/ai-providers/models/route.ts" },
  { method: "GET", path: "/api/rextora/settings/ai-providers", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/settings/ai-providers/route.ts" },
  { method: "GET", path: "/api/rextora/settings", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/settings/route.ts" },
  { method: "GET", path: "/api/rextora/strategies/preview", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategies/preview/route.ts" },
  { method: "GET", path: "/api/rextora/strategies", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategies/route.ts" },
  { method: "GET", path: "/api/rextora/strategy/approve", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy/approve/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/[jobId]/best", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/[jobId]/best/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/[jobId]/deletion-impact", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/[jobId]/deletion-impact/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/[jobId]/generations", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/[jobId]/generations/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/[jobId]/raw-trials", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/[jobId]/raw-trials/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/[jobId]/results-summary", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/[jobId]/results-summary/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/[jobId]", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/[jobId]/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/[jobId]/trials", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/[jobId]/trials/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/configs/[name]", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/configs/[name]/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/configs", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/configs/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/recover", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/recover/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/route.ts" },
  { method: "GET", path: "/api/rextora/strategy-search/storage-summary", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/strategy-search/storage-summary/route.ts" },
  { method: "GET", path: "/api/rextora/system", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/system/route.ts" },
  { method: "GET", path: "/api/rextora/trading/dashboard", access: "AUTH_REQUIRED", sourceFile: "app/api/rextora/trading/dashboard/route.ts" },
  { method: "GET", path: "/api/risk", access: "AUTH_REQUIRED", sourceFile: "app/api/risk/route.ts" },
  { method: "GET", path: "/api/strategies/[id]", access: "AUTH_REQUIRED", sourceFile: "app/api/strategies/[id]/route.ts" },
  { method: "GET", path: "/api/strategies", access: "AUTH_REQUIRED", sourceFile: "app/api/strategies/route.ts" },
  { method: "GET", path: "/api/system/api-status", access: "AUTH_REQUIRED", sourceFile: "app/api/system/api-status/route.ts" },
];

export function permissionForApproveAction(action: string | undefined): RextoraPermission {
  if (action === "request") return "live:request";
  if (action === "revoke") return "live:revoke";
  return "live:approve";
}

export function permissionForBotStart(mode: string | undefined): RextoraPermission {
  if (mode === "LIVE") return "live:start";
  if (mode === "BACKTEST") return "backtest:run";
  return "paper:operate";
}

export function permissionForStrategyAction(action: string | undefined): RextoraPermission {
  if (action === "apply_paper") return "paper:operate";
  if (action === "apply_live" || action === "mark_live_candidate") return "live:start";
  if (action === "deletion_impact" || action === "validate") return "strategy:write";
  return "strategy:write";
}
