/**
 * Safety Guard — enforces SAFE strategy immutability and read-only agent rules.
 *
 * The agent NEVER:
 * - Modifies the SAFE strategy in any way
 * - Executes trades, paper or live
 * - Triggers strategy activation
 * - Bypasses approval gates
 *
 * This module is the last check before any action is returned to the UI.
 */

import type { AgentAction, AgentIntentType } from "./types";

// Intent types that are always safe — they only read data or deep-link.
const READ_ONLY_INTENTS: AgentIntentType[] = [
  "search_status",
  "search_pause_request",
  "search_resume_request",
  "explain_strategy",
  "backtest_summary",
  "explain_rejection",
  "compare_strategies",
  "compare_plans",
  "market_status",
  "risk_summary",
  "recommend_next",
  "first_run_help",
  "demo_overview",
  "paper_start_request",
  "paper_status",
  "paper_pause_request",
  "paper_resume_request",
  "paper_stop_request",
  "strategy_rename_request",
  "strategy_archive_request",
  "strategy_restore_request",
  "strategy_delete_request",
  "search_failure_explanation",
  "prepare_search_plan",
  "prepare_backtest_plan",
  "prepare_paper_plan",
  "research_workspace",
  "workspace_status",
  "research_analysis",
  "results_promote_request",
  "memory_recall",
  "follow_up_why",
  "explain_approval",
  "explain_waiting",
  "continue_session",
  "approve_pending",
  "cancel_pending",
  "unknown",
];

// Intent types that are explicitly blocked — write or execution operations.
const BLOCKED_INTENT_MESSAGES: Partial<Record<AgentIntentType, string>> = {
  modify_safe:
    "SAFE 전략은 보호된 기준 전략으로 에이전트가 수정할 수 없습니다. 이 전략은 절대 변경되지 않습니다.",
  execute_trade:
    "실전 매매는 에이전트가 자동으로 실행할 수 없습니다. 모든 주문은 명시적인 인간 승인 후에만 실행됩니다.",
  start_live:
    "실전 매매 시작은 에이전트가 실행할 수 없습니다. Live Trading 화면에서 승인 게이트를 직접 통과해야 합니다.",
};

export interface SafetyCheckResult {
  allowed: boolean;
  reasonKo?: string;
}

/**
 * Check if the intent is permitted.
 * Read-only intents pass. Write/execution intents are blocked with specific messages.
 */
export function checkIntentSafety(intent: AgentIntentType): SafetyCheckResult {
  const blockedMessage = BLOCKED_INTENT_MESSAGES[intent];
  if (blockedMessage) {
    return { allowed: false, reasonKo: blockedMessage };
  }
  if (READ_ONLY_INTENTS.includes(intent)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reasonKo: "이 작업은 에이전트가 자동으로 실행할 수 없습니다. 직접 승인이 필요합니다.",
  };
}

/**
 * Filter proposed actions to remove any that would violate safety rules.
 * - Live trading deep links are removed entirely
 * - Backtest and paper pages require approval flag
 */
export function filterSafeActions(actions: AgentAction[]): AgentAction[] {
  return actions
    .filter((a) => {
      if (a.href?.includes("/live-trading") || a.href?.includes("/live-execution")) {
        return false;
      }
      // Never allow action labels that imply autonomous execution
      const label = a.labelKo.toLowerCase();
      if (
        label.includes("실행") &&
        (label.includes("실전") || label.includes("live") || label.includes("주문"))
      ) {
        return false;
      }
      if (label.includes("safe") && (label.includes("수정") || label.includes("변경"))) {
        return false;
      }
      return true;
    })
    .map((a) => ({
      ...a,
      requiresApproval:
        a.href?.includes("/backtest") === true ||
        a.href?.includes("/paper-trading") === true ||
        a.requiresApproval,
    }));
}

/**
 * Check if a proposed query/response might be fabricating data.
 * Returns a warning if no real facts were found.
 */
export function checkDataAuthenticity(factCount: number): SafetyCheckResult {
  if (factCount === 0) {
    return {
      allowed: false,
      reasonKo: "실제 데이터를 가져올 수 없습니다. 현재 시스템 상태를 확인해 주세요.",
    };
  }
  return { allowed: true };
}
