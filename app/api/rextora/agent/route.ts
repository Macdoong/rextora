import { NextResponse } from "next/server";
import { parseIntent } from "@/src/lib/rextora/agent/intentParser";
import { fetchFactsForIntent } from "@/src/lib/rextora/agent/agentDataFetcher";
import {
  buildAgentResponse,
  buildLocalInterpretation,
} from "@/src/lib/rextora/agent/agentResponseBuilder";
import {
  checkIntentSafety,
  checkDataAuthenticity,
} from "@/src/lib/rextora/agent/safetyGuard";
import { callLLM } from "@/src/lib/rextora/agent/agentLLM";
import type {
  AgentLifecycleContext,
  AgentRequest,
  AgentErrorResponse,
  AgentTurn,
} from "@/src/lib/rextora/agent/types";
import type { EvidencePackage } from "@/src/lib/rextora/agent/llmTypes";

function sanitizeContext(
  raw: AgentRequest["context"],
): AgentLifecycleContext | null {
  if (!raw || typeof raw !== "object") return null;
  const pick = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : null;
  return {
    route: pick(raw.route),
    strategyId: pick(raw.strategyId),
    runId: pick(raw.runId),
    jobId: pick(raw.jobId),
    paperSessionId: pick(raw.paperSessionId),
    symbol: pick(raw.symbol),
    timeframe: pick(raw.timeframe),
  };
}

/** POST /api/rextora/agent — AI Agent Control Plane entry point (read-only). */
export async function POST(request: Request) {
  let body: AgentRequest;
  try {
    body = await request.json();
  } catch {
    const err: AgentErrorResponse = {
      error: true,
      messageKo: "요청 형식이 올바르지 않습니다.",
    };
    return NextResponse.json(err, { status: 400 });
  }

  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    const err: AgentErrorResponse = {
      error: true,
      messageKo: "질문을 입력해 주세요.",
    };
    return NextResponse.json(err, { status: 400 });
  }

  if (query.length > 500) {
    const err: AgentErrorResponse = {
      error: true,
      messageKo: "질문이 너무 깁니다. 500자 이내로 입력해 주세요.",
    };
    return NextResponse.json(err, { status: 400 });
  }

  const context = sanitizeContext(body.context);

  // Bound history to max 5 turns
  const rawHistory = Array.isArray(body?.history) ? body.history : [];
  const history: AgentTurn[] = rawHistory
    .filter(
      (t) =>
        t && typeof t.role === "string" && typeof t.content === "string",
    )
    .slice(-10)
    .map((t) => ({
      role: t.role as "user" | "agent",
      content: String(t.content).slice(0, 300),
      timestamp:
        typeof t.timestamp === "string" ? t.timestamp : new Date().toISOString(),
    }));

  // 1. Parse intent
  const intent = parseIntent(query);

  // 2. Safety check — blocks write/execute intents immediately
  const safetyCheck = checkIntentSafety(intent.type);
  if (!safetyCheck.allowed) {
    return NextResponse.json({
      intentType: intent.type,
      facts: [],
      interpretationKo: safetyCheck.reasonKo ?? "허용되지 않는 작업입니다.",
      recommendedActionKo: "승인 게이트가 있는 화면에서 직접 진행하세요.",
      interpretationSource: "local",
      actions: [],
      scope: context ?? undefined,
      safetyBlocked: true,
      safetyReasonKo: safetyCheck.reasonKo,
      respondedAt: new Date().toISOString(),
    });
  }

  // 3. Fetch real data from stores
  const facts = await fetchFactsForIntent(intent.type, intent.params, context);

  // 4. Data authenticity check (skip for unknown/market — expected 0-1 facts)
  if (intent.type !== "unknown" && intent.type !== "market_status") {
    const authCheck = checkDataAuthenticity(facts.length);
    if (!authCheck.allowed) {
      return NextResponse.json({
        intentType: intent.type,
        facts: [],
        interpretationKo: authCheck.reasonKo ?? "데이터를 가져올 수 없습니다.",
        recommendedActionKo: "시스템 상태와 데이터 저장소를 확인하세요.",
        interpretationSource: "local" as const,
        actions: [],
        scope: context ?? undefined,
        safetyBlocked: false,
        respondedAt: new Date().toISOString(),
      });
    }
  }

  // 5. Build local interpretation (always available as fallback)
  const localInterpretation = buildLocalInterpretation(intent, facts);

  // 6. Call LLM with evidence package (falls back to local on any failure)
  const evidencePackage: EvidencePackage = {
    intentType: intent.type,
    query,
    facts,
    history: history.slice(-6),
  };

  const llmResult = await callLLM(evidencePackage, localInterpretation);

  // 7. Build final response
  const response = buildAgentResponse(intent, facts, llmResult, context);
  return NextResponse.json(response);
}
