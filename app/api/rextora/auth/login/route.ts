import { NextResponse } from "next/server";
import { getUserByUsername } from "@/src/lib/rextora/auth/userStore";
import { verifyPassword } from "@/src/lib/rextora/auth/password";
import { createSession } from "@/src/lib/rextora/auth/sessionStore";
import {
  AUTH_SESSION_TTL_MS,
  AUTH_ERROR,
  toPublicUser,
} from "@/src/lib/rextora/auth/authTypes";
import {
  AUTH_ACCOUNT_DISABLED,
  AUTH_LOGIN_INVALID,
  AUTH_RATE_LIMITED,
} from "@/src/lib/rextora/auth/authPresentation";
import {
  clearLoginFailures,
  getLoginLock,
  recordLoginFailure,
} from "@/src/lib/rextora/auth/loginRateLimit";
import {
  isSameOriginMutation,
  requestUsesHttps,
  sessionCookieHeader,
} from "@/src/lib/rextora/auth/requestSecurity";
import { originRejectedResponse } from "@/src/lib/rextora/auth/requireUser";
import { buildApiMeta } from "@/src/lib/rextora/apiResponse";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return originRejectedResponse();
  const start = Date.now();
  const body = (await request.json().catch(() => ({}))) as {
    username?: unknown;
    password?: unknown;
  };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const meta = { source: "auth-login", durationMs: 0, cached: false };

  if (!username || !password) {
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: AUTH_LOGIN_INVALID,
        code: AUTH_ERROR.invalid_credentials,
        meta: buildApiMeta({ ...meta, durationMs: Date.now() - start }),
      },
      { status: 401 },
    );
  }

  const lock = getLoginLock(username);
  if (lock.locked) {
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: AUTH_RATE_LIMITED,
        code: AUTH_ERROR.rate_limited,
        meta: buildApiMeta({ ...meta, durationMs: Date.now() - start }),
      },
      { status: 429 },
    );
  }

  const user = getUserByUsername(username);
  if (!user || user.disabledAt) {
    recordLoginFailure(username);
    const disabled = Boolean(user?.disabledAt);
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: disabled ? AUTH_ACCOUNT_DISABLED : AUTH_LOGIN_INVALID,
        code: disabled ? AUTH_ERROR.disabled : AUTH_ERROR.invalid_credentials,
        meta: buildApiMeta({ ...meta, durationMs: Date.now() - start }),
      },
      { status: disabled ? 403 : 401 },
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const after = recordLoginFailure(username);
    return NextResponse.json(
      {
        ok: false,
        data: null,
        error: after.locked ? AUTH_RATE_LIMITED : AUTH_LOGIN_INVALID,
        code: after.locked ? AUTH_ERROR.rate_limited : AUTH_ERROR.invalid_credentials,
        meta: buildApiMeta({ ...meta, durationMs: Date.now() - start }),
      },
      { status: after.locked ? 429 : 401 },
    );
  }

  clearLoginFailures(username);
  const { token } = createSession(user.userId);
  const response = NextResponse.json({
    ok: true,
    data: { user: toPublicUser(user) },
    meta: buildApiMeta({ source: "auth-login", durationMs: Date.now() - start }),
  });
  response.headers.append(
    "Set-Cookie",
    sessionCookieHeader(token, {
      secure: requestUsesHttps(request),
      maxAgeSec: Math.floor(AUTH_SESSION_TTL_MS / 1000),
    }),
  );
  return response;
}
