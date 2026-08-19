import type { AgentEvent } from "../events/eventTypes";
import { appendVerifiedMemory } from "./memoryStore";
import type { MemoryEvidenceRef, MemoryKind } from "./memoryTypes";

const REFLECTABLE = new Set([
  "search.completed", "search.failed", "backtest.completed", "backtest.failed",
  "paper.stopped", "paper.failed",
]);

function evidence(event: AgentEvent): MemoryEvidenceRef[] {
  if (!event.entityId) return [];
  const type = event.type.startsWith("search.") ? "job"
    : event.type.startsWith("backtest.") ? "run"
      : "paper_session";
  return [{ type, id: event.entityId }];
}

function reason(event: AgentEvent): string | null {
  const value = event.payload.reason ?? event.payload.error ?? event.payload.status;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : null;
}

export function reflectOnTerminalEvent(event: AgentEvent): number {
  if (!REFLECTABLE.has(event.type) || !event.entityId) return 0;
  const failed = event.type.endsWith(".failed");
  const kind: MemoryKind = failed ? "failure_reason" : "actual_result";
  const subject = event.type.startsWith("search.") ? "탐색"
    : event.type.startsWith("backtest.") ? "백테스트" : "모의매매";
  const verifiedReason = reason(event);
  const configurationHash = typeof event.payload.configurationHash === "string"
    ? event.payload.configurationHash.slice(0, 120)
    : null;
  const statementKo = failed
    ? verifiedReason
      ? `${subject} 실패가 확인되었습니다. 기록된 원인: ${verifiedReason}`
      : `${subject} 실패 상태가 확인되었으며, 구체 원인은 기록되지 않았습니다.`
    : `${subject}의 실제 종료 결과가 저장소 이벤트로 확인되었습니다.`;
  const result = appendVerifiedMemory({
    sessionId: event.sessionId,
    kind,
    statementKo,
    evidenceRefs: [...evidence(event), { type: "event", id: event.eventId }],
    verifiedAt: event.at,
    sourceEventId: event.eventId,
    metadata: { eventType: event.type, outcome: failed ? "failed" : "completed", configurationHash },
  });
  return result.appended ? 1 : 0;
}
