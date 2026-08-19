import crypto from "node:crypto";
import { canonicalizeForHash } from "../../canonicalCommandPayload";
import {
  PLAN_V2_SCHEMA_VERSION,
  type PlanV2,
  type PlanV2Diff,
  type PlanV2DiffEntry,
  type PlanV2Step,
} from "./planTypes";

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

export function meaningfulPlanHash(input: {
  goal: string;
  parameters: Record<string, unknown>;
  steps: PlanV2Step[];
}): string {
  const payload = canonicalizeForHash({
    goal: input.goal.trim(),
    parameters: input.parameters,
    steps: input.steps.map((step) => ({
      stepId: step.stepId,
      toolId: step.toolId,
      arguments: step.arguments,
      dependsOn: [...step.dependsOn].sort(),
      requiresApproval: step.requiresApproval,
    })),
  });
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 24);
}

export function createPlanV2(input: {
  sessionId: string;
  goal: string;
  parameters?: Record<string, unknown>;
  display?: Record<string, unknown>;
  steps?: PlanV2Step[];
  now?: string;
}): PlanV2 {
  const now = input.now ?? new Date().toISOString();
  const parameters = input.parameters ?? {};
  const steps = input.steps ?? [];
  return {
    schemaVersion: PLAN_V2_SCHEMA_VERSION,
    planId: id("plan"),
    sessionId: input.sessionId,
    revision: 1,
    status: "draft",
    goal: input.goal.trim(),
    parameters,
    display: input.display ?? {},
    steps,
    meaningfulHash: meaningfulPlanHash({ goal: input.goal, parameters, steps }),
    approvalId: null,
    supersedesPlanId: null,
    supersededByPlanId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function flatten(value: unknown, prefix = ""): Map<string, unknown> {
  const result = new Map<string, unknown>();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const path = prefix ? `${prefix}.${key}` : key;
      const nested = flatten((value as Record<string, unknown>)[key], path);
      for (const [nestedKey, nestedValue] of nested) result.set(nestedKey, nestedValue);
    }
    if (Object.keys(value as Record<string, unknown>).length === 0 && prefix) {
      result.set(prefix, value);
    }
  } else {
    result.set(prefix, value);
  }
  return result;
}

export function diffPlans(before: PlanV2, after: PlanV2): PlanV2Diff {
  const entries: PlanV2DiffEntry[] = [];
  for (const [meaningful, left, right] of [
    [true, { goal: before.goal, parameters: before.parameters, steps: before.steps }, { goal: after.goal, parameters: after.parameters, steps: after.steps }],
    [false, before.display, after.display],
  ] as const) {
    const a = flatten(left);
    const b = flatten(right);
    for (const path of new Set([...a.keys(), ...b.keys()])) {
      if (JSON.stringify(a.get(path)) !== JSON.stringify(b.get(path))) {
        entries.push({ path, before: a.get(path), after: b.get(path), meaningful });
      }
    }
  }
  const meaningfulChanged = before.meaningfulHash !== after.meaningfulHash;
  return {
    fromPlanId: before.planId,
    toPlanId: after.planId,
    meaningfulChanged,
    approvalInvalidated: meaningfulChanged && before.approvalId !== null,
    entries,
  };
}

export function modifyPlanV2(
  current: PlanV2,
  patch: {
    goal?: string;
    parameters?: Record<string, unknown>;
    display?: Record<string, unknown>;
    steps?: PlanV2Step[];
    now?: string;
  },
): { plan: PlanV2; diff: PlanV2Diff } {
  const next: PlanV2 = {
    ...current,
    revision: current.revision + 1,
    goal: patch.goal?.trim() ?? current.goal,
    parameters: patch.parameters
      ? { ...current.parameters, ...patch.parameters }
      : current.parameters,
    display: patch.display ? { ...current.display, ...patch.display } : current.display,
    steps: patch.steps ?? current.steps,
    updatedAt: patch.now ?? new Date().toISOString(),
  };
  next.meaningfulHash = meaningfulPlanHash(next);
  const diff = diffPlans(current, next);
  if (diff.meaningfulChanged) {
    next.approvalId = null;
    next.status = "draft";
  }
  return { plan: next, diff };
}

export function approvePlanV2(plan: PlanV2, approvalId = id("approval")): PlanV2 {
  return { ...plan, status: "approved", approvalId, updatedAt: new Date().toISOString() };
}

export function supersedePlanV2(
  current: PlanV2,
  replacement: PlanV2,
): { previous: PlanV2; replacement: PlanV2 } {
  if (current.sessionId !== replacement.sessionId) throw new Error("SESSION_MISMATCH");
  return {
    previous: {
      ...current,
      status: "superseded",
      approvalId: null,
      supersededByPlanId: replacement.planId,
      updatedAt: new Date().toISOString(),
    },
    replacement: { ...replacement, supersedesPlanId: current.planId },
  };
}

export function comparePlans(left: PlanV2, right: PlanV2): PlanV2Diff {
  return diffPlans(left, right);
}
