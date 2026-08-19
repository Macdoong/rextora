import crypto from "node:crypto";
import type { ToolResult } from "../tools/toolResult";
import { appendAgentEvent, replayAgentEvents } from "../events/eventStore";
import type { AgentEvent, AgentEventType } from "../events/eventTypes";
import { mutateTaskLedger, readTaskLedger } from "../tasks/taskStore";
import { TERMINAL_TASK_STATES } from "../tasks/taskTypes";
import { reduceTaskWithEvent } from "./lifecycleReducer";
import { reflectOnTerminalEvent } from "../memory/reflection";

export function createAgentEvent(input: Omit<AgentEvent, "eventId" | "at"> & { eventId?: string; at?: string }): AgentEvent {
  const at = input.at ?? new Date().toISOString();
  return {
    ...input,
    at,
    eventId: input.eventId ?? `event_${crypto.createHash("sha256").update(`${input.sessionId}:${input.type}:${input.entityId ?? ""}:${at}`).digest("hex").slice(0, 20)}`,
  };
}

export function applyAgentEvent(event: AgentEvent): { applied: boolean } {
  const persisted = appendAgentEvent(event);
  if (!persisted.appended) return { applied: false };
  mutateTaskLedger(event.sessionId, (ledger) => ({
    ...ledger,
    tasks: ledger.tasks.map((task) => {
      if (event.taskId && task.taskId !== event.taskId) return task;
      const ownsEntity = !event.entityId || Object.values(task.engineRefs).includes(event.entityId);
      const isLatestActive = !TERMINAL_TASK_STATES.has(task.state) && task.taskId === [...ledger.tasks].reverse().find((item) => !TERMINAL_TASK_STATES.has(item.state))?.taskId;
      return ownsEntity || isLatestActive ? reduceTaskWithEvent(task, event) : task;
    }),
  }));
  reflectOnTerminalEvent(event);
  return { applied: true };
}

function lifecycleType(toolId: string, result: ToolResult): AgentEventType | null {
  if (toolId === "search.create") return result.ok ? "search.created" : "search.failed";
  if (toolId === "search.start") return result.ok ? "search.started" : "search.failed";
  if (toolId === "search.pause") return result.ok ? "search.paused" : "search.failed";
  if (toolId === "search.cancel") return result.ok ? "search.cancelled" : "search.failed";
  if (toolId === "backtest.run") return result.ok ? "backtest.completed" : "backtest.failed";
  if (toolId === "paper.prepare") return result.ok ? "paper.prepared" : "paper.failed";
  if (toolId === "paper.approve_start" || toolId === "paper.resume") return result.ok ? "paper.activated" : "paper.failed";
  if (toolId === "paper.pause") return result.ok ? "paper.paused" : "paper.failed";
  if (toolId === "paper.stop") return result.ok ? "paper.stopped" : "paper.failed";
  if (toolId === "results.promote") return result.ok ? "strategy.promoted" : "tool.failed";
  if (toolId === "strategy.rename") return result.ok ? "strategy.renamed" : "tool.failed";
  if (toolId === "strategy.archive") return result.ok ? "strategy.archived" : "tool.failed";
  if (toolId === "strategy.restore") return result.ok ? "strategy.restored" : "tool.failed";
  if (toolId === "strategy.delete") return result.ok ? "strategy.deleted" : "tool.failed";
  return null;
}

export function recordToolResultLifecycle(input: {
  sessionId: string | null;
  stepId: string;
  toolId: string;
  result: ToolResult;
}): void {
  if (!input.sessionId) return;
  const type = lifecycleType(input.toolId, input.result);
  if (!type) return;
  const data = input.result.data as Record<string, unknown> | null;
  const entityId = data && typeof data === "object"
    ? [data.jobId, data.runId, data.sessionId, data.strategyId].find((value) => typeof value === "string") as string | undefined
    : undefined;
  try {
    applyAgentEvent(createAgentEvent({
      eventId: `event_${crypto.createHash("sha256").update(`${input.sessionId}:${input.stepId}:${input.toolId}:${entityId ?? "none"}:${input.result.status}`).digest("hex").slice(0, 20)}`,
      type,
      sessionId: input.sessionId,
      entityId: entityId ?? null,
      taskId: null,
      source: "tool",
      payload: { stepId: input.stepId, toolId: input.toolId, ok: input.result.ok },
    }));
    if (type === "search.started" && entityId && process.env.NODE_ENV !== "test") {
      void import("./boundedLifecycleWatcher").then(({ startBoundedSearchLifecycleWatcher }) => {
        startBoundedSearchLifecycleWatcher({
          sessionId: input.sessionId!,
          jobId: entityId,
          readStatus: async () => {
            const { getStrategySearchJobApi } = await import("@/src/lib/rextora/strategySearch/jobApiService");
            const job = getStrategySearchJobApi(entityId);
            return {
              status: job.status,
              progress: job.checkpoint?.completedIterations ?? null,
            };
          },
        });
      });
    }
  } catch {
    // Lifecycle observation must never break an otherwise valid tool result.
  }
}

export function recoverLifecycleFromEvents(sessionId: string): number {
  const ledger = readTaskLedger(sessionId);
  let tasks = ledger.tasks;
  const count = replayAgentEvents(sessionId, (event) => {
    tasks = tasks.map((task) => reduceTaskWithEvent(task, event));
  });
  if (count > 0) mutateTaskLedger(sessionId, (current) => ({ ...current, tasks }));
  return count;
}

export function reconcileAuthoritativeLifecycle(input: {
  sessionId: string;
  search?: Array<{ id: string; status: string; progress?: number }>;
  backtests?: Array<{ id: string; status: string }>;
  paper?: Array<{ id: string; status: string }>;
}): number {
  let applied = 0;
  const emit = (type: AgentEventType, entityId: string, payload: Record<string, unknown>) => {
    const result = applyAgentEvent(createAgentEvent({
      eventId: `reconcile_${crypto.createHash("sha256").update(`${type}:${entityId}:${JSON.stringify(payload)}`).digest("hex").slice(0, 20)}`,
      type, sessionId: input.sessionId, entityId, taskId: null, source: "reconciliation", payload,
    }));
    if (result.applied) applied += 1;
  };
  for (const item of input.search ?? []) {
    const type: AgentEventType = item.status === "completed" ? "search.completed" : item.status === "failed" ? "search.failed" : item.status === "cancelled" ? "search.cancelled" : item.status === "paused" ? "search.paused" : "search.progress";
    emit(type, item.id, { status: item.status, progress: item.progress ?? null });
  }
  for (const item of input.backtests ?? []) emit(item.status === "failed" ? "backtest.failed" : "backtest.completed", item.id, { status: item.status });
  for (const item of input.paper ?? []) {
    const type: AgentEventType = item.status === "active" ? "paper.activated" : item.status === "paused" ? "paper.paused" : item.status === "stopped" ? "paper.stopped" : item.status === "failed" ? "paper.failed" : "paper.prepared";
    emit(type, item.id, { status: item.status });
  }
  return applied;
}
