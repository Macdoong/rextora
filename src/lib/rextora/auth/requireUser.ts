import { NextResponse } from "next/server";
import type { AuthenticatedUser, RextoraPermission } from "./authTypes";
import { AUTH_ERROR, AUTH_SESSION_TTL_MS } from "./authTypes";
import {
  AUTH_CLIENT_ACTOR_REJECTED,
  AUTH_FORBIDDEN,
  AUTH_LOGIN_REQUIRED,
  AUTH_ORIGIN_REJECTED,
} from "./authPresentation";
import { roleHasPermission } from "./permissions";
import { hasClientActorFields, isSameOriginMutation, readSessionCookie } from "./requestSecurity";
import { resolveSessionToken } from "./sessionStore";
import { buildApiMeta } from "../apiResponse";

export type AuthGateFailure = NextResponse<{
  ok: false;
  data: null;
  error: string;
  code: string;
  meta: ReturnType<typeof buildApiMeta>;
}>;

function fail(status: number, code: string, message: string): AuthGateFailure {
  return NextResponse.json(
    {
      ok: false,
      data: null,
      error: message,
      code,
      meta: buildApiMeta({ source: "auth", durationMs: 0, cached: false }),
    },
    { status },
  );
}

export function unauthenticatedResponse(): AuthGateFailure {
  return fail(401, AUTH_ERROR.unauthenticated, AUTH_LOGIN_REQUIRED);
}

export function forbiddenResponse(): AuthGateFailure {
  return fail(403, AUTH_ERROR.forbidden, AUTH_FORBIDDEN);
}

export function originRejectedResponse(): AuthGateFailure {
  return fail(403, AUTH_ERROR.origin_rejected, AUTH_ORIGIN_REJECTED);
}

export function clientActorRejectedResponse(): AuthGateFailure {
  return fail(400, AUTH_ERROR.client_actor_rejected, AUTH_CLIENT_ACTOR_REJECTED);
}

export function resolveRequestUser(request: Request): AuthenticatedUser | null {
  return resolveSessionToken(readSessionCookie(request));
}

export function requireAuthenticatedUser(
  request: Request,
): { ok: true; user: AuthenticatedUser } | { ok: false; response: AuthGateFailure } {
  const user = resolveRequestUser(request);
  if (!user) return { ok: false, response: unauthenticatedResponse() };
  return { ok: true, user };
}

/**
 * CEO-only role gate. Uses requireAuthenticatedUser(); does not parse cookies
 * itself and does not apply mutation-origin checks. CEO means role === "ceo".
 */
export function requireCeo(
  request: Request,
): { ok: true; user: AuthenticatedUser } | { ok: false; response: AuthGateFailure } {
  const auth = requireAuthenticatedUser(request);
  if (!auth.ok) return auth;
  if (auth.user.role !== "ceo") {
    return { ok: false, response: forbiddenResponse() };
  }
  return auth;
}

/**
 * CEO or admin role gate. Uses requireAuthenticatedUser(); does not parse
 * cookies itself and does not apply mutation-origin checks.
 * Member-management mutations (POST/PATCH) use this gate.
 */
export function requireAdmin(
  request: Request,
): { ok: true; user: AuthenticatedUser } | { ok: false; response: AuthGateFailure } {
  const auth = requireAuthenticatedUser(request);
  if (!auth.ok) return auth;
  if (auth.user.role !== "ceo" && auth.user.role !== "admin") {
    return { ok: false, response: forbiddenResponse() };
  }
  return auth;
}

/**
 * Member-management read gate. CEO, admin, and operator may view.
 * Viewer and unauthenticated callers are denied.
 */
export function requireMemberManagementViewer(
  request: Request,
): { ok: true; user: AuthenticatedUser } | { ok: false; response: AuthGateFailure } {
  const auth = requireAuthenticatedUser(request);
  if (!auth.ok) return auth;
  if (
    auth.user.role !== "ceo" &&
    auth.user.role !== "admin" &&
    auth.user.role !== "operator"
  ) {
    return { ok: false, response: forbiddenResponse() };
  }
  return auth;
}

export function requirePermission(
  request: Request,
  permission: RextoraPermission,
): { ok: true; user: AuthenticatedUser } | { ok: false; response: AuthGateFailure } {
  if (!isSameOriginMutation(request)) {
    return { ok: false, response: originRejectedResponse() };
  }
  const auth = requireAuthenticatedUser(request);
  if (!auth.ok) return auth;
  if (!roleHasPermission(auth.user.role, permission)) {
    return { ok: false, response: forbiddenResponse() };
  }
  return auth;
}

export function requireLiveApprover(
  request: Request,
): { ok: true; user: AuthenticatedUser } | { ok: false; response: AuthGateFailure } {
  return requirePermission(request, "live:approve");
}

export function sessionActorIdentity(user: AuthenticatedUser): string {
  return user.username;
}

export async function denyUnlessPermitted(
  request: Request,
  permission: RextoraPermission,
): Promise<AuthGateFailure | null> {
  const gate = requirePermission(request, permission);
  return gate.ok ? null : gate.response;
}

export async function denyUnlessAuthenticated(
  request: Request,
): Promise<AuthGateFailure | null> {
  const gate = requireAuthenticatedUser(request);
  return gate.ok ? null : gate.response;
}

export function rejectClientActorBody(body: unknown): AuthGateFailure | null {
  if (hasClientActorFields(body)) return clientActorRejectedResponse();
  return null;
}

export function withAuth<Args extends unknown[], R extends Response>(
  permission: RextoraPermission,
  handler: (request: Request, ...args: Args) => R | Promise<R>,
): (request: Request, ...args: Args) => Promise<R | AuthGateFailure> {
  return async (request: Request, ...args: Args) => {
    const denied = await denyUnlessPermitted(request, permission);
    if (denied) return denied;
    return handler(request, ...args);
  };
}

export const SESSION_MAX_AGE_SEC = Math.floor(AUTH_SESSION_TTL_MS / 1000);
