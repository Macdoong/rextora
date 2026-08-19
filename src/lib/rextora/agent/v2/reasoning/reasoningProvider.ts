/**
 * Structured JSON reasoning provider — OpenAI / Gemini with local fallback signal.
 */

import { getProviderConfig, getProviderKey } from "../../providerConfig";
import type { SessionProviderSelection } from "../providers/providerTypes";
import {
  openaiMaxOutputParam,
  openaiReasoningEffortParam,
  openaiTemperatureParam,
} from "../providers/openaiRequestParams";
import {
  buildReasoningSystemPrompt,
  buildReasoningUserPrompt,
} from "./reasoningPrompt";
import type { ReasoningInput } from "./reasoningTypes";
import { extractJsonFromText, parseReasoningJson } from "./reasoningSchema";
import {
  openaiCompletionBudget,
  openaiReasoningEffort,
  providerTimeoutMs,
  type ReasoningTaskProfile,
} from "./reasoningTaskProfile";

const TIMEOUT_MS = 20_000;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export interface ReasoningProviderResult {
  ok: boolean;
  raw: unknown | null;
  provider: string;
  model: string;
  errorKo: string | null;
  latencyMs: number;
}

async function callOpenAiReasoning(
  input: ReasoningInput,
  model: string,
  signal: AbortSignal,
  profile: ReasoningTaskProfile,
): Promise<ReasoningProviderResult> {
  const key = getProviderKey("openai");
  if (!key) {
    return {
      ok: false,
      raw: null,
      provider: "openai",
      model,
      errorKo: "OpenAI API 키가 설정되지 않았습니다.",
      latencyMs: 0,
    };
  }

  const start = Date.now();
  const completionBudget = openaiCompletionBudget(profile, {
    historyTurns: input.history.length,
    model,
  });
  let response: Response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildReasoningSystemPrompt(profile) },
          { role: "user", content: buildReasoningUserPrompt(input, profile) },
        ],
        ...openaiMaxOutputParam(model, completionBudget),
        ...openaiTemperatureParam(model, 0.2),
        ...openaiReasoningEffortParam(model, openaiReasoningEffort(profile)),
        response_format: { type: "json_object" },
      }),
      signal,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        raw: null,
        provider: "openai",
        model,
        errorKo: "Reasoning 요청 시간 초과",
        latencyMs,
      };
    }
    return {
      ok: false,
      raw: null,
      provider: "openai",
      model,
      errorKo: "OpenAI 서버 연결 실패",
      latencyMs,
    };
  }

  const latencyMs = Date.now() - start;
  let body: {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    error?: { message?: string };
    usage?: {
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch (err) {
    return {
      ok: false,
      raw: null,
      provider: "openai",
      model,
      errorKo: err instanceof Error && err.name === "AbortError"
        ? "Reasoning 응답 시간 초과"
        : "OpenAI 응답 파싱 실패",
      latencyMs: Date.now() - start,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      raw: null,
      provider: "openai",
      model,
      errorKo: body.error?.message ?? `OpenAI 오류 (${response.status})`,
      latencyMs,
    };
  }

  const text = body.choices?.[0]?.message?.content ?? "";
  const finishReason = body.choices?.[0]?.finish_reason ?? null;
  const parsed = extractJsonFromText(text);
  if (!parsed) {
    const reasoningTokens =
      body.usage?.completion_tokens_details?.reasoning_tokens ?? null;
    let errorKo = "JSON 파싱 실패";
    if (finishReason === "length") {
      errorKo = "구조화 출력 토큰 한도 초과";
    } else if (!text.trim() && reasoningTokens) {
      errorKo = "추론 토큰만 사용되고 JSON 출력이 없음";
    }
    return {
      ok: false,
      raw: null,
      provider: "openai",
      model,
      errorKo,
      latencyMs,
    };
  }

  return { ok: true, raw: parsed, provider: "openai", model, errorKo: null, latencyMs };
}

async function callGeminiReasoning(
  input: ReasoningInput,
  model: string,
  signal: AbortSignal,
  profile: ReasoningTaskProfile,
): Promise<ReasoningProviderResult> {
  const key = getProviderKey("gemini");
  if (!key) {
    return {
      ok: false,
      raw: null,
      provider: "gemini",
      model,
      errorKo: "Gemini API 키가 설정되지 않았습니다.",
      latencyMs: 0,
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const start = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${buildReasoningSystemPrompt(profile)}\n\n${buildReasoningUserPrompt(input, profile)}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: openaiCompletionBudget(profile, {
            historyTurns: input.history.length,
            model,
          }),
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        raw: null,
        provider: "gemini",
        model,
        errorKo: "Reasoning 요청 시간 초과",
        latencyMs,
      };
    }
    return {
      ok: false,
      raw: null,
      provider: "gemini",
      model,
      errorKo: "Gemini 서버 연결 실패",
      latencyMs,
    };
  }

  const latencyMs = Date.now() - start;
  let body: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
    error?: { message?: string };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch (err) {
    return {
      ok: false,
      raw: null,
      provider: "gemini",
      model,
      errorKo: err instanceof Error && err.name === "AbortError"
        ? "Reasoning 응답 시간 초과"
        : "Gemini 응답 파싱 실패",
      latencyMs: Date.now() - start,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      raw: null,
      provider: "gemini",
      model,
      errorKo: body.error?.message ?? `Gemini 오류 (${response.status})`,
      latencyMs,
    };
  }

  const text =
    body.candidates?.[0]?.content?.parts?.find(
      (part) => part.thought !== true && typeof part.text === "string",
    )?.text ?? "";
  const parsed = extractJsonFromText(text);
  if (!parsed) {
    return {
      ok: false,
      raw: null,
      provider: "gemini",
      model,
      errorKo: "JSON 파싱 실패",
      latencyMs,
    };
  }

  return { ok: true, raw: parsed, provider: "gemini", model, errorKo: null, latencyMs };
}

export async function callReasoningProvider(
  input: ReasoningInput,
  options?: { sessionSelection?: SessionProviderSelection | null },
): Promise<ReasoningProviderResult & { parsed: ReturnType<typeof parseReasoningJson> }> {
  const config = getProviderConfig(options?.sessionSelection ?? null);
  const profile = input.taskProfile ?? "DIRECT_ANSWER";
  const activeProvider =
    config.provider === "openai" || config.provider === "gemini"
      ? config.provider
      : "local";
  const activeModel =
    activeProvider === "openai"
      ? config.openaiModel
      : activeProvider === "gemini"
        ? config.geminiModel
        : "none";
  const timeoutMs = providerTimeoutMs(profile, activeProvider, activeModel);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let result: ReasoningProviderResult | null = null;
  try {
    if (config.provider === "openai" && config.openaiConfigured) {
      result = await callOpenAiReasoning(
        input,
        config.openaiModel,
        controller.signal,
        profile,
      );
    } else if (config.provider === "gemini" && config.geminiConfigured) {
      result = await callGeminiReasoning(
        input,
        config.geminiModel,
        controller.signal,
        profile,
      );
    }
  } finally {
    clearTimeout(timer);
  }

  if (!result) {
    return {
      ok: false,
      raw: null,
      provider: "local",
      model: "none",
      errorKo: "구성된 Reasoning 제공자가 없습니다.",
      latencyMs: 0,
      parsed: { artifact: null, issues: ["no_provider"] },
    };
  }

  const parsed = result.ok
    ? parseReasoningJson(result.raw, {
        sessionId: input.sessionId,
        userIntent: input.query,
        provider: result.provider,
        model: result.model,
        fallbackUsed: false,
      })
    : { artifact: null, issues: [result.errorKo ?? "provider_failed"] };

  return { ...result, parsed };
}
