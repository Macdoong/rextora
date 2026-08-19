import type { PlanV2, PlanV2Diff } from "../planner/planTypes";
import { appendVerifiedMemory, readMemoryRecords } from "./memoryStore";
import { mapGoalToOperatorKo } from "../reasoning/userVisibleSanitizer";

export function rememberApprovedPlan(plan: PlanV2, diff?: PlanV2Diff | null): number {
  if (plan.status !== "approved" || !plan.approvalId) return 0;
  let appended = 0;
  const now = plan.updatedAt;
  if (appendVerifiedMemory({
    sessionId: plan.sessionId,
    kind: "approved_goal",
    statementKo: `사용자가 승인한 목표: ${mapGoalToOperatorKo(plan.goal)}`,
    evidenceRefs: [{ type: "plan", id: plan.planId }],
    verifiedAt: now,
    sourceEventId: null,
    metadata: { approvalId: plan.approvalId, meaningfulHash: plan.meaningfulHash },
  }).appended) appended += 1;
  if (appendVerifiedMemory({
    sessionId: plan.sessionId,
    kind: "approved_plan",
    statementKo: "사용자가 이 실행 계획을 명시적으로 승인했습니다.",
    evidenceRefs: [{ type: "plan", id: plan.planId }],
    verifiedAt: now,
    sourceEventId: null,
    metadata: { approvalId: plan.approvalId, meaningfulHash: plan.meaningfulHash },
  }).appended) appended += 1;
  if (diff && appendVerifiedMemory({
    sessionId: plan.sessionId,
    kind: "plan_diff",
    statementKo: diff.meaningfulChanged
      ? "이전 계획과 실제 실행 조건이 달라져 새 승인이 적용되었습니다."
      : "이전 계획과 표시만 달라 실제 실행 조건은 유지되었습니다.",
    evidenceRefs: [
      { type: "plan", id: diff.fromPlanId },
      { type: "plan", id: diff.toPlanId },
    ],
    verifiedAt: now,
    sourceEventId: null,
    metadata: { meaningfulChanged: diff.meaningfulChanged, approvalInvalidated: diff.approvalInvalidated },
  }).appended) appended += 1;
  return appended;
}

export function evaluateFailedConfigurationReuse(input: {
  sessionId: string;
  configurationHash: string;
  justification?: string | null;
}): { allowed: boolean; priorFailure: boolean; reasonKo: string | null } {
  const priorFailure = readMemoryRecords(input.sessionId).some((record) =>
    record.kind === "failure_reason" && record.metadata.configurationHash === input.configurationHash);
  if (!priorFailure) return { allowed: true, priorFailure: false, reasonKo: null };
  if (input.justification?.trim()) {
    return { allowed: true, priorFailure: true, reasonKo: `이전 실패 설정이지만 재검증 근거가 기록되었습니다: ${input.justification.trim().slice(0, 180)}` };
  }
  return { allowed: false, priorFailure: true, reasonKo: "이 설정은 이전에 실패했습니다. 다시 사용하려면 재검증 근거가 필요합니다." };
}
