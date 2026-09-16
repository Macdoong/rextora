export const REXTORA_ROLES = ["ceo", "operator", "viewer"] as const;

export type RextoraRole = (typeof REXTORA_ROLES)[number];

export type RextoraPermission =
  | "research:run"
  | "backtest:run"
  | "paper:operate"
  | "settings:write"
  | "risk:write"
  | "live:request"
  | "live:approve"
  | "live:revoke"
  | "live:start"
  | "live:emergency_stop"
  | "credentials:manage"
  | "strategy:write"
  | "agent:operate";

export type RextoraUser = {
  userId: string;
  username: string;
  displayName: string;
  role: RextoraRole;
  passwordHash: string;
  createdAt: string;
  disabledAt?: string | null;
};

export type PublicRextoraUser = {
  userId: string;
  username: string;
  displayName: string;
  role: RextoraRole;
  createdAt: string;
  disabledAt: string | null;
};

export type AuthSessionRecord = {
  sessionId: string;
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type AuthenticatedUser = PublicRextoraUser;

export const AUTH_USERS_FILE = "auth-users.json";
export const AUTH_SESSIONS_FILE = "auth-sessions.json";
export const AUTH_LOGIN_ATTEMPTS_FILE = "auth-login-attempts.json";
export const AUTH_SESSION_COOKIE = "rextora_session";
export const AUTH_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const AUTH_ERROR = {
  unauthenticated: "unauthenticated",
  forbidden: "forbidden",
  invalid_credentials: "invalid_credentials",
  disabled: "disabled",
  rate_limited: "rate_limited",
  origin_rejected: "origin_rejected",
  client_actor_rejected: "client_actor_rejected",
} as const;

export function isRextoraRole(value: unknown): value is RextoraRole {
  return value === "ceo" || value === "operator" || value === "viewer";
}

export function toPublicUser(user: RextoraUser): PublicRextoraUser {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    disabledAt: user.disabledAt ?? null,
  };
}
