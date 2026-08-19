export type AgentEventType =
  | "tool.started" | "tool.completed" | "tool.failed" | "tool.denied"
  | "search.created" | "search.started" | "search.progress" | "search.paused" | "search.cancelled" | "search.completed" | "search.failed"
  | "strategy.promoted" | "strategy.renamed" | "strategy.archived" | "strategy.restored" | "strategy.deleted"
  | "backtest.started" | "backtest.completed" | "backtest.failed"
  | "paper.prepared" | "paper.activated" | "paper.paused" | "paper.stopped" | "paper.failed"
  | "approval.created" | "approval.approved" | "approval.cancelled" | "approval.expired"
  | "plan.superseded";

export interface AgentEvent {
  eventId: string;
  type: AgentEventType;
  sessionId: string;
  entityId: string | null;
  taskId: string | null;
  at: string;
  source: "tool" | "engine_store" | "approval" | "planner" | "reconciliation";
  payload: Record<string, unknown>;
}
