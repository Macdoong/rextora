import { NextResponse } from "next/server";
import { sendTestMessage } from "@/src/lib/rextora/telegramService";

export async function POST() {
  return NextResponse.json(await sendTestMessage());
}
