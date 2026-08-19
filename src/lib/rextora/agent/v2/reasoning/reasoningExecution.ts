/**
 * Execute approved reasoning tool plans via Tool Registry only.
 */

import { executeTool } from "../tools/toolExecutor";
import { createToolContext } from "../tools/toolContext";
import type { ToolPlanItem } from "./reasoningTypes";
import type { ToolResult } from "../tools/toolResult";
import { buildExecutionSummaryFromPlan } from "./conversationalProse";
import { mapInternalErrorToOperatorKo } from "./userVisibleSanitizer";
import { recordToolResultLifecycle } from "../lifecycle";

export interface ToolPlanExecutionResult {
  ok: boolean;
  steps: Array<{
    stepId: string;
    toolId: string;
    result: ToolResult;
  }>;
  summaryKo: string;
  jobId: string | null;
  runId: string | null;
  sessionId: string | null;
}

function resolveArgRefs(
  args: Record<string, unknown>,
  outputs: Map<string, ToolResult>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.startsWith("$")) {
      const m = value.match(/^\$([^.]+)\.(.+)$/);
      if (m) {
        const [, stepId, field] = m;
        const prev = outputs.get(stepId);
        const data = prev?.data as Record<string, unknown> | undefined;
        if (data && field in data) {
          out[key] = data[field];
          continue;
        }
      }
    }
    out[key] = value;
  }
  return out;
}

export async function executeApprovedToolPlan(input: {
  plan: ToolPlanItem[];
  sessionId: string | null;
  approvalId: string | null;
}): Promise<ToolPlanExecutionResult> {
  const sorted = [...input.plan].sort(
    (a, b) => a.executionOrder - b.executionOrder,
  );
  const outputs = new Map<string, ToolResult>();
  const steps: ToolPlanExecutionResult["steps"] = [];
  let jobId: string | null = null;
  let runId: string | null = null;
  let sessionId: string | null = null;

  for (const step of sorted) {
    if (step.status === "skipped" || step.status === "blocked") continue;

    const unresolvedDeps = step.dependsOn.filter((d) => {
      const r = outputs.get(d);
      return !r?.ok;
    });
    if (unresolvedDeps.length > 0 && step.dependsOn.length > 0) {
      const fail = await executeTool({
        toolId: step.toolId,
        input: step.arguments,
        context: createToolContext({
          sessionId: input.sessionId,
          approved: true,
          approvalId: input.approvalId,
        }),
      });
      steps.push({ stepId: step.stepId, toolId: step.toolId, result: fail });
      if (step.onFailure === "abort") break;
      continue;
    }

    const resolvedArgs = resolveArgRefs(step.arguments, outputs);
    const result = await executeTool({
      toolId: step.toolId,
      input: resolvedArgs,
      context: createToolContext({
        sessionId: input.sessionId,
        approved: true,
        approvalId: input.approvalId,
      }),
    });
    outputs.set(step.stepId, result);
    steps.push({ stepId: step.stepId, toolId: step.toolId, result });
    recordToolResultLifecycle({
      sessionId: input.sessionId,
      stepId: step.stepId,
      toolId: step.toolId,
      result,
    });

    if (result.ok && result.data && typeof result.data === "object") {
      const d = result.data as Record<string, unknown>;
      if (typeof d.jobId === "string") jobId = d.jobId;
      if (typeof d.runId === "string") runId = d.runId;
      if (typeof d.sessionId === "string") sessionId = d.sessionId;
    }

    if (!result.ok && step.onFailure === "abort") break;
  }

  const expectedWriteSteps = input.plan.filter(
    (step) =>
      step.requiresApproval &&
      step.status !== "skipped" &&
      step.status !== "blocked",
  );
  // Empty success is forbidden when the approved plan contained write steps.
  // Providers previously marked paper.prepare as skipped, producing ok=true
  // with zero tool audits.
  if (steps.length === 0 && expectedWriteSteps.length > 0) {
    return {
      ok: false,
      steps: [],
      summaryKo:
        "승인된 계획의 실행 단계가 비어 있어 작업을 완료하지 못했습니다. 같은 조건으로 계획을 다시 준비해 주세요.",
      jobId: null,
      runId: null,
      sessionId: null,
    };
  }
  if (steps.length === 0 && input.plan.length > 0) {
    return {
      ok: false,
      steps: [],
      summaryKo:
        "승인된 계획에서 실행할 단계가 없었습니다. 계획을 다시 확인해 주세요.",
      jobId: null,
      runId: null,
      sessionId: null,
    };
  }

  const allOk = steps.length > 0 && steps.every((s) => s.result.ok);
  const last = steps[steps.length - 1];
  const summaryKo = allOk
    ? buildExecutionSummaryFromPlan(input.plan, {
        ok: allOk,
        steps,
        summaryKo: "",
        jobId,
        runId,
        sessionId,
      })
    : mapInternalErrorToOperatorKo(last?.result.errorMessage).operatorKo;

  return {
    ok: allOk,
    steps,
    summaryKo,
    jobId,
    runId,
    sessionId,
  };
}
