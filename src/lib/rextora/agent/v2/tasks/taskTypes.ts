export type EmployeeTaskState =
  | "idle"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "monitoring"
  | "analyzing"
  | "completed"
  | "cancelled"
  | "failed";

export interface EmployeeTaskStep {
  stepId: string;
  toolId: string;
  arguments: Record<string, unknown>;
  dependsOn: string[];
  status: "pending" | "executing" | "completed" | "cancelled" | "failed";
  resultRef: string | null;
}

export interface EmployeeTask {
  taskId: string;
  sessionId: string;
  planId: string;
  planHash: string;
  revision: number;
  state: EmployeeTaskState;
  writeTask: boolean;
  steps: EmployeeTaskStep[];
  engineRefs: {
    searchJobId: string | null;
    backtestRunId: string | null;
    paperSessionId: string | null;
  };
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLedger {
  sessionId: string;
  revision: number;
  tasks: EmployeeTask[];
}

export const TERMINAL_TASK_STATES = new Set<EmployeeTaskState>([
  "completed",
  "cancelled",
  "failed",
]);

