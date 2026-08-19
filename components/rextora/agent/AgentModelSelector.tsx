"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { safeFetchJson } from "@/src/lib/rextora/client/safeFetchJson";

export type AgentProviderId = "openai" | "gemini";

export interface AgentProviderSelection {
  provider: AgentProviderId;
  model: string;
}

interface ModelInfo {
  id: string;
  labelKo: string;
  recommendedDefault?: boolean;
}

interface PublicSettings {
  reasoningActive: boolean;
  emergencyDisabled: boolean;
  defaultProvider: AgentProviderId | null;
  openai: { configured: boolean; enabled: boolean; selectedModel: string | null };
  gemini: { configured: boolean; enabled: boolean; selectedModel: string | null };
}

const SESSION_KEY = "rextora.agent.providerSelection";

function loadSessionSelection(): AgentProviderSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentProviderSelection;
    if (
      (parsed.provider === "openai" || parsed.provider === "gemini") &&
      typeof parsed.model === "string" &&
      parsed.model.trim()
    ) {
      return { provider: parsed.provider, model: parsed.model.trim() };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveSessionSelection(selection: AgentProviderSelection | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!selection) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(selection));
  } catch {
    /* ignore */
  }
}

export function AgentModelSelector(props: {
  value: AgentProviderSelection | null;
  onChange: (next: AgentProviderSelection | null) => void;
  disabled?: boolean;
}) {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const onChangeRef = useRef(props.onChange);
  const valueRef = useRef(props.value);
  useEffect(() => {
    onChangeRef.current = props.onChange;
    valueRef.current = props.value;
  }, [props.onChange, props.value]);

  const provider =
    props.value?.provider ??
    settings?.defaultProvider ??
    (settings?.openai.configured ? "openai" : settings?.gemini.configured ? "gemini" : null);

  const loadModels = useCallback(async (p: AgentProviderId) => {
    setModelsLoading(true);
    try {
      const parsed = await safeFetchJson<{
        models?: ModelInfo[];
        error?: boolean;
        messageKo?: string;
      }>(`/api/rextora/settings/ai-providers/models?provider=${p}`);
      if (!parsed.ok || parsed.data.error) {
        setWarning(
          parsed.ok
            ? (parsed.data.messageKo ?? "모델 목록을 불러오지 못했습니다.")
            : parsed.messageKo,
        );
        return;
      }
      setModels(parsed.data.models ?? []);
      setWarning(null);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const parsed = await safeFetchJson<PublicSettings & { error?: boolean; messageKo?: string }>(
          "/api/rextora/settings/ai-providers",
        );
        if (cancelled) return;
        if (!parsed.ok || parsed.data.error) {
          setWarning(
            parsed.ok
              ? (parsed.data.messageKo ?? "공급자 상태를 불러오지 못했습니다.")
              : parsed.messageKo,
          );
          return;
        }
        const data = parsed.data;
        setSettings(data);

        const session = loadSessionSelection();
        if (session) {
          if (!valueRef.current) onChangeRef.current(session);
          void loadModels(session.provider);
        } else {
          const defaultProvider =
            data.defaultProvider ??
            (data.openai.configured && data.openai.enabled
              ? "openai"
              : data.gemini.configured && data.gemini.enabled
                ? "gemini"
                : null);
          if (defaultProvider && !valueRef.current) {
            const model =
              data[defaultProvider].selectedModel ??
              (defaultProvider === "openai" ? "gpt-5-mini" : "gemini-2.5-flash");
            const next = { provider: defaultProvider, model };
            onChangeRef.current(next);
            saveSessionSelection(next);
            void loadModels(defaultProvider);
          }
        }
      } catch {
        if (!cancelled) {
          setWarning("공급자 상태를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadModels]);

  useEffect(() => {
    if (!settings || props.value) return;
    const defaultProvider =
      settings.defaultProvider ??
      (settings.openai.configured && settings.openai.enabled
        ? "openai"
        : settings.gemini.configured && settings.gemini.enabled
          ? "gemini"
          : null);
    if (!defaultProvider) return;
    const model =
      settings[defaultProvider].selectedModel ??
      (defaultProvider === "openai" ? "gpt-5-mini" : "gemini-2.5-flash");
    const next = { provider: defaultProvider, model };
    const timer = window.setTimeout(() => {
      onChangeRef.current(next);
      saveSessionSelection(next);
      void loadModels(defaultProvider);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [props.value, settings, loadModels]);

  const availableProviders = (["openai", "gemini"] as const).filter((id) => {
    if (!settings) return false;
    return settings[id].configured && settings[id].enabled;
  });

  if (loading) {
    return (
      <div
        className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500"
        data-testid="agent-model-selector"
      >
        모델 불러오는 중…
      </div>
    );
  }

  if (!settings?.reasoningActive || availableProviders.length === 0) {
    return (
      <div
        className="min-w-0 text-xs text-amber-300"
        data-testid="agent-model-selector"
        title={
          settings?.emergencyDisabled
            ? "비상 비활성화"
            : "유효한 AI 공급자가 없습니다"
        }
      >
        {settings?.emergencyDisabled
          ? "AI 비상 비활성 · 로컬 폴백"
          : "로컬 폴백만 활성"}
      </div>
    );
  }

  const selectedModel = props.value?.model ?? "";

  return (
    <div
      className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5"
      data-testid="agent-model-selector"
    >
      <label className="sr-only" htmlFor="agent-provider-select">
        AI 공급자
      </label>
      <select
        id="agent-provider-select"
        disabled={props.disabled}
        value={provider ?? ""}
        aria-label="AI 공급자"
        data-testid="agent-provider-select"
        className="max-w-[9.5rem] truncate rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
        onChange={(e) => {
          const nextProvider = e.target.value as AgentProviderId;
          const fallbackModel =
            settings[nextProvider].selectedModel ??
            (nextProvider === "openai" ? "gpt-5-mini" : "gemini-2.5-flash");
          const next = { provider: nextProvider, model: fallbackModel };
          props.onChange(next);
          saveSessionSelection(next);
          void loadModels(nextProvider);
        }}
      >
        {availableProviders.map((id) => (
          <option key={id} value={id}>
            {id === "openai" ? "OpenAI" : "Google Gemini"}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="agent-model-select">
        모델
      </label>
      <select
        id="agent-model-select"
        disabled={props.disabled || !provider || modelsLoading}
        value={selectedModel}
        aria-label="모델"
        data-testid="agent-model-select"
        className="max-w-[12rem] truncate rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
        onChange={(e) => {
          if (!provider) return;
          const next = { provider, model: e.target.value };
          props.onChange(next);
          saveSessionSelection(next);
        }}
      >
        {models.length === 0 ? (
          selectedModel ? (
            <option value={selectedModel}>{selectedModel}</option>
          ) : (
            <option value="">모델 없음</option>
          )
        ) : (
          models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.labelKo}
            </option>
          ))
        )}
      </select>

      {warning ? (
        <span className="text-[10px] text-amber-300" title={warning}>
          경고
        </span>
      ) : null}
    </div>
  );
}

export function clearAgentProviderSelection(): void {
  saveSessionSelection(null);
}

export function readAgentProviderSelection(): AgentProviderSelection | null {
  return loadSessionSelection();
}
