import type { ReasoningArtifact, ToolPlanItem } from "../reasoning/reasoningTypes";
import {
  approvePlanV2,
  createPlanV2,
  findPlanV2,
  savePlanV2,
  supersedePlanV2,
} from "../planner";
import type { ToolResult } from "../tools/toolResult";
import { createTaskFromPlan } from "./taskOrchestrator";
import { mutateTaskLedger, readTaskLedger } from "../tasks/taskStore";
import { TERMINAL_TASK_STATES, type EmployeeTaskState } from "../tasks/taskTypes";
import { diffPlans } from "../planner";
import { rememberApprovedPlan } from "../memory";

function taskSteps(plan: ToolPlanItem[]) {
  return plan.map((step) => ({
    stepId: step.stepId,
    toolId: step.toolId,
    arguments: step.arguments,
    dependsOn: step.dependsOn,
    requiresApproval: step.requiresApproval,
  }));
}

export function persistReasoningProposal(
  sessionId: string,
  artifact: ReasoningArtifact,
): void {
  if (!artifact.requiresApproval || artifact.toolPlan.length === 0) return;
  const plan = createPlanV2({
    sessionId,
    goal: artifact.goal,
    parameters: { requestHash: artifact.requestHash ?? null },
    display: { conclusionKo: artifact.conclusionKo ?? artifact.decision },
    steps: taskSteps(artifact.toolPlan),
  });
  artifact.planId = plan.planId;
  artifact.requestHash = plan.meaningfulHash;
  savePlanV2(plan);

  const ledger = readTaskLedger(sessionId);
  const activeEngineTask = ledger.tasks.find(
    (task) => task.writeTask && !TERMINAL_TASK_STATES.has(task.state) && task.state !== "awaiting_approval",
  );
  if (activeEngineTask) {
    const exactControl = artifact.toolPlan.find(
      (step) =>
        ((["search.cancel", "search.pause", "search.start"].includes(step.toolId) &&
          step.arguments.jobId === activeEngineTask.engineRefs.searchJobId) ||
         (["paper.approve_start", "paper.pause", "paper.resume", "paper.stop"].includes(step.toolId) &&
          step.arguments.sessionId === activeEngineTask.engineRefs.paperSessionId)),
    );
    if (!exactControl) return;
    const previousPlan = findPlanV2(sessionId, activeEngineTask.planId);
    if (previousPlan) {
      const superseded = supersedePlanV2(previousPlan, plan);
      savePlanV2(superseded.previous);
      savePlanV2(superseded.replacement);
    }
    mutateTaskLedger(sessionId, (current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.taskId === activeEngineTask.taskId
          ? {
              ...task,
              planId: plan.planId,
              planHash: plan.meaningfulHash,
              idempotencyKey: `plan:${plan.planId}`,
              state: "awaiting_approval" as const,
              revision: task.revision + 1,
              steps: taskSteps(artifact.toolPlan).map((step) => ({
                ...step,
                status: "pending" as const,
                resultRef: null,
              })),
              updatedAt: new Date().toISOString(),
            }
          : task,
      ),
    }));
    return;
  }
  const activePending = ledger.tasks.filter(
    (task) => task.state === "awaiting_approval",
  );
  if (activePending.length > 0) {
    mutateTaskLedger(sessionId, (current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.state === "awaiting_approval"
          ? { ...task, state: "cancelled" as const, revision: task.revision + 1, updatedAt: new Date().toISOString() }
          : task,
      ),
    }));
  }
  createTaskFromPlan(plan, `plan:${plan.planId}`, readTaskLedger(sessionId));
}

export function persistApprovedExecution(input: {
  sessionId: string;
  planId: string | null;
  approvalId: string | null;
  ok: boolean;
  jobId: string | null;
  runId: string | null;
  paperSessionId: string | null;
  executedSteps?: Array<{ stepId: string; result: ToolResult }>;
}): void {
  if (!input.planId) return;
  const plan = findPlanV2(input.sessionId, input.planId);
  if (plan && input.approvalId) {
    const approved = approvePlanV2(plan, input.approvalId);
    savePlanV2(approved);
    const previous = approved.supersedesPlanId
      ? findPlanV2(input.sessionId, approved.supersedesPlanId)
      : null;
    try {
      if (process.env.NODE_ENV !== "test" || process.env.REXTORA_AGENT_MEMORY_DIR) {
        rememberApprovedPlan(approved, previous ? diffPlans(previous, approved) : null);
      }
    } catch {
      // Memory observation must not invalidate a correctly approved execution.
    }
  }
  mutateTaskLedger(input.sessionId, (ledger) => ({
    ...ledger,
    tasks: ledger.tasks.map((task) => {
      if (task.planId !== input.planId || TERMINAL_TASK_STATES.has(task.state)) return task;
      const hasMonitorRef = Boolean(input.jobId || input.paperSessionId);
      const state: EmployeeTaskState = input.ok
        ? hasMonitorRef ? "monitoring" : input.runId ? "analyzing" : "completed"
        : "failed";
      return {
        ...task,
        state,
        revision: task.revision + 1,
        engineRefs: {
          searchJobId: input.jobId,
          backtestRunId: input.runId,
          paperSessionId: input.paperSessionId,
        },
        steps: task.steps.map((step) => {
          const executed = input.executedSteps?.find((item) => item.stepId === step.stepId);
          if (!executed) return step;
          const data = executed.result.data as Record<string, unknown> | null;
          const resultRef = data && typeof data === "object"
            ? [data.jobId, data.runId, data.sessionId].find((value) => typeof value === "string") as string | undefined
            : undefined;
          return {
            ...step,
            status: executed.result.ok ? "completed" as const : "failed" as const,
            resultRef: resultRef ?? null,
          };
        }),
        updatedAt: new Date().toISOString(),
      };
    }),
  }));
}
