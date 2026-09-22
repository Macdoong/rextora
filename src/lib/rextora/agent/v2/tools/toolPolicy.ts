/**
 * Tool policy gate — deny Live / Exchange / SAFE / unknown before adapter.
 */

import { FORBIDDEN_TOOL_IDS, type AnyToolDefinition } from "./toolTypes";
import type { ToolContext } from "./toolContext";

export type PolicyDecision =
  | { allow: true }
  | { allow: false; code: string; reasonKo: string };

const FORBIDDEN_ID_SET = new Set<string>(FORBIDDEN_TOOL_IDS);

const FORBIDDEN_PATTERNS = [
  /^live\./i,
  /^exchange\./i,
  /^order\./i,
  /^safe\./i,
  /binance/i,
  /place_order/i,
  /execute_trade/i,
  /start_live/i,
  /modify_safe/i,
];

export function isForbiddenToolId(toolId: string): boolean {
  if (FORBIDDEN_ID_SET.has(toolId)) return true;
  return FORBIDDEN_PATTERNS.some((re) => re.test(toolId));
}

export function evaluateToolPolicy(
  tool: AnyToolDefinition | null,
  toolId: string,
  ctx: ToolContext,
  input: Record<string, unknown>,
): PolicyDecision {
  if (isForbiddenToolId(toolId)) {
    return {
      allow: false,
      code: "POLICY_FORBIDDEN_TOOL",
      reasonKo: "Live·거래소·SAFE 도구는 등록·실행할 수 없습니다.",
    };
  }

  if (!tool) {
    return {
      allow: false,
      code: "POLICY_UNKNOWN_TOOL",
      reasonKo: `알 수 없는 도구입니다: ${toolId}`,
    };
  }

  // Hard deny any attempt to smuggle Live/SAFE/exchange flags
  const flat = JSON.stringify(input ?? {}).toLowerCase();
  if (
    flat.includes('"modifysafe"') ||
    flat.includes("modify_safe") ||
    (flat.includes("safe_v44") && flat.includes("mutate"))
  ) {
    return {
      allow: false,
      code: "POLICY_SAFE_MUTATION",
      reasonKo: "폐기된 기준 전략은 사용할 수 없습니다.",
    };
  }

  if (
    tool.executionMode === "write" &&
    (flat.includes("livetrading") ||
      flat.includes('"mode":"live"') ||
      flat.includes("start_live") ||
      flat.includes("execute_trade"))
  ) {
    return {
      allow: false,
      code: "POLICY_LIVE_BLOCKED",
      reasonKo: "실전·주문 실행은 도구 계층에서 차단됩니다.",
    };
  }

  if (tool.requiresApproval && !ctx.approved) {
    return {
      allow: false,
      code: "POLICY_APPROVAL_REQUIRED",
      reasonKo: "이 도구는 명시적 승인 후에만 실행할 수 있습니다.",
    };
  }

  if (tool.category === "settings" && tool.executionMode === "write") {
    return {
      allow: false,
      code: "POLICY_SETTINGS_WRITE_DENIED",
      reasonKo: "설정 변경 도구는 Phase 2에서 허용되지 않습니다.",
    };
  }

  return { allow: true };
}
