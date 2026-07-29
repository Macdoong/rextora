/**
 * OpenAI adapter — native fetch, no SDK dependency.
 * SERVER-SIDE ONLY. Keys never logged, forwarded, or included in errors.
 */

import { getProviderKey } from "../providerConfig";
import type { EvidencePackage, LLMProviderAdapter, LLMResult } from "../llmTypes";
import { buildInterpretationPrompt } from "./promptBuilder";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 12_000;
const MAX_OUTPUT_TOKENS = 250;

interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: { message?: string; type?: string };
}

function normalizeOpenAIError(status: number, body: OpenAIChatResponse): string {
  if (status === 401) return "OpenAI 인증 오류: API 키를 확인하세요.";
  if (status === 429) return "OpenAI 요청 한도 초과: 잠시 후 다시 시도하세요.";
  if (status === 503 || status === 529) return "OpenAI 서비스가 일시적으로 사용 불가합니다.";
  if (body.error?.message) return `OpenAI 오류: 요청을 처리할 수 없습니다.`;
  return `OpenAI 응답 오류 (${status})`;
}

export class OpenAIAdapter implements LLMProviderAdapter {
  readonly name = "openai" as const;
  readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async call(evidence: EvidencePackage, signal: AbortSignal): Promise<LLMResult> {
    const key = getProviderKey("openai");
    if (!key) {
      return { ok: false, errorKo: "OpenAI API 키가 설정되지 않았습니다.", provider: "openai", retriable: false };
    }

    const messages = buildInterpretationPrompt(evidence);
    const start = Date.now();

    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.3,
        }),
        signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, errorKo: "요청이 시간 초과되었습니다.", provider: "openai", retriable: true };
      }
      return { ok: false, errorKo: "OpenAI 서버에 연결할 수 없습니다.", provider: "openai", retriable: true };
    }

    const latencyMs = Date.now() - start;

    let body: OpenAIChatResponse;
    try {
      body = await response.json() as OpenAIChatResponse;
    } catch {
      return { ok: false, errorKo: "OpenAI 응답을 파싱할 수 없습니다.", provider: "openai", retriable: false };
    }

    if (!response.ok) {
      return {
        ok: false,
        errorKo: normalizeOpenAIError(response.status, body),
        provider: "openai",
        retriable: response.status >= 500,
      };
    }

    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return { ok: false, errorKo: "OpenAI 응답에 텍스트가 없습니다.", provider: "openai", retriable: false };
    }

    return {
      ok: true,
      interpretation: {
        text,
        provider: "openai",
        model: this.model,
        latencyMs,
        tokens: body.usage
          ? {
              input: body.usage.prompt_tokens,
              output: body.usage.completion_tokens,
              total: body.usage.total_tokens,
            }
          : undefined,
      },
    };
  }

  async healthCheck() {
    const key = getProviderKey("openai");
    if (!key) {
      return { ok: false, provider: "openai", model: this.model, latencyMs: 0, errorKo: "키 미설정" };
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: "안녕" }],
          max_tokens: 3,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      const body = await response.json() as OpenAIChatResponse;
      const ok = response.ok && Boolean(body.choices?.[0]?.message?.content);
      return {
        ok,
        provider: "openai",
        model: this.model,
        latencyMs,
        errorKo: ok ? undefined : normalizeOpenAIError(response.status, body),
      };
    } catch (err) {
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      const timedOut = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        provider: "openai",
        model: this.model,
        latencyMs,
        errorKo: timedOut ? "타임아웃" : "연결 오류",
      };
    }
  }
}
