/**
 * Prompt builder — constructs the LLM prompt from sanitised evidence.
 *
 * SECURITY: This function must never include:
 * - API keys or secrets
 * - Raw filesystem paths
 * - Full strategy JSON files
 * - Personal or exchange credentials
 *
 * Input is bounded: max 20 facts + max 3 history turns + query (500 chars max).
 */

import type { EvidencePackage } from "../llmTypes";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are Rextora AI, an AI trading research assistant embedded in a quantitative trading platform.
Your role: interpret verified engine data to help a trader make informed decisions.

Rules you must always follow:
1. Write ONLY in Korean.
2. Base your analysis ONLY on the verified facts provided. Never invent numbers or estimates.
3. Be concise: 2 to 4 sentences.
4. If facts show risk, caution, or anomaly — flag it clearly.
5. Never recommend starting live trading. Never recommend modifying SAFE strategy.
6. Never claim the agent started Paper or Live. Paper/Live require explicit human approval.
7. End with exactly ONE specific next action the user can take within the platform.
8. Do not mention internal file paths, environment variables, or API keys.`;

export function buildInterpretationPrompt(evidence: EvidencePackage): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Include bounded prior conversation history (max 3 turns)
  const priorTurns = evidence.history.slice(-6); // 3 user + 3 agent = 6 messages max
  for (const turn of priorTurns) {
    messages.push({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.content.slice(0, 300), // bound each history message
    });
  }

  // Build the current user message
  const factLines = evidence.facts
    .slice(0, 20) // max 20 facts
    .map((f) => `- ${f.labelKo}: ${f.value}`)
    .join("\n");

  const userContent = [
    `사용자 질문: ${evidence.query.slice(0, 500)}`,
    `분석 의도: ${evidence.intentType}`,
    "",
    "검증된 데이터 (Rextora 시스템 저장소 기반):",
    factLines || "- 데이터 없음",
    "",
    "위 검증된 데이터만을 바탕으로 한국어 해석을 제공해 주세요.",
  ].join("\n");

  messages.push({ role: "user", content: userContent });
  return messages;
}
