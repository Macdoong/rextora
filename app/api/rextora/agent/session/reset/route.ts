/**
 * POST /api/rextora/agent/session/reset
 * Clears and recreates an empty session — no execution.
 */

import { NextResponse } from "next/server";
import { resetAgentSession } from "@/src/lib/rextora/agent/v2/session/sessionStore";
import { sanitizeSessionId } from "@/src/lib/rextora/agent/v2/session/sessionPersistence";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { sessionId?: string };
    if (!body?.sessionId) {
      return NextResponse.json(
        { ok: false, error: "sessionId required" },
        { status: 400 },
      );
    }
    const id = sanitizeSessionId(body.sessionId);
    const session = resetAgentSession(id);
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SESSION_RESET_FAILED";
    const status = message === "INVALID_SESSION_ID" ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
