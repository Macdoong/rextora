/**
 * Reasoning policy — defence-in-depth before tool plan acceptance.
 */

import { isForbiddenToolId } from "../tools/toolPolicy";
import { getToolById, listToolIds } from "../tools/registry";
import type { ReasoningArtifact, ReasoningInput } from "./reasoningTypes";
import { getReasoningConfig } from "./reasoningConfig";
import { isProviderBackedReadProfile } from "./reasoningTaskProfile";

const BLOCKED_GOAL_PATTERNS = [
  /live/i,
  /실전/i,
  /주문/i,
  /매수/i,
  /매도/i,
  /safe/i,
  /exchange/i,
  /binance/i,
];

const BLOCKED_TOOL_SNIPPETS = [
  "live.",
  "exchange.",
  "order.",
  "safe.",
  "modify_safe",
  "execute_trade",
  "start_live",
];

export interface ReasoningPolicyResult {
  allow: boolean;
  blocked: boolean;
  blockedReason: string | null;
  issues: string[];
}

export function evaluateReasoningPolicy(
  artifact: ReasoningArtifact,
  input: ReasoningInput,
): ReasoningPolicyResult {
  const issues: string[] = [];
  const registered = new Set(listToolIds());
  const { minConfidence } = getReasoningConfig();
  const conversationalRead =
    input.taskProfile === "DIRECT_ANSWER" ||
    isProviderBackedReadProfile(input.taskProfile);
  const readOnlyResponse =
    conversationalRead && artifact.toolPlan.length === 0 && !artifact.requiresApproval;

  if (
    (artifact.riskLevel === "blocked" || artifact.blockedReason) &&
    !readOnlyResponse
  ) {
    return {
      allow: false,
      blocked: true,
      blockedReason:
        artifact.blockedReason ?? "정책상 차단된 요청입니다.",
      issues: ["blocked_reason_present"],
    };
  }

  const goalText = `${artifact.goal} ${artifact.decision} ${artifact.userIntent}`;
  const hasWriteIntent =
    artifact.toolPlan.some((step) => {
      const tool = getToolById(step.toolId);
      return tool?.executionMode === "write";
    }) || artifact.requiresApproval;
  if (
    hasWriteIntent &&
    BLOCKED_GOAL_PATTERNS.some((re) => re.test(goalText))
  ) {
    return {
      allow: false,
      blocked: true,
      blockedReason:
        "Live·실주문·SAFE 변경 요청은 Reasoning Engine에서 허용되지 않습니다.",
      issues: ["blocked_goal_pattern"],
    };
  }

  if (artifact.confidence < minConfidence) {
    const hasGroundedAnswer =
      readOnlyResponse &&
      Boolean(artifact.conclusionKo?.trim() || artifact.decision.trim()) &&
      artifact.verifiedFactRefs.length > 0;
    if (!hasGroundedAnswer) {
      issues.push(`confidence_below_threshold:${artifact.confidence}`);
    }
  }

  for (const step of artifact.toolPlan) {
    if (isForbiddenToolId(step.toolId)) {
      return {
        allow: false,
        blocked: true,
        blockedReason: "등록되지 않거나 금지된 도구가 포함되어 있습니다.",
        issues: [`forbidden_tool:${step.toolId}`],
      };
    }
    if (!registered.has(step.toolId)) {
      issues.push(`unknown_tool:${step.toolId}`);
    }
    const tool = getToolById(step.toolId);
    if (tool && tool.requiresApproval && !artifact.requiresApproval) {
      issues.push(`write_without_approval:${step.toolId}`);
    }
    const flat = JSON.stringify(step.arguments).toLowerCase();
    if (BLOCKED_TOOL_SNIPPETS.some((s) => flat.includes(s))) {
      return {
        allow: false,
        blocked: true,
        blockedReason: "도구 인자에 금지된 실행 플래그가 포함되어 있습니다.",
        issues: ["blocked_arguments"],
      };
    }
  }

  // Lifecycle: backtest/paper require prior stage evidence when write tools present
  const writeTools = artifact.toolPlan.filter((s) => {
    const t = getToolById(s.toolId);
    return t?.executionMode === "write";
  });
  const requiredToolByIntent: Partial<Record<string, string>> = {
    prepare_search_plan: "search.create",
    prepare_backtest_plan: "backtest.run",
    prepare_paper_plan: "paper.prepare",
    search_status: "search.status",
    search_pause_request: "search.pause",
    search_resume_request: "search.start",
    paper_start_request: "paper.approve_start",
    paper_pause_request: "paper.pause",
    paper_resume_request: "paper.resume",
    paper_stop_request: "paper.stop",
    strategy_rename_request: "strategy.rename",
    strategy_archive_request: "strategy.archive",
    strategy_restore_request: "strategy.restore",
    strategy_delete_request: "strategy.delete",
    results_promote_request: "results.promote",
  };
  const requiredTool = requiredToolByIntent[input.intentType];
  const readToolsPrefetched = isProviderBackedReadProfile(input.taskProfile);
  if (
    requiredTool &&
    !readToolsPrefetched &&
    !artifact.toolPlan.some((step) => step.toolId === requiredTool)
  ) {
    issues.push(`missing_required_tool:${requiredTool}`);
  }
  if (writeTools.some((s) => s.toolId === "backtest.run")) {
    const hasStrategy =
      input.entities.strategyId ||
      input.context?.strategyId ||
      writeTools.some((s) => Boolean(s.arguments.strategyId));
    if (
      !hasStrategy &&
      input.lifecycleStage !== "backtest_needed" &&
      input.lifecycleStage !== "backtest_review" &&
      input.lifecycleStage !== "results_review"
    ) {
      issues.push("backtest_without_strategy");
    }
  }

  if (issues.some((i) => i.startsWith("unknown_tool"))) {
    return {
      allow: false,
      blocked: false,
      blockedReason: null,
      issues,
    };
  }

  if (issues.some((i) => i.startsWith("confidence_below"))) {
    return {
      allow: false,
      blocked: false,
      blockedReason: null,
      issues,
    };
  }

  if (issues.some((i) => i.startsWith("missing_required_tool"))) {
    return {
      allow: false,
      blocked: false,
      blockedReason: null,
      issues,
    };
  }

  return { allow: true, blocked: false, blockedReason: null, issues };
}

export function isSafetyBlockIntent(intentType: string): boolean {
  return (
    intentType === "start_live" ||
    intentType === "execute_trade" ||
    intentType === "modify_safe"
  );
}
