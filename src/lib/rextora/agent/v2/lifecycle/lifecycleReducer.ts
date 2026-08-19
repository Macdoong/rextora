import type { AgentEvent } from "../events/eventTypes";
import type { EmployeeTask, EmployeeTaskState } from "../tasks/taskTypes";

export function taskStateForEvent(type: AgentEvent["type"]): EmployeeTaskState | null {
  if (["approval.created"].includes(type)) return "awaiting_approval";
  if (["approval.approved", "tool.started", "search.created", "backtest.started"].includes(type)) return "executing";
  if (["search.started", "search.progress", "search.paused", "paper.prepared", "paper.activated", "paper.paused"].includes(type)) return "monitoring";
  if (["search.completed", "backtest.completed"].includes(type)) return "analyzing";
  if (["strategy.promoted", "paper.stopped"].includes(type)) return "completed";
  if (["search.cancelled", "approval.cancelled", "approval.expired", "plan.superseded"].includes(type)) return "cancelled";
  if (["tool.failed", "tool.denied", "search.failed", "backtest.failed", "paper.failed"].includes(type)) return "failed";
  return null;
}

export function reduceTaskWithEvent(task: EmployeeTask, event: AgentEvent): EmployeeTask {
  const nextState = event.type === "search.cancelled" && task.steps.some((step) => step.toolId === "search.create")
    ? "executing"
    : taskStateForEvent(event.type);
  const searchJobId = event.type.startsWith("search.") && event.entityId ? event.entityId : task.engineRefs.searchJobId;
  const backtestRunId = event.type.startsWith("backtest.") && event.entityId ? event.entityId : task.engineRefs.backtestRunId;
  const paperSessionId = event.type.startsWith("paper.") && event.entityId ? event.entityId : task.engineRefs.paperSessionId;
  if (!nextState && searchJobId === task.engineRefs.searchJobId && backtestRunId === task.engineRefs.backtestRunId && paperSessionId === task.engineRefs.paperSessionId) return task;
  return {
    ...task,
    state: nextState ?? task.state,
    revision: task.revision + 1,
    engineRefs: { searchJobId, backtestRunId, paperSessionId },
    updatedAt: event.at,
  };
}
