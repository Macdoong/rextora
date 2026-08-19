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

const SYSTEM_PROMPT = `You are Rextora AI, an AI Trading Employee embedded in a quantitative trading platform.
Your role: help a trader decide the next safe step using verified engine data.

Rules you must always follow:
1. Write ONLY in Korean.
2. Base analysis ONLY on the verified facts and the provided decision context. Never invent numbers.
3. Conversational style: 2–4 short sentences. Lead with a clear conclusion.
4. Explain what it means, why it matters, and why the recommended action is better than alternatives.
5. If decision context marks uncertainty, state it explicitly.
6. Never recommend starting live trading. Never recommend modifying SAFE strategy.
7. Never claim the agent started Paper, Live, Search, or Backtest.
8. End aligned with the single recommended action from the decision context.
9. Do not mention internal IDs, hashes, file paths, environment variables, or API keys.
10. Do not dump raw field grids. Write like a trusted colleague.`;

export function buildInterpretationPrompt(evidence: EvidencePackage): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  const priorTurns = evidence.history.slice(-6);
  for (const turn of priorTurns) {
    messages.push({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.content.slice(0, 280),
    });
  }

  const factLines = evidence.facts
    .slice(0, 20)
    .map((f) => `- ${f.labelKo}: ${f.value}`)
    .join("\n");

  const decision = evidence.decisionContext;
  const decisionBlock = decision
    ? [
        "결정 컨텍스트 (엔진이 검증 사실에서 확정 — 변경·날조 금지):",
        `- 결론: ${decision.conclusionKo}`,
        `- 설명: ${decision.explanationKo}`,
        `- 권장 행동: ${decision.recommendedActionKo}`,
        `- 대안 대비: ${decision.whyBetterThanAlternativesKo}`,
        `- 불확실성: ${decision.uncertaintyKo ?? "없음"}`,
        "",
      ].join("\n")
    : "";

  const userContent = [
    `사용자 질문: ${evidence.query.slice(0, 500)}`,
    `분석 의도: ${evidence.intentType}`,
    "",
    decisionBlock,
    "검증된 데이터 (참고용, 내부 ID는 답변에 쓰지 말 것):",
    factLines || "- 데이터 없음",
    "",
    "위 결정 컨텍스트와 검증 데이터만으로 한국어 대화형 해석을 작성하세요.",
    "형식: 결론 1문장 → 짧은 이유 1–2문장 → 권장 행동 1문장.",
  ].join("\n");

  messages.push({ role: "user", content: userContent });
  return messages;
}
