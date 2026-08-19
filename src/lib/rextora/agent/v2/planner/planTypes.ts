export const PLAN_V2_SCHEMA_VERSION = 2 as const;

export type PlanV2Status =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "superseded"
  | "cancelled";

export interface PlanV2Step {
  stepId: string;
  toolId: string;
  arguments: Record<string, unknown>;
  dependsOn: string[];
  requiresApproval: boolean;
}

export interface PlanV2 {
  schemaVersion: typeof PLAN_V2_SCHEMA_VERSION;
  planId: string;
  sessionId: string;
  revision: number;
  status: PlanV2Status;
  goal: string;
  parameters: Record<string, unknown>;
  display: Record<string, unknown>;
  steps: PlanV2Step[];
  meaningfulHash: string;
  approvalId: string | null;
  supersedesPlanId: string | null;
  supersededByPlanId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanV2DiffEntry {
  path: string;
  before: unknown;
  after: unknown;
  meaningful: boolean;
}

export interface PlanV2Diff {
  fromPlanId: string;
  toPlanId: string;
  meaningfulChanged: boolean;
  approvalInvalidated: boolean;
  entries: PlanV2DiffEntry[];
}

