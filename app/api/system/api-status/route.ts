import { NextResponse } from "next/server";
import { getApiStatus } from "@/src/lib/rextora/apiStatusService";
import { denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";

export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;

  return NextResponse.json({ apiStatus: getApiStatus() });
}
