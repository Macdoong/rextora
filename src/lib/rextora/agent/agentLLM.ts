/**
 * Agent LLM orchestration — selects provider, calls adapter,
 * handles timeouts, validates output, manages in-process cache.
 *
 * SERVER-SIDE ONLY. Never imports client components.
 */

import { getProviderConfig } from "./providerConfig";
import { OpenAIAdapter } from "./providers/openaiAdapter";
import { GeminiAdapter } from "./providers/geminiAdapter";
import type { EvidencePackage, LLMInterpretation, LLMResult } from "./llmTypes";
import { LOCAL_ONLY_INTENTS } from "./llmTypes";
import type { AgentIntentType } from "./types";

const CALL_TIMEOUT_MS = 12_000;

// ─── In-process response cache ───────────────────────────────────────────────
// Keyed on hash of intentType + query + fact values. Max 60-second TTL.
// Never includes secret values in key.

interface CacheEntry {
  result: LLMInterpretation;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();

function buildCacheKey(evidence: EvidencePackage): string {
  const factStr = evidence.facts.map((f) => `${f.labelKo}:${f.value}`).join("|");
  return `${evidence.intentType}::${evidence.query}::${factStr}`;
}

function getCached(key: string): LLMInterpretation | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return { ...entry.result, cached: true };
}

function setCached(key: string, result: LLMInterpretation): void {
  responseCache.set(key, {
    result,
    expiresAt: Date.now() + 60_000, // 60-second TTL
  });
  // Prevent unbounded growth — keep max 100 entries
  if (responseCache.size > 100) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey !== undefined) responseCache.delete(firstKey);
  }
}

// ─── Provider selection ───────────────────────────────────────────────────────

function selectAdapter() {
  const config = getProviderConfig();
  if (config.provider === "openai" && config.openaiConfigured) {
    return new OpenAIAdapter(config.openaiModel);
  }
  if (config.provider === "gemini" && config.geminiConfigured) {
    return new GeminiAdapter(config.geminiModel);
  }
  return null; // local fallback
}

// ─── LLM response schema validation ──────────────────────────────────────────
// The LLM must return Korean text. Validate it isn't garbage.

function validateLLMText(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  if (text.length < 10 || text.length > 800) return false;
  // Must contain at least some Korean characters
  const koreanRegex = /[\uAC00-\uD7AF]/;
  return koreanRegex.test(text);
}

// ─── Main LLM call ────────────────────────────────────────────────────────────

export interface LLMCallResult {
  interpretationKo: string;
  source: "llm" | "local";
  providerMeta?: {
    provider: string;
    model: string;
    latencyMs: number;
    tokens?: { input: number; output: number; total: number };
    cached?: boolean;
    errorKo?: string;
  };
}

/**
 * Calls the configured LLM provider with the evidence package.
 * Returns the LLM interpretation if successful, or signals local fallback.
 * Never throws — all errors are normalised into the result.
 */
export async function callLLM(
  evidence: EvidencePackage,
  localFallback: string,
): Promise<LLMCallResult> {
  // 1. Skip LLM for local-only intents
  if (LOCAL_ONLY_INTENTS.includes(evidence.intentType as AgentIntentType)) {
    return { interpretationKo: localFallback, source: "local" };
  }

  // 2. Select adapter — null means no provider configured
  const adapter = selectAdapter();
  if (!adapter) {
    return { interpretationKo: localFallback, source: "local" };
  }

  // 3. Check cache
  const cacheKey = buildCacheKey(evidence);
  const cached = getCached(cacheKey);
  if (cached) {
    return {
      interpretationKo: cached.text,
      source: "llm",
      providerMeta: {
        provider: cached.provider,
        model: cached.model,
        latencyMs: cached.latencyMs,
        tokens: cached.tokens,
        cached: true,
      },
    };
  }

  // 4. Call provider with timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  let result: LLMResult;
  try {
    result = await adapter.call(evidence, controller.signal);
  } catch {
    clearTimeout(timer);
    return {
      interpretationKo: localFallback,
      source: "local",
      providerMeta: {
        provider: adapter.name,
        model: adapter.model,
        latencyMs: 0,
        errorKo: "예기치 않은 오류",
      },
    };
  }
  clearTimeout(timer);

  // 5. Handle failure — always fall back to local, never crash
  if (!result.ok) {
    return {
      interpretationKo: localFallback,
      source: "local",
      providerMeta: {
        provider: result.provider,
        model: adapter.model,
        latencyMs: 0,
        errorKo: result.errorKo,
      },
    };
  }

  // 6. Validate LLM output
  if (!validateLLMText(result.interpretation.text)) {
    return {
      interpretationKo: localFallback,
      source: "local",
      providerMeta: {
        provider: adapter.name,
        model: adapter.model,
        latencyMs: result.interpretation.latencyMs,
        errorKo: "LLM 응답 형식 오류",
      },
    };
  }

  // 7. Cache and return
  setCached(cacheKey, result.interpretation);
  return {
    interpretationKo: result.interpretation.text,
    source: "llm",
    providerMeta: {
      provider: result.interpretation.provider,
      model: result.interpretation.model,
      latencyMs: result.interpretation.latencyMs,
      tokens: result.interpretation.tokens,
    },
  };
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function runProviderHealthChecks() {
  const config = getProviderConfig();
  const results: Array<{
    provider: string;
    model: string;
    configured: boolean;
    ok?: boolean;
    latencyMs?: number;
    errorKo?: string;
  }> = [];

  if (config.openaiConfigured) {
    const adapter = new OpenAIAdapter(config.openaiModel);
    const check = await adapter.healthCheck();
    results.push({ ...check, configured: true });
  } else {
    results.push({ provider: "openai", model: config.openaiModel, configured: false });
  }

  if (config.geminiConfigured) {
    const adapter = new GeminiAdapter(config.geminiModel);
    const check = await adapter.healthCheck();
    results.push({ ...check, configured: true });
  } else {
    results.push({ provider: "gemini", model: config.geminiModel, configured: false });
  }

  return results;
}
