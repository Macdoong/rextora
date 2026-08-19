/**
 * GET /api/rextora/agent/session?sessionId=
 * PATCH /api/rextora/agent/session
 * Read/write only — no execution.
 */

import { NextResponse } from "next/server";
import {
  ensureAgentSession,
  patchAgentSession,
} from "@/src/lib/rextora/agent/v2/session/sessionStore";
import { sanitizeSessionId } from "@/src/lib/rextora/agent/v2/session/sessionPersistence";
import type { SessionPatchRequest } from "@/src/lib/rextora/agent/v2/session/sessionTypes";
import { readTaskLedger } from "@/src/lib/rextora/agent/v2/tasks";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: "sessionId required" },
        { status: 400 },
      );
    }
    const id = sanitizeSessionId(sessionId);
    const session = ensureAgentSession(id);
    const task = readTaskLedger(id).tasks.at(-1) ?? null;
    if (task) {
      session.taskQueueSummary = {
        pendingCommandCount: task.state === "awaiting_approval" ? 1 : 0,
        activeJobId: task.engineRefs.searchJobId,
        lastCommandId: task.taskId,
        summaryKo: ({
          idle: "현재 진행 중인 작업이 없습니다.",
          planning: "현재 계획을 준비하고 있습니다.",
          awaiting_approval: "현재 계획이 승인을 기다리고 있습니다.",
          executing: "승인된 작업을 실행하고 있습니다.",
          monitoring: "현재 작업의 진행 상황을 확인하고 있습니다.",
          analyzing: "완료된 결과를 분석할 준비가 됐습니다.",
          completed: "현재 작업이 완료됐습니다.",
          cancelled: "현재 작업이 취소됐습니다.",
          failed: "현재 작업을 완료하지 못했습니다.",
        } as const)[task.state],
      };
    }
    return NextResponse.json({ ok: true, session, source: "server" as const });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SESSION_READ_FAILED";
    const status = message === "INVALID_SESSION_ID" ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as SessionPatchRequest;
    if (!body?.sessionId || typeof body.updatedAt !== "string") {
      return NextResponse.json(
        { ok: false, error: "sessionId and updatedAt required" },
        { status: 400 },
      );
    }
    const result = patchAgentSession(body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "SESSION_PATCH_FAILED";
    const status = message === "INVALID_SESSION_ID" ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
