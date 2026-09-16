import { NextResponse } from "next/server";
import { resolveRequestUser, unauthenticatedResponse } from "@/src/lib/rextora/auth/requireUser";
import { buildApiMeta } from "@/src/lib/rextora/apiResponse";

export async function GET(request: Request) {
  const start = Date.now();
  const user = resolveRequestUser(request);
  if (!user) return unauthenticatedResponse();
  return NextResponse.json({
    ok: true,
    data: { user },
    meta: buildApiMeta({ source: "auth-me", durationMs: Date.now() - start }),
  });
}
