import type { PlanV2 } from "../planner/planTypes";

export interface PlanApproval {
  approvalId: string;
  planId: string;
  meaningfulHash: string;
  status: "active" | "approved" | "cancelled" | "expired" | "superseded";
  createdAt: string;
  resolvedAt: string | null;
}

export function approvalMatchesPlan(approval: PlanApproval, plan: PlanV2): boolean {
  return (
    approval.status === "active" &&
    approval.planId === plan.planId &&
    approval.meaningfulHash === plan.meaningfulHash
  );
}

export function invalidateApproval(
  approval: PlanApproval,
  reason: "cancelled" | "expired" | "superseded",
  now = new Date().toISOString(),
): PlanApproval {
  if (approval.status !== "active") return approval;
  return { ...approval, status: reason, resolvedAt: now };
}

