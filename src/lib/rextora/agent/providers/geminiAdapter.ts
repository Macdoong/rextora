/**
 * Gemini adapter — native fetch, no SDK dependency.
 * SERVER-SIDE ONLY. Keys never logged, forwarded, or included in errors.
 */

import { getProviderKey } from "../providerConfig";
import type { EvidencePackage, LLMProviderAdapter, LLMResult } from "../llmTypes";
import { buildInterpretationPrompt } from "./promptBuilder";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 12_000;
const MAX_OUTPUT_TOKENS = 250;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string };
}

function candidateText(body: GeminiResponse): string {
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  return (
    parts.find(
      (part) => part.thought !== true && typeof part.text === "string",
    )?.text?.trim() ?? ""
  );
}

function normalizeGeminiError(status: number, body: GeminiResponse): string {
  if (status === 400 && body.error?.status === "INVALID_ARGUMENT") return "Gemini 요청 오류: 입력이 올바르지 않습니다.";
  if (status === 401 || status === 403) return "Gemini 인증 오류: API 키를 확인하세요.";
  if (status === 429) return "Gemini 요청 한도 초과: 잠시 후 다시 시도하세요.";
  if (status >= 500) return "Gemini 서비스가 일시적으로 사용 불가합니다.";
  return `Gemini 응답 오류 (${status})`;
}

export class GeminiAdapter implements LLMProviderAdapter {
  readonly name = "gemini" as const;
  readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  private buildUrl(action: string): string {
    const key = getProviderKey("gemini") ?? "";
    return `${GEMINI_BASE}/${this.model}:${action}?key=${key}`;
  }

  async call(evidence: EvidencePackage, signal: AbortSignal): Promise<LLMResult> {
    const key = getProviderKey("gemini");
    if (!key) {
      return { ok: false, errorKo: "Gemini API 키가 설정되지 않았습니다.", provider: "gemini", retriable: false };
    }

    // Convert OpenAI-format messages to Gemini format
    const messages = buildInterpretationPrompt(evidence);
    const userMessage = messages.map((m) => m.content).join("\n\n");

    const start = Date.now();

    let response: Response;
    try {
      response = await fetch(this.buildUrl("generateContent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            temperature: 0.3,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, errorKo: "요청이 시간 초과되었습니다.", provider: "gemini", retriable: true };
      }
      return { ok: false, errorKo: "Gemini 서버에 연결할 수 없습니다.", provider: "gemini", retriable: true };
    }

    const latencyMs = Date.now() - start;

    let body: GeminiResponse;
    try {
      body = await response.json() as GeminiResponse;
    } catch {
      return { ok: false, errorKo: "Gemini 응답을 파싱할 수 없습니다.", provider: "gemini", retriable: false };
    }

    if (!response.ok) {
      return {
        ok: false,
        errorKo: normalizeGeminiError(response.status, body),
        provider: "gemini",
        retriable: response.status >= 500,
      };
    }

    const text = candidateText(body);
    if (!text) {
      return { ok: false, errorKo: "Gemini 응답에 텍스트가 없습니다.", provider: "gemini", retriable: false };
    }

    const usage = body.usageMetadata;
    return {
      ok: true,
      interpretation: {
        text,
        provider: "gemini",
        model: this.model,
        latencyMs,
        tokens: usage
          ? {
              input: usage.promptTokenCount ?? 0,
              output: usage.candidatesTokenCount ?? 0,
              total: usage.totalTokenCount ?? 0,
            }
          : undefined,
      },
    };
  }

  async healthCheck() {
    const key = getProviderKey("gemini");
    if (!key) {
      return { ok: false, provider: "gemini", model: this.model, latencyMs: 0, errorKo: "키 미설정" };
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(this.buildUrl("generateContent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "안녕" }] }],
          generationConfig: {
            maxOutputTokens: 16,
            temperature: 0,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      const body = await response.json() as GeminiResponse;
      const ok = response.ok && Boolean(candidateText(body));
      return {
        ok,
        provider: "gemini",
        model: this.model,
        latencyMs,
        errorKo: ok ? undefined : normalizeGeminiError(response.status, body),
      };
    } catch (err) {
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      const timedOut = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        provider: "gemini",
        model: this.model,
        latencyMs,
        errorKo: timedOut ? "타임아웃" : "연결 오류",
      };
    }
  }
}
