import type { RextoraRole } from "@/src/lib/rextora/auth/authTypes";
import { AUTH_SESSION_COOKIE } from "@/src/lib/rextora/auth/authTypes";
import { createUser, getUserByUsername } from "@/src/lib/rextora/auth/userStore";
import { createSession } from "@/src/lib/rextora/auth/sessionStore";

const PASSWORDS: Record<RextoraRole, string> = {
  ceo: "ceo-temp-pass-9f3a",
  admin: "admin-temp-pass-9f3a",
  operator: "operator-temp-pass-9f3a",
  viewer: "viewer-temp-pass-9f3a",
};

const USERNAMES: Record<RextoraRole, string> = {
  ceo: "temp_ceo",
  admin: "temp_admin",
  operator: "temp_operator",
  viewer: "temp_viewer",
};

export function testPassword(role: RextoraRole): string {
  return PASSWORDS[role];
}

export async function ensureTestUser(role: RextoraRole) {
  const username = USERNAMES[role];
  const existing = getUserByUsername(username);
  if (existing) return { user: existing, password: PASSWORDS[role] };
  const user = await createUser({
    username,
    displayName:
      role === "ceo"
        ? "임시 대표"
        : role === "admin"
          ? "임시 관리자"
          : role === "operator"
            ? "임시 운영자"
            : "임시 조회",
    role,
    password: PASSWORDS[role],
  });
  return { user, password: PASSWORDS[role] };
}

export async function authHeaders(role: RextoraRole, origin = "http://localhost"): Promise<HeadersInit> {
  const { user } = await ensureTestUser(role);
  const { token } = createSession(user.userId);
  return {
    Cookie: `${AUTH_SESSION_COOKIE}=${token}`,
    Origin: origin,
  };
}

export async function authedRequest(
  input: string,
  init: RequestInit = {},
  role: RextoraRole = "ceo",
): Promise<Request> {
  const url = new URL(input, "http://localhost");
  const headers = new Headers(init.headers);
  const auth = await authHeaders(role, url.origin);
  for (const [key, value] of Object.entries(auth)) {
    if (!headers.has(key)) headers.set(key, String(value));
  }
  return new Request(url, { ...init, headers });
}

export function attachCookie(request: Request, token: string, origin?: string): Request {
  const headers = new Headers(request.headers);
  headers.set("Cookie", `${AUTH_SESSION_COOKIE}=${token}`);
  if (origin && !headers.has("origin")) headers.set("origin", origin);
  if (!headers.has("origin")) {
    headers.set("origin", new URL(request.url).origin);
  }
  return new Request(request, { headers });
}
