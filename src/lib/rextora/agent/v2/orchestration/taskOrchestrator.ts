import crypto from "node:crypto";
import type { PlanV2, PlanV2Step } from "../planner/planTypes";
import { readTaskLedger, writeTaskLedger } from "../tasks/taskStore";
import {
  TERMINAL_TASK_STATES,
  type EmployeeTask,
  type EmployeeTaskStep,
  type EmployeeTaskState,
  type TaskLedger,
} from "../tasks/taskTypes";

function isWriteStep(step: PlanV2Step): boolean {
  return !step.toolId.endsWith(".get") &&
    !step.toolId.endsWith(".list") &&
    !step.toolId.endsWith(".status") &&
    !step.toolId.endsWith(".detail") &&
    !step.toolId.endsWith(".summary");
}

export function orderTaskSteps(steps: EmployeeTaskStep[]): EmployeeTaskStep[] {
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: EmployeeTaskStep[] = [];
  function visit(step: EmployeeTaskStep): void {
    if (visited.has(step.stepId)) return;
    if (visiting.has(step.stepId)) throw new Error("TASK_DEPENDENCY_CYCLE");
    visiting.add(step.stepId);
    for (const dependency of step.dependsOn) {
      const target = byId.get(dependency);
      if (!target) throw new Error(`TASK_DEPENDENCY_MISSING:${dependency}`);
      visit(target);
    }
    visiting.delete(step.stepId);
    visited.add(step.stepId);
    ordered.push(step);
  }
  for (const step of steps) visit(step);
  return ordered;
}

export function createTaskFromPlan(
  plan: PlanV2,
  idempotencyKey: string,
  ledger = readTaskLedger(plan.sessionId),
): { ledger: TaskLedger; task: EmployeeTask; replayed: boolean } {
  const replay = ledger.tasks.find((task) => task.idempotencyKey === idempotencyKey);
  if (replay) return { ledger, task: replay, replayed: true };
  const writeTask = plan.steps.some(isWriteStep);
  if (
    writeTask &&
    ledger.tasks.some(
      (task) => task.writeTask && !TERMINAL_TASK_STATES.has(task.state),
    )
  ) {
    throw new Error("ACTIVE_WRITE_TASK_EXISTS");
  }
  const now = new Date().toISOString();
  const steps = orderTaskSteps(
    plan.steps.map((step) => ({
      ...step,
      status: "pending" as const,
      resultRef: null,
    })),
  );
  const task: EmployeeTask = {
    taskId: `task_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
    sessionId: plan.sessionId,
    planId: plan.planId,
    planHash: plan.meaningfulHash,
    revision: 1,
    state: plan.approvalId ? "executing" : "awaiting_approval",
    writeTask,
    steps,
    engineRefs: { searchJobId: null, backtestRunId: null, paperSessionId: null },
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };
  const saved = writeTaskLedger(
    { ...ledger, tasks: [...ledger.tasks, task] },
    ledger.revision,
  );
  return { ledger: saved, task, replayed: false };
}

export function exactEngineControlStep(input: {
  action: "cancel" | "pause";
  jobId: string;
}): EmployeeTaskStep {
  if (!input.jobId.trim()) throw new Error("JOB_ID_REQUIRED");
  return {
    stepId: `${input.action}_search`,
    toolId: `search.${input.action}`,
    arguments: { jobId: input.jobId },
    dependsOn: [],
    status: "pending",
    resultRef: null,
  };
}

export function cancelReplaceSteps(
  oldJobId: string,
  replacement: PlanV2Step[],
): EmployeeTaskStep[] {
  const cancel = exactEngineControlStep({ action: "cancel", jobId: oldJobId });
  return orderTaskSteps([
    cancel,
    ...replacement.map((step) => ({
      ...step,
      dependsOn: [...new Set([cancel.stepId, ...step.dependsOn])],
      status: "pending" as const,
      resultRef: null,
    })),
  ]);
}

export function reconcileTaskState(input: {
  task: EmployeeTask;
  searchStatus?: string | null;
  backtestStatus?: string | null;
  paperStatus?: string | null;
}): EmployeeTask {
  const statuses = [input.searchStatus, input.backtestStatus, input.paperStatus].filter(Boolean);
  let state: EmployeeTaskState = input.task.state;
  if (statuses.some((status) => status === "failed")) state = "failed";
  else if (statuses.some((status) => status === "cancelled" || status === "stopped")) state = "cancelled";
  else if (statuses.some((status) => status === "completed")) state = "analyzing";
  else if (statuses.some((status) => status === "running" || status === "queued" || status === "active")) state = "monitoring";
  else if (statuses.length === 0 && input.task.state === "executing") state = "executing";
  return state === input.task.state
    ? input.task
    : { ...input.task, state, revision: input.task.revision + 1, updatedAt: new Date().toISOString() };
}

