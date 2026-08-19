export type MemoryKind =
  | "approved_goal"
  | "approved_plan"
  | "plan_diff"
  | "completed_task"
  | "actual_result"
  | "failure_reason"
  | "verified_lesson"
  | "strategy_reference"
  | "research_reference";

export type MemoryEvidenceType =
  | "job"
  | "run"
  | "paper_session"
  | "strategy"
  | "plan"
  | "task"
  | "event";

export interface MemoryEvidenceRef {
  type: MemoryEvidenceType;
  id: string;
}

export interface VerifiedMemoryRecord {
  memoryId: string;
  sessionId: string;
  kind: MemoryKind;
  statementKo: string;
  evidenceRefs: MemoryEvidenceRef[];
  verifiedAt: string;
  sourceEventId: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface MemoryIndexEntry {
  memoryId: string;
  kind: MemoryKind;
  statementKo: string;
  evidenceRefs: MemoryEvidenceRef[];
  verifiedAt: string;
  terms: string[];
}

export interface MemoryIndex {
  version: 1;
  sessionId: string;
  rebuiltAt: string;
  entries: MemoryIndexEntry[];
}
