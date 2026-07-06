import { NextResponse } from "next/server";
import { getApiStatus } from "@/src/lib/rextora/apiStatusService";

export function GET() {
  return NextResponse.json({ apiStatus: getApiStatus() });
}
