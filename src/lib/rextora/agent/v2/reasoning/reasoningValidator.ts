/**
 * Reasoning artifact validator — schema, facts, tools, arguments.
 */

import { getToolById } from "../tools/registry";
import { validateAgainstSchema } from "../tools/toolValidator";
import type {
  ReasoningArtifact,
  ReasoningInput,
  ReasoningValidationResult,
} from "./reasoningTypes";
import { evaluateReasoningPolicy } from "./reasoningPolicy";
import { isProviderBackedReadProfile } from "./reasoningTaskProfile";

function factRefKey(labelKo: string, value: string): string {
  return `${labelKo}::${value}`;
}

export function buildFactRefIndex(
  facts: ReasoningInput["facts"],
): Set<string> {
  const set = new Set<string>();
  for (const f of facts) {
    set.add(factRefKey(f.labelKo, f.value));
    set.add(f.labelKo);
  }
  return set;
}

export function validateFactRefs(
  artifact: ReasoningArtifact,
  factIndex: Set<string>,
): string[] {
  const issues: string[] = [];
  for (const ref of artifact.verifiedFactRefs) {
    if (!ref.trim()) continue;
    const known =
      factIndex.has(ref) ||
      [...factIndex].some((k) => k.includes(ref) || ref.includes(k));
    if (!known) {
      issues.push(`fabricated_fact_ref:${ref}`);
    }
  }
  return issues;
}

export function validateToolPlanArguments(
  artifact: ReasoningArtifact,
): string[] {
  const issues: string[] = [];
  for (const step of artifact.toolPlan) {
    const tool = getToolById(step.toolId);
    if (!tool) {
      issues.push(`unknown_tool:${step.toolId}`);
      continue;
    }
    const validation = validateAgainstSchema(tool.inputSchema, step.arguments);
    if (!validation.ok) {
      issues.push(
        `invalid_args:${step.toolId}:${validation.issues.map((i) => i.path).join(",")}`,
      );
    }
    if (tool.requiresApproval !== step.requiresApproval) {
      // normalize expectation — write tools must require approval on step
      if (tool.requiresApproval && !step.requiresApproval) {
        issues.push(`approval_mismatch:${step.toolId}`);
      }
    }
    if (
      (tool.requiresApproval || step.requiresApproval) &&
      (step.status === "skipped" || step.status === "blocked")
    ) {
      issues.push(`write_step_pre_skipped:${step.toolId}`);
    }
  }
  return issues;
}

export function validateReasoningArtifact(
  artifact: ReasoningArtifact,
  input: ReasoningInput,
): ReasoningValidationResult {
  const issues: string[] = [];

  if (!artifact.goal) issues.push("missing_goal");
  if (!artifact.decision) issues.push("missing_decision");
  const conversationalProfile =
    input.taskProfile === "DIRECT_ANSWER" ||
    isProviderBackedReadProfile(input.taskProfile);
  if (
    !artifact.recommendedAction &&
    !(conversationalProfile && (artifact.conclusionKo?.trim() || artifact.decision.trim()))
  ) {
    issues.push("missing_recommended_action");
  }

  const factIndex = buildFactRefIndex(input.facts);
  issues.push(...validateFactRefs(artifact, factIndex));
  issues.push(...validateToolPlanArguments(artifact));

  const policy = evaluateReasoningPolicy(artifact, input);
  if (policy.blocked) {
    return {
      ok: false,
      artifact: {
        ...artifact,
        riskLevel: "blocked",
        blockedReason: policy.blockedReason,
        toolPlan: [],
        requiresApproval: false,
      },
      issues: [...issues, ...policy.issues],
      blocked: true,
      blockedReason: policy.blockedReason,
    };
  }

  issues.push(...policy.issues);

  const hasFabrication = issues.some((i) => i.startsWith("fabricated_fact_ref"));
  const hasUnknownTool = issues.some((i) => i.startsWith("unknown_tool"));
  const hasInvalidArgs = issues.some((i) => i.startsWith("invalid_args"));
  const lowConfidence = issues.some((i) => i.startsWith("confidence_below"));
  const hasApprovalViolation = issues.some(
    (issue) =>
      issue.startsWith("approval_mismatch") ||
      issue.startsWith("write_without_approval"),
  );

  const ok =
    policy.allow &&
    !hasFabrication &&
    !hasUnknownTool &&
    !hasInvalidArgs &&
    !hasApprovalViolation &&
    !lowConfidence;

  return {
    ok,
    artifact: ok ? artifact : null,
    issues,
    blocked: false,
    blockedReason: null,
  };
}
