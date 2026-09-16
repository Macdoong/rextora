import { NextResponse } from "next/server";
import { revokeSessionToken } from "@/src/lib/rextora/auth/sessionStore";
import {
  clearSessionCookieHeader,
  isSameOriginMutation,
  readSessionCookie,
  requestUsesHttps,
} from "@/src/lib/rextora/auth/requestSecurity";
import { originRejectedResponse } from "@/src/lib/rextora/auth/requireUser";
import { buildApiMeta } from "@/src/lib/rextora/apiResponse";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return originRejectedResponse();
  const start = Date.now();
  revokeSessionToken(readSessionCookie(request));
  const response = NextResponse.json({
    ok: true,
    data: { loggedOut: true },
    meta: buildApiMeta({ source: "auth-logout", durationMs: Date.now() - start }),
  });
  response.headers.append(
    "Set-Cookie",
    clearSessionCookieHeader(requestUsesHttps(request)),
  );
  return response;
}
