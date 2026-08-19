/**
 * Bounded OpenAI/Gemini task profiles — token budget and timeout by route mode.
 */

export type ReasoningTaskProfile =
  | "DIRECT_ANSWER"
  | "READ_AND_ANSWER_SIMPLE"
  | "READ_AND_ANSWER_COMPLEX"
  | "PLAN_AND_APPROVE"
  | "APPROVAL_CONTROL"
  | "SAFE_REFUSAL";

export function resolveReasoningTaskProfile(input: {
  conversationMode?: string | null;
  factCount?: number;
  readToolCount?: number;
}): ReasoningTaskProfile {
  const mode = input.conversationMode ?? "";
  if (mode === "PLAN_AND_APPROVE") return "PLAN_AND_APPROVE";
  if (mode === "READ_AND_ANSWER") {
    const heavy =
      (input.factCount ?? 0) > 10 ||
      (input.readToolCount ?? 0) > 2;
    return heavy ? "READ_AND_ANSWER_COMPLEX" : "READ_AND_ANSWER_SIMPLE";
  }
  return "DIRECT_ANSWER";
}

export function openaiCompletionBudget(
  profile: ReasoningTaskProfile,
  options?: { historyTurns?: number; model?: string },
): number {
  const historyTurns = options?.historyTurns ?? 0;
  const isGpt5 = /gpt-5|o[134]/.test((options?.model ?? "").toLowerCase());
  switch (profile) {
    case "DIRECT_ANSWER":
      // gpt-5-mini spends completion budget on reasoning tokens before JSON.
      // Undersized limits caused finish_reason=length → local fallback.
      if (isGpt5) return historyTurns > 0 ? 6500 : 4500;
      return historyTurns > 0 ? 1600 : 1200;
    case "READ_AND_ANSWER_SIMPLE":
      return 3500;
    case "READ_AND_ANSWER_COMPLEX":
      return 6500;
    case "PLAN_AND_APPROVE":
      return 4500;
    default:
      return 1200;
  }
}

export function providerTimeoutMs(
  profile: ReasoningTaskProfile,
  provider: "openai" | "gemini" | "local",
  model: string,
): number {
  if (provider === "openai" && /gpt-5|o[134]/.test(model.toLowerCase())) {
    if (profile.startsWith("READ_AND_ANSWER")) return 60_000;
    if (profile === "PLAN_AND_APPROVE") return 50_000;
    return 45_000;
  }
  if (profile.startsWith("READ_AND_ANSWER")) return 30_000;
  return 20_000;
}

export function openaiReasoningEffort(
  profile: ReasoningTaskProfile,
): "low" | "medium" | "high" {
  switch (profile) {
    case "READ_AND_ANSWER_COMPLEX":
    case "PLAN_AND_APPROVE":
      return "medium";
    case "READ_AND_ANSWER_SIMPLE":
      return "low";
    default:
      return "low";
  }
}

export function isProviderBackedReadProfile(
  profile: ReasoningTaskProfile | undefined,
): boolean {
  return (
    profile === "READ_AND_ANSWER_SIMPLE" ||
    profile === "READ_AND_ANSWER_COMPLEX"
  );
}
