import { NextRequest, NextResponse } from "next/server";
import { recoverOrphanSearchJobs } from "@/src/lib/rextora/strategySearch/orphanJobRecovery";

function isLocalBootRequest(request: NextRequest): boolean {
  if (request.headers.get("x-rextora-boot") !== "1") return false;
  const host = request.headers.get("host") ?? "";
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
}

/** POST /api/rextora/internal/orphan-recovery — localhost boot hook only. */
export async function POST(request: NextRequest) {
  if (!isLocalBootRequest(request)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }
  const result = recoverOrphanSearchJobs();
  return NextResponse.json({ ok: true, ...result });
}
