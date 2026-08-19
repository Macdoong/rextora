/**
 * Shadow-mode reasoning audit — compare V1 vs V2 without V2 execution.
 */

import fs from "node:fs";
import path from "node:path";
import type { AgentIntentType } from "../../types";
import type { AgentGoal } from "../../goalDetector";
import type { ReasoningArtifact, ShadowComparisonRecord } from "./reasoningTypes";

function auditRoot(): string {
  const override = process.env.REXTORA_REASONING_AUDIT_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "reasoning-shadow",
  );
}

function ensureAuditDir(): void {
  const dir = auditRoot();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function compareShadowReasoning(input: {
  query: string;
  v1Intent: AgentIntentType;
  v1Goal: AgentGoal | null;
  v1RequiresApproval: boolean;
  v1Tools: string[];
  v2: ReasoningArtifact;
}): ShadowComparisonRecord {
  const v2Tools = input.v2.toolPlan.map((s) => s.toolId);
  const differences: string[] = [];

  if (input.v1Intent !== input.v2.goal && input.v2.goal !== input.v1Goal) {
    differences.push(`goal:${input.v1Goal ?? input.v1Intent}->${input.v2.goal}`);
  }
  if (input.v1RequiresApproval !== input.v2.requiresApproval) {
    differences.push(
      `approval:${input.v1RequiresApproval}->${input.v2.requiresApproval}`,
    );
  }
  const v1Set = new Set(input.v1Tools);
  const v2Set = new Set(v2Tools);
  for (const t of v2Set) {
    if (!v1Set.has(t)) differences.push(`v2_tool_added:${t}`);
  }
  for (const t of v1Set) {
    if (!v2Set.has(t)) differences.push(`v1_tool_only:${t}`);
  }

  const safetyAgreement =
    input.v2.riskLevel !== "blocked" ||
    input.v1Intent === "start_live" ||
    input.v1Intent === "execute_trade" ||
    input.v1Intent === "modify_safe";

  return {
    at: new Date().toISOString(),
    query: input.query.slice(0, 200),
    v1Intent: input.v1Intent,
    v1Goal: input.v1Goal,
    v2Goal: input.v2.goal,
    v1RequiresApproval: input.v1RequiresApproval,
    v2RequiresApproval: input.v2.requiresApproval,
    v1Tools: input.v1Tools,
    v2Tools,
    safetyAgreement,
    v2Blocked: input.v2.riskLevel === "blocked",
    v2FallbackUsed: input.v2.fallbackUsed,
    v2Provider: input.v2.provider ?? null,
    v2Model: input.v2.model ?? null,
    v2RecommendationKo: input.v2.recommendedAction ?? null,
    differences,
  };
}

export function writeShadowAudit(record: ShadowComparisonRecord): void {
  ensureAuditDir();
  const file = path.join(auditRoot(), "shadow-comparisons.jsonl");
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

export function readShadowAuditLines(limit = 100): ShadowComparisonRecord[] {
  const file = path.join(auditRoot(), "shadow-comparisons.jsonl");
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => JSON.parse(l) as ShadowComparisonRecord);
}

export function summarizeShadowAudit(
  records: ShadowComparisonRecord[],
): {
  total: number;
  safetyAgreementRate: number;
  unknownTools: number;
  v2BlockedCount: number;
} {
  if (records.length === 0) {
    return {
      total: 0,
      safetyAgreementRate: 1,
      unknownTools: 0,
      v2BlockedCount: 0,
    };
  }
  const safetyAgreements = records.filter((r) => r.safetyAgreement).length;
  const v2BlockedCount = records.filter((r) => r.v2Blocked).length;
  return {
    total: records.length,
    safetyAgreementRate: safetyAgreements / records.length,
    unknownTools: 0,
    v2BlockedCount,
  };
}

/** Run batch shadow prompts (deterministic/local) for acceptance matrix. */
export function runShadowPromptMatrix(
  prompts: string[],
  evaluate: (query: string) => ShadowComparisonRecord,
): ShadowComparisonRecord[] {
  const records: ShadowComparisonRecord[] = [];
  for (const query of prompts) {
    records.push(evaluate(query));
    writeShadowAudit(records[records.length - 1]!);
  }
  return records;
}

export function getShadowAuditDir(): string {
  return auditRoot();
}
