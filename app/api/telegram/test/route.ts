import { NextResponse } from "next/server";
import { sendTestMessage } from "@/src/lib/rextora/telegramService";
import { denyUnlessPermitted } from "@/src/lib/rextora/auth/requireUser";

export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "settings:write");
  if (denied) return denied;
  return NextResponse.json(await sendTestMessage());
}
