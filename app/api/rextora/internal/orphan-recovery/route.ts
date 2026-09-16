import { NextRequest, NextResponse } from "next/server";
import { recoverOrphanSearchJobs } from "@/src/lib/rextora/strategySearch/orphanJobRecovery";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

function isLocalBootRequest(request: NextRequest): boolean {
  if (request.headers.get("x-rextora-boot") !== "1") return false;
  const host =
    request.headers.get("host") ||
    (() => {
      try {
        return new URL(request.url).host;
      } catch {
        return "";
      }
    })();
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
}

/** POST /api/rextora/internal/orphan-recovery — localhost boot hook only. */
export async function POST(request: NextRequest) {
  const denied = await denyUnlessPermitted(request, "research:run");
  if (denied) return denied;
  if (!isLocalBootRequest(request)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }
  const result = recoverOrphanSearchJobs();
  return NextResponse.json({ ok: true, ...result });
}
