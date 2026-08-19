/**
 * Structured read-only connection canary for Settings — SERVER-SIDE ONLY.
 * Zero write tools. Never logs credentials.
 */

import type { AiProviderId } from "./providerTypes";
import {
  openaiMaxOutputParam,
  openaiTemperatureParam,
  openaiUsesMaxCompletionTokens,
} from "./openaiRequestParams";

export interface ProviderConnectionTestResult {
  ok: boolean;
  provider: AiProviderId;
  model: string;
  latencyMs: number;
  structuredOutputValid: boolean;
  writeToolAuditCount: number;
  errorKo: string | null;
  responseFingerprint: string | null;
}

async function testOpenAi(
  apiKey: string,
  model: string,
): Promise<ProviderConnectionTestResult> {
  const start = Date.now();
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              'Return JSON only: {"ok":true,"summary":"read-only canary"}',
          },
          {
            role: "user",
            content: "Confirm readiness with the required JSON. No tools.",
          },
        ],
        // gpt-5 family spends completion budget on reasoning_tokens first.
        ...openaiMaxOutputParam(
          model,
          openaiUsesMaxCompletionTokens(model) ? 400 : 80,
        ),
        ...openaiTemperatureParam(model, 0),
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(
        openaiUsesMaxCompletionTokens(model) ? 45_000 : 20_000,
      ),
    });
    const latencyMs = Date.now() - start;
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
      id?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        provider: "openai",
        model,
        latencyMs,
        structuredOutputValid: false,
        writeToolAuditCount: 0,
        errorKo: body.error?.message ?? `OpenAI 오류 (${response.status})`,
        responseFingerprint: null,
      };
    }
    const text = body.choices?.[0]?.message?.content ?? "";
    let structured = false;
    try {
      const parsed = JSON.parse(text) as { ok?: boolean };
      structured = parsed.ok === true;
    } catch {
      structured = false;
    }
    return {
      ok: structured,
      provider: "openai",
      model,
      latencyMs,
      structuredOutputValid: structured,
      writeToolAuditCount: 0,
      errorKo: structured ? null : "구조화 응답 검증 실패",
      responseFingerprint: body.id ? `openai:${body.id}` : null,
    };
  } catch (err) {
    return {
      ok: false,
      provider: "openai",
      model,
      latencyMs: Date.now() - start,
      structuredOutputValid: false,
      writeToolAuditCount: 0,
      errorKo:
        err instanceof Error && err.name === "TimeoutError"
          ? "연결 시간 초과"
          : "OpenAI 서버 연결 실패",
      responseFingerprint: null,
    };
  }
}

async function testGemini(
  apiKey: string,
  model: string,
): Promise<ProviderConnectionTestResult> {
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: 'Return JSON only: {"ok":true,"summary":"read-only canary"}',
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 80,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const latencyMs = Date.now() - start;
    const body = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      return {
        ok: false,
        provider: "gemini",
        model,
        latencyMs,
        structuredOutputValid: false,
        writeToolAuditCount: 0,
        errorKo: body.error?.message ?? `Gemini 오류 (${response.status})`,
        responseFingerprint: null,
      };
    }
    const text =
      body.candidates?.[0]?.content?.parts?.find(
        (part) => part.thought !== true && typeof part.text === "string",
      )?.text ?? "";
    let structured = false;
    try {
      const parsed = JSON.parse(text) as { ok?: boolean };
      structured = parsed.ok === true;
    } catch {
      structured = false;
    }
    return {
      ok: structured,
      provider: "gemini",
      model,
      latencyMs,
      structuredOutputValid: structured,
      writeToolAuditCount: 0,
      errorKo: structured ? null : "구조화 응답 검증 실패",
      responseFingerprint: structured ? `gemini:${model}:${latencyMs}` : null,
    };
  } catch (err) {
    return {
      ok: false,
      provider: "gemini",
      model,
      latencyMs: Date.now() - start,
      structuredOutputValid: false,
      writeToolAuditCount: 0,
      errorKo:
        err instanceof Error && err.name === "TimeoutError"
          ? "연결 시간 초과"
          : "Gemini 서버 연결 실패",
      responseFingerprint: null,
    };
  }
}

export async function runProviderConnectionTest(input: {
  provider: AiProviderId;
  apiKey: string;
  model: string;
}): Promise<ProviderConnectionTestResult> {
  const apiKey = input.apiKey.trim();
  const model = input.model.trim();
  if (!apiKey || !model) {
    return {
      ok: false,
      provider: input.provider,
      model,
      latencyMs: 0,
      structuredOutputValid: false,
      writeToolAuditCount: 0,
      errorKo: "API 키와 모델이 필요합니다.",
      responseFingerprint: null,
    };
  }
  if (input.provider === "openai") {
    return testOpenAi(apiKey, model);
  }
  return testGemini(apiKey, model);
}
