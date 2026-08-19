/**
 * Model discovery for OpenAI / Gemini — SERVER-SIDE ONLY.
 */

import { resolveProviderApiKey } from "./providerCredentialStore";
import type { AiProviderId, ProviderModelInfo } from "./providerTypes";
import { OPENAI_RECOMMENDED_MODEL, GEMINI_FALLBACK_STABLE } from "./providerTypes";
import { readUpstreamJson } from "./safeUpstreamJson";

type CatalogCache = {
  expiresAt: number;
  models: ProviderModelInfo[];
};

const cache = new Map<AiProviderId, CatalogCache>();
const TTL_MS = 10 * 60 * 1000;

const OPENAI_BLOCK =
  /embedding|whisper|tts|realtime|audio|image|dall-e|moderation|transcribe|search|codex-mini/i;
const GEMINI_BLOCK =
  /embedding|aqa|imagen|tts|audio|vision-only|gecko|text-embedding|-image|image-generation/i;

export function invalidateProviderModelCache(provider?: AiProviderId): void {
  if (provider) cache.delete(provider);
  else cache.clear();
}

function openaiLabel(id: string): string {
  if (id === OPENAI_RECOMMENDED_MODEL) return "GPT-5 mini (권장)";
  if (id.includes("nano")) return `${id} (경량)`;
  return id;
}

function geminiLabel(id: string): string {
  if (id === GEMINI_FALLBACK_STABLE) return "Gemini 2.5 Flash (안정)";
  if (/preview|exp|experimental|latest/i.test(id)) return `${id} (미리보기)`;
  return id;
}

async function listOpenAiModels(apiKey: string): Promise<ProviderModelInfo[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI 모델 목록 조회 실패 (${response.status})`);
  }
  const body = await readUpstreamJson<{
    data?: Array<{ id?: string }>;
  }>(response);
  const ids = (body.data ?? [])
    .map((item) => item.id?.trim())
    .filter((id): id is string => Boolean(id))
    .filter((id) => !OPENAI_BLOCK.test(id))
    .filter((id) => /gpt|o[1-9]|chatgpt/i.test(id));

  const unique = [...new Set(ids)].sort((a, b) => {
    if (a === OPENAI_RECOMMENDED_MODEL) return -1;
    if (b === OPENAI_RECOMMENDED_MODEL) return 1;
    return a.localeCompare(b);
  });

  return unique.map((id) => ({
    id,
    labelKo: openaiLabel(id),
    provider: "openai" as const,
    supportsStructuredOutput: true,
    supportsGenerateContent: true,
    profile: /nano/i.test(id) ? ("lightweight" as const) : ("conversation" as const),
    recommendedDefault: id === OPENAI_RECOMMENDED_MODEL,
  }));
}

async function listGeminiModels(apiKey: string): Promise<ProviderModelInfo[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Gemini 모델 목록 조회 실패 (${response.status})`);
  }
  const body = await readUpstreamJson<{
    models?: Array<{
      name?: string;
      supportedGenerationMethods?: string[];
    }>;
  }>(response);

  const models: ProviderModelInfo[] = [];
  for (const item of body.models ?? []) {
    const raw = item.name?.replace(/^models\//, "").trim();
    if (!raw || GEMINI_BLOCK.test(raw)) continue;
    const methods = item.supportedGenerationMethods ?? [];
    if (!methods.includes("generateContent")) continue;
    models.push({
      id: raw,
      labelKo: geminiLabel(raw),
      provider: "gemini",
      supportsStructuredOutput: true,
      supportsGenerateContent: true,
      profile: /flash/i.test(raw) ? "conversation" : "conversation",
      recommendedDefault:
        raw === GEMINI_FALLBACK_STABLE ||
        (/flash/i.test(raw) && !/preview|exp|latest/i.test(raw)),
    });
  }

  models.sort((a, b) => {
    const score = (m: ProviderModelInfo) => {
      let s = 0;
      if (m.id === GEMINI_FALLBACK_STABLE) s += 100;
      if (/flash/i.test(m.id)) s += 50;
      if (/preview|exp|latest/i.test(m.id)) s -= 40;
      if (/pro/i.test(m.id)) s -= 10;
      return s;
    };
    return score(b) - score(a) || a.id.localeCompare(b.id);
  });

  // Ensure recommended flag uniqueness: first flash-stable wins.
  let marked = false;
  return models.map((m) => {
    if (!marked && m.recommendedDefault) {
      marked = true;
      return m;
    }
    return { ...m, recommendedDefault: false };
  });
}

export async function listProviderModels(
  provider: AiProviderId,
  options?: { forceRefresh?: boolean; apiKeyOverride?: string },
): Promise<ProviderModelInfo[]> {
  if (!options?.forceRefresh) {
    const hit = cache.get(provider);
    if (hit && Date.now() < hit.expiresAt) return hit.models;
  }
  const apiKey = options?.apiKeyOverride?.trim() || resolveProviderApiKey(provider);
  if (!apiKey) {
    throw new Error(
      provider === "openai"
        ? "OpenAI API 키가 설정되지 않았습니다."
        : "Gemini API 키가 설정되지 않았습니다.",
    );
  }
  const models =
    provider === "openai"
      ? await listOpenAiModels(apiKey)
      : await listGeminiModels(apiKey);
  cache.set(provider, { expiresAt: Date.now() + TTL_MS, models });
  return models;
}

export function preferDefaultModel(
  provider: AiProviderId,
  models: ProviderModelInfo[],
): string | null {
  if (provider === "openai") {
    const mini = models.find((m) => m.id === OPENAI_RECOMMENDED_MODEL);
    return mini?.id ?? null;
  }
  const recommended = models.find((m) => m.recommendedDefault);
  return recommended?.id ?? models[0]?.id ?? null;
}

export function isModelInCatalog(
  provider: AiProviderId,
  modelId: string,
  models: ProviderModelInfo[],
): boolean {
  return models.some((m) => m.id === modelId && m.provider === provider);
}
