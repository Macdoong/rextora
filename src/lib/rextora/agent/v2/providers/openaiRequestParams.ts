/**
 * OpenAI request parameter helpers — model-family aware.
 * gpt-5 / o-series reject legacy max_tokens in favor of max_completion_tokens.
 */

export function openaiUsesMaxCompletionTokens(model: string): boolean {
  const id = model.trim().toLowerCase();
  return (
    id.startsWith("gpt-5") ||
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("o4") ||
    id.includes("gpt-5")
  );
}

/** Build the correct max output token field for the model family. */
export function openaiMaxOutputParam(
  model: string,
  maxOutputTokens: number,
): { max_completion_tokens: number } | { max_tokens: number } {
  if (openaiUsesMaxCompletionTokens(model)) {
    return { max_completion_tokens: maxOutputTokens };
  }
  return { max_tokens: maxOutputTokens };
}

/**
 * gpt-5 / o-series currently accept only the default temperature.
 * Omit the field instead of sending unsupported values.
 */
export function openaiTemperatureParam(
  model: string,
  temperature: number,
): { temperature: number } | Record<string, never> {
  if (openaiUsesMaxCompletionTokens(model)) {
    return {};
  }
  return { temperature };
}

/** gpt-5 / o-series reasoning effort when supported by the API. */
export function openaiReasoningEffortParam(
  model: string,
  effort: "low" | "medium" | "high",
): { reasoning_effort: "low" | "medium" | "high" } | Record<string, never> {
  if (!openaiUsesMaxCompletionTokens(model)) return {};
  return { reasoning_effort: effort };
}
