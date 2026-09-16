import { AUTH_SESSION_COOKIE } from "./authTypes";

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function requestHostname(request: Request): string | null {
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    const host = request.headers.get("host");
    if (!host) return null;
    return host.split(":")[0]?.toLowerCase() ?? null;
  }
}

function isLoopbackHost(hostname: string | null): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function canonicalOrigin(value: string): string | null {
  try {
    const origin = new URL(value).origin;
    if (!origin || origin === "null") return null;
    return origin;
  } catch {
    return null;
  }
}

type PublicOriginConfig =
  | { kind: "unset" }
  | { kind: "invalid" }
  | { kind: "set"; origin: string };

function configuredPublicOrigin(
  env: NodeJS.ProcessEnv = process.env,
): PublicOriginConfig {
  const raw = env.REXTORA_PUBLIC_ORIGIN?.trim();
  if (raw == null || raw === "") return { kind: "unset" };
  const origin = canonicalOrigin(raw);
  if (!origin) return { kind: "invalid" };
  return { kind: "set", origin };
}

function allowsMissingOrigin(request: Request): boolean {
  const requestHost = requestHostname(request);
  return isLoopbackHost(requestHost) || requestHost === "";
}

function isLocalSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  const requestHost = requestHostname(request);
  if (!origin) {
    return isLoopbackHost(requestHost) || requestHost === "";
  }
  const originHost = hostnameOf(origin);
  if (!originHost || !requestHost) return false;
  if (isLoopbackHost(originHost) && isLoopbackHost(requestHost)) return true;
  return originHost === requestHost;
}

/**
 * Same-origin gate for login and other mutations.
 * When REXTORA_PUBLIC_ORIGIN is set, the Origin header must match that
 * canonical origin exactly. Host headers are never trusted. Unset env
 * keeps the local hostname comparison unchanged.
 */
export function isSameOriginMutation(request: Request): boolean {
  const configured = configuredPublicOrigin();
  if (configured.kind === "invalid") return false;
  if (configured.kind === "set") {
    const origin = request.headers.get("origin");
    if (!origin) return allowsMissingOrigin(request);
    const requestOrigin = canonicalOrigin(origin);
    if (!requestOrigin) return false;
    return requestOrigin === configured.origin;
  }
  return isLocalSameOriginMutation(request);
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === AUTH_SESSION_COOKIE) {
      return decodeURIComponent(rest.join("=").trim());
    }
  }
  return null;
}

export function sessionCookieHeader(
  token: string,
  options: { secure: boolean; maxAgeSec: number },
): string {
  const parts = [
    `${AUTH_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, options.maxAgeSec)}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(secure: boolean): string {
  const parts = [
    `${AUTH_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function requestUsesHttps(request: Request): boolean {
  try {
    if (new URL(request.url).protocol === "https:") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function hasClientActorFields(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return ["requestedBy", "reviewedBy", "revokedBy"].some((key) => {
    const value = record[key];
    return value != null && String(value).trim() !== "";
  });
}
