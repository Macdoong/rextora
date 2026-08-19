/**
 * Reasoning artifact JSON schema parsing and normalization.
 */

import crypto from "node:crypto";
import type {
  ReasoningArtifact,
  ReasoningRiskLevel,
  ToolPlanItem,
  ToolPlanOnFailure,
  ToolPlanStepStatus,
} from "./reasoningTypes";

const RISK_LEVELS = new Set<ReasoningRiskLevel>([
  "low",
  "medium",
  "high",
  "blocked",
]);

const STEP_STATUSES = new Set<ToolPlanStepStatus>([
  "pending",
  "ready",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "blocked",
]);

const ON_FAILURE = new Set<ToolPlanOnFailure>(["abort", "continue", "retry_once"]);

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x)).filter(Boolean);
}

function asRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

function parseToolPlanItem(raw: unknown, index: number): ToolPlanItem | null {
  const obj = asRecord(raw);
  const toolId = asString(obj.toolId);
  if (!toolId) return null;
  const onFailureRaw = asString(obj.onFailure, "abort");
  const statusRaw = asString(obj.status, "pending");
  const requiresApproval = Boolean(obj.requiresApproval);
  // Providers must not pre-skip write steps. A skipped write in an approval
  // plan would otherwise approve with zero tool execution.
  const parsedStatus = STEP_STATUSES.has(statusRaw as ToolPlanStepStatus)
    ? (statusRaw as ToolPlanStepStatus)
    : "pending";
  const status =
    requiresApproval &&
    (parsedStatus === "skipped" || parsedStatus === "blocked")
      ? "pending"
      : parsedStatus;
  return {
    stepId: asString(obj.stepId, `step_${index + 1}`),
    toolId,
    arguments: asRecord(obj.arguments),
    dependsOn: Array.isArray(obj.dependsOn)
      ? obj.dependsOn.map((d) => asString(d)).filter(Boolean)
      : [],
    purpose: asString(obj.purpose),
    expectedResult: asString(obj.expectedResult),
    requiresApproval,
    executionOrder:
      typeof obj.executionOrder === "number"
        ? obj.executionOrder
        : index + 1,
    onFailure: ON_FAILURE.has(onFailureRaw as ToolPlanOnFailure)
      ? (onFailureRaw as ToolPlanOnFailure)
      : "abort",
    status,
  };
}

export function newReasoningId(): string {
  return `rsn_${crypto.randomBytes(8).toString("hex")}`;
}

export function parseReasoningJson(
  raw: unknown,
  defaults: {
    sessionId: string | null;
    userIntent: string;
    provider: string;
    model: string;
    fallbackUsed?: boolean;
  },
): { artifact: ReasoningArtifact | null; issues: string[] } {
  const issues: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { artifact: null, issues: ["JSON 루트가 객체가 아닙니다."] };
  }
  const obj = raw as Record<string, unknown>;

  const goal = asString(obj.goal);
  const decision = asString(obj.decision);
  const decisionReason = asString(obj.decisionReason);
  const recommendedAction = asString(obj.recommendedAction);
  const currentStateSummary = asString(obj.currentStateSummary);

  if (!goal) issues.push("goal 필수");
  if (!decision) issues.push("decision 필수");
  if (!decisionReason) issues.push("decisionReason 필수");
  if (!recommendedAction) issues.push("recommendedAction 필수");

  const confidence = Math.min(1, Math.max(0, asNumber(obj.confidence, 0)));
  const riskRaw = asString(obj.riskLevel, "medium");
  const riskLevel = RISK_LEVELS.has(riskRaw as ReasoningRiskLevel)
    ? (riskRaw as ReasoningRiskLevel)
    : "medium";
  if (!RISK_LEVELS.has(riskRaw as ReasoningRiskLevel)) {
    issues.push("riskLevel 값이 유효하지 않음");
  }

  const toolPlanRaw = Array.isArray(obj.toolPlan) ? obj.toolPlan : [];
  const toolPlan: ToolPlanItem[] = [];
  toolPlanRaw.forEach((item, i) => {
    const parsed = parseToolPlanItem(item, i);
    if (parsed) toolPlan.push(parsed);
    else issues.push(`toolPlan[${i}] 파싱 실패`);
  });

  if (issues.length > 0 && !goal && !decision) {
    return { artifact: null, issues };
  }

  const artifact: ReasoningArtifact = {
    reasoningId: asString(obj.reasoningId, newReasoningId()),
    sessionId: asString(obj.sessionId) || defaults.sessionId,
    goal,
    userIntent: asString(obj.userIntent, defaults.userIntent),
    confidence,
    currentStateSummary,
    verifiedFactRefs: asStringArray(obj.verifiedFactRefs),
    assumptions: asStringArray(obj.assumptions),
    missingInformation: asStringArray(obj.missingInformation),
    decision,
    decisionReason,
    recommendedAction,
    toolPlan,
    requiresApproval: Boolean(obj.requiresApproval),
    riskLevel,
    blockedReason: asString(obj.blockedReason) || null,
    fallbackUsed: Boolean(obj.fallbackUsed ?? defaults.fallbackUsed),
    provider: asString(obj.provider, defaults.provider),
    model: asString(obj.model, defaults.model),
    createdAt: asString(obj.createdAt, new Date().toISOString()),
    conclusionKo: asString(obj.conclusionKo) || undefined,
    explanationKo: asString(obj.explanationKo) || undefined,
    requestHash: asString(obj.requestHash) || null,
    planId: asString(obj.planId) || null,
  };

  return { artifact, issues };
}

export function extractJsonFromText(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // fenced ```json block
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) {
      try {
        return JSON.parse(fence[1].trim());
      } catch {
        return null;
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
