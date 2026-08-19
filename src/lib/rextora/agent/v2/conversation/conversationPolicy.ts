import type { ConversationTopic, ConversationRouteMode } from "./conversationTypes";

/**
 * Provider is expected for ordinary conversational answers when reasoning is active.
 * Approval and safety refusals remain deterministic (zero provider).
 * Stable productKnowledge is grounding context, not the final response authority.
 */
export function modeRequiresProvider(
  mode: ConversationRouteMode,
  _topic: ConversationTopic,
): boolean {
  if (mode === "APPROVAL_CONTROL" || mode === "SAFE_REFUSAL") return false;
  if (mode === "CLARIFY_REFERENCE") return false;
  if (mode === "PLAN_AND_APPROVE" || mode === "READ_AND_ANSWER") return true;
  return mode === "DIRECT_ANSWER";
}

export function defaultClarification(topic: ConversationTopic): string {
  if (topic === "approval_control") {
    return "어떤 승인 계획을 진행할지 선택해 주세요.";
  }
  return "말씀하신 ‘이것’이 현재 화면의 항목인지, 렉스토라 앱 자체인지 알려 주세요.";
}

export function routeMayCreateApproval(mode: ConversationRouteMode): boolean {
  return mode === "PLAN_AND_APPROVE";
}

export function routeMayExecuteWrite(mode: ConversationRouteMode): boolean {
  return mode === "APPROVAL_CONTROL";
}
