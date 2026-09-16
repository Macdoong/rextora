"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/primitives";
import { V3Card } from "@/components/rextora/v3/V3Card";
import { safeFetchJson } from "@/src/lib/rextora/client/safeFetchJson";
import {
  settingsAiConfiguredLabel,
  settingsAiConfiguredTone,
  settingsAiEnabledLabel,
  settingsAiFallbackLabel,
  settingsAiModelOptionLabel,
  settingsAiProviderDisplayName,
  settingsAiRecommendedModelNote,
  settingsAiRuntimeLabel,
  settingsAiTechnicalKeyLabel,
  settingsAiTestLabel,
  settingsAiTestTone,
  SETTINGS_AI_TECHNICAL_KEYS,
} from "@/src/lib/rextora/settings/settingsAiProviderPresentation";

type ProviderId = "openai" | "gemini";

interface ProviderHealth {
  configured: boolean;
  enabled: boolean;
  fingerprint: string | null;
  selectedModel: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastErrorKo: string | null;
  catalogCount?: number;
  envFallback?: boolean;
}

interface SettingsPayload {
  emergencyDisabled: boolean;
  defaultProvider: ProviderId | null;
  fallbackEnabled: boolean;
  fallbackProvider: ProviderId | null;
  openai: ProviderHealth;
  gemini: ProviderHealth;
  reasoningActive: boolean;
}

interface ModelInfo {
  id: string;
  labelKo: string;
  recommendedDefault?: boolean;
}

function ProviderCard(props: {
  id: ProviderId;
  title: string;
  health: ProviderHealth;
  models: ModelInfo[];
  onRefreshModels: () => Promise<void>;
  onSaveTest: (apiKey: string, model: string | null, save: boolean) => Promise<void>;
  onToggleEnabled: (enabled: boolean) => Promise<void>;
  onSelectModel: (model: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onSetDefault: () => Promise<void>;
  isDefault: boolean;
  busy: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const model = modelOverride ?? props.health.selectedModel ?? "";
  const configuredTone = settingsAiConfiguredTone(
    props.health.configured,
    props.health.lastTestOk,
  );
  const hasStoredModel =
    Boolean(model) && !props.models.some((item) => item.id === model);
  const recommendedNote = settingsAiRecommendedModelNote(props.models);

  return (
    <V3Card
      title={props.title}
      meta={props.isDefault ? "기본 공급자" : settingsAiConfiguredLabel(props.health.configured)}
      data-testid={`ai-provider-card-${props.id}`}
    >
      <p className="v3-st-lede">
        API 키는 서버에만 저장되며 브라우저로 다시 내려오지 않습니다. 키 설정됨은
        연결 검증이 아닙니다.
      </p>
      <div className="v3-st-facts">
        <div className="v3-st-metric">
          <span>자격 증명</span>
          <b className={configuredTone}>
            {settingsAiConfiguredLabel(props.health.configured)}
          </b>
        </div>
        <div className="v3-st-metric">
          <span>공급자 상태</span>
          <b>{settingsAiEnabledLabel(props.health.enabled)}</b>
        </div>
        <div className="v3-st-metric">
          <span>연결 검증</span>
          <b className={settingsAiTestTone(props.health.lastTestOk)}>
            {settingsAiTestLabel(props.health.lastTestOk)}
          </b>
        </div>
        <div className="v3-st-metric">
          <span>선택 모델</span>
          <b className="v3-st-model-id">{props.health.selectedModel ?? "없음"}</b>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 10 }}>
        {props.health.envFallback ? (
          <Badge tone="warning">환경변수 폴백</Badge>
        ) : null}
        {props.isDefault ? <Badge tone="info">기본 공급자</Badge> : null}
      </div>

      <label className="v3-st-field v3-st-sensitive" style={{ marginTop: 12 }}>
        <span>API 키</span>
        <div className="v3-st-input-unit" style={{ marginTop: 6 }}>
          <input
            type={show ? "text" : "password"}
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              props.health.configured
                ? "새 키를 입력하면 교체됩니다"
                : "API 키 입력"
            }
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            data-testid={`ai-provider-key-${props.id}`}
          />
          <button
            type="button"
            className="rounded-md border border-slate-700 px-3 text-xs"
            onClick={() => setShow((v) => !v)}
            data-testid={`ai-provider-reveal-${props.id}`}
          >
            {show ? "숨김" : "표시"}
          </button>
        </div>
      </label>

      <label className="v3-st-field" style={{ marginTop: 12 }}>
        <span>모델</span>
        <select
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm v3-st-model-id"
          value={model}
          onChange={(e) => setModelOverride(e.target.value)}
          data-testid={`ai-provider-model-${props.id}`}
        >
          <option value="">모델 선택</option>
          {hasStoredModel ? <option value={model}>{model}</option> : null}
          {props.models.map((m) => (
            <option key={m.id} value={m.id}>
              {settingsAiModelOptionLabel(m)}
            </option>
          ))}
        </select>
        {recommendedNote ? <p className="v3-st-help">{recommendedNote}</p> : null}
      </label>

      <div className="v3-st-toolbar" style={{ marginTop: 12 }}>
        <button
          type="button"
          disabled={props.busy || !apiKey.trim()}
          className="rounded-md bg-cyan-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
          onClick={async () => {
            setMessage(null);
            await props.onSaveTest(apiKey, model || null, false);
            setMessage("연결 테스트 완료");
          }}
          data-testid={`ai-provider-test-${props.id}`}
        >
          연결 테스트
        </button>
        <button
          type="button"
          disabled={props.busy || !apiKey.trim()}
          className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
          onClick={async () => {
            setMessage(null);
            await props.onSaveTest(apiKey, model || null, true);
            setApiKey("");
            setShow(false);
            setModelOverride(null);
            setMessage(
              "저장되었습니다. 서버 재시작 없이 바로 사용할 수 있습니다.",
            );
          }}
          data-testid={`ai-provider-save-${props.id}`}
        >
          검증 후 저장
        </button>
        <button
          type="button"
          disabled={props.busy}
          className="rounded-md border border-slate-600 px-3 py-2 text-xs"
          onClick={() => props.onRefreshModels()}
        >
          모델 새로고침
        </button>
        <button
          type="button"
          disabled={props.busy || !model}
          className="rounded-md border border-slate-600 px-3 py-2 text-xs"
          onClick={() => props.onSelectModel(model)}
        >
          모델 적용
        </button>
        <button
          type="button"
          disabled={props.busy}
          className="rounded-md border border-slate-600 px-3 py-2 text-xs"
          onClick={() => props.onToggleEnabled(!props.health.enabled)}
        >
          {props.health.enabled ? "비활성화" : "활성화"}
        </button>
        <button
          type="button"
          disabled={props.busy}
          className="rounded-md border border-slate-600 px-3 py-2 text-xs"
          onClick={() => props.onSetDefault()}
        >
          기본으로
        </button>
        <button
          type="button"
          disabled={props.busy || !props.health.configured}
          className="rounded-md border border-rose-700 px-3 py-2 text-xs text-rose-300"
          onClick={() => props.onRemove()}
        >
          자격증명 삭제
        </button>
      </div>

      <p className="v3-st-help" style={{ marginTop: 10 }}>
        최근 검증:{" "}
        {props.health.lastTestAt
          ? `${props.health.lastTestAt} · ${settingsAiTestLabel(props.health.lastTestOk)}`
          : "없음"}
      </p>
      {props.health.configured && props.health.lastTestOk !== true ? (
        <p className="v3-st-help">연결은 아직 검증되지 않았습니다.</p>
      ) : null}
      {props.health.lastErrorKo ? (
        <p className="mt-1 text-xs text-rose-300">{props.health.lastErrorKo}</p>
      ) : null}
      {message ? <p className="mt-1 text-xs text-emerald-300">{message}</p> : null}
    </V3Card>
  );
}

export function AiProviderSettingsPanel() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [openaiModels, setOpenaiModels] = useState<ModelInfo[]>([]);
  const [geminiModels, setGeminiModels] = useState<ModelInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const parsed = await safeFetchJson<SettingsPayload & { error?: boolean; messageKo?: string }>(
      "/api/rextora/settings/ai-providers",
    );
    if (!parsed.ok || parsed.data.error) {
      setError(
        parsed.ok
          ? (parsed.data.messageKo ?? "설정을 불러오지 못했습니다.")
          : parsed.messageKo,
      );
      return null;
    }
    setSettings(parsed.data);
    setError(null);
    return parsed.data;
  }, []);

  const loadModels = useCallback(async (provider: ProviderId, refresh = false) => {
    const parsed = await safeFetchJson<{
      models?: ModelInfo[];
      error?: boolean;
      messageKo?: string;
    }>(
      `/api/rextora/settings/ai-providers/models?provider=${provider}${
        refresh ? "&refresh=1" : ""
      }`,
    );
    if (!parsed.ok || parsed.data.error) {
      setError(
        parsed.ok
          ? (parsed.data.messageKo ?? "모델 목록을 불러오지 못했습니다.")
          : parsed.messageKo,
      );
      return false;
    }
    if (provider === "openai") setOpenaiModels(parsed.data.models ?? []);
    else setGeminiModels(parsed.data.models ?? []);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const parsed = await safeFetchJson<SettingsPayload & { error?: boolean; messageKo?: string }>(
        "/api/rextora/settings/ai-providers",
      );
      if (cancelled) return;
      if (!parsed.ok || parsed.data.error) {
        setError(
          parsed.ok
            ? (parsed.data.messageKo ?? "설정을 불러오지 못했습니다.")
            : parsed.messageKo,
        );
        return;
      }
      setSettings(parsed.data);
      await Promise.allSettled(
        (["openai", "gemini"] as const).map(async (provider) => {
          const modelsParsed = await safeFetchJson<{ models?: ModelInfo[]; error?: boolean }>(
            `/api/rextora/settings/ai-providers/models?provider=${provider}`,
          );
          if (cancelled || !modelsParsed.ok || modelsParsed.data.error) return;
          if (provider === "openai") setOpenaiModels(modelsParsed.data.models ?? []);
          else setGeminiModels(modelsParsed.data.models ?? []);
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings) {
    return (
      <V3Card title="AI 공급자" data-testid="ai-provider-settings">
        <p className="v3-st-note">{error ?? "불러오는 중…"}</p>
      </V3Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="ai-provider-settings">
      <V3Card
        title="AI 공급자"
        meta="OpenAI · Google Gemini"
      >
        <p className="v3-st-lede">
          현재 기본 공급자와 선택 모델을 확인하고, 자격 증명을 교체하거나 검증할 수 있습니다.
        </p>
        <div className="v3-st-facts">
          <div className="v3-st-metric">
            <span>기본 공급자</span>
            <b>{settingsAiProviderDisplayName(settings.defaultProvider)}</b>
          </div>
          <div className="v3-st-metric">
            <span>현재 모델</span>
            <b className="v3-st-model-id">
              {(settings.defaultProvider === "gemini"
                ? settings.gemini.selectedModel
                : settings.openai.selectedModel) ?? "없음"}
            </b>
          </div>
          <div className="v3-st-metric">
            <span>공급자 런타임</span>
            <b className={settings.reasoningActive ? "ok" : "warn"}>
              {settingsAiRuntimeLabel(settings.reasoningActive)}
            </b>
          </div>
          <div className="v3-st-metric">
            <span>예비 공급자</span>
            <b>
              {settingsAiFallbackLabel(
                settings.fallbackEnabled,
                settings.fallbackProvider,
              )}
            </b>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 10 }}>
          {settings.emergencyDisabled ? (
            <Badge tone="danger">비상 비활성화</Badge>
          ) : null}
        </div>
        {!settings.reasoningActive ? (
          <p className="mt-2 text-sm text-amber-300">
            유효한 공급자 키와 모델이 없으면 대화가 로컬 폴백만 사용합니다.
          </p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
        <details className="v3-st-disc" data-testid="settings-ai-source-keys">
          <summary>원본 설정 키</summary>
          <ul className="v3-st-tech-keys">
            {SETTINGS_AI_TECHNICAL_KEYS.map((key) => (
              <li key={key}>
                <span>{key}</span>
                {settingsAiTechnicalKeyLabel(key)}
              </li>
            ))}
          </ul>
        </details>
      </V3Card>

      <div className="v3-st-ai-grid">
      <ProviderCard
        id="openai"
        title="OpenAI"
        health={settings.openai}
        models={openaiModels}
        busy={busy}
        isDefault={settings.defaultProvider === "openai"}
        onRefreshModels={async () => {
          setBusy(true);
          await loadModels("openai", true);
          setBusy(false);
        }}
        onSaveTest={async (apiKey, model, save) => {
          setBusy(true);
          const parsed = await safeFetchJson<{
            ok?: boolean;
            errorKo?: string;
            messageKo?: string;
          }>("/api/rextora/settings/ai-providers/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "openai",
              apiKey,
              model,
              saveOnSuccess: save,
            }),
          });
          if (!parsed.ok || parsed.data.ok === false) {
            setError(
              parsed.ok
                ? (parsed.data.errorKo ?? parsed.data.messageKo ?? "테스트 실패")
                : parsed.messageKo,
            );
          } else {
            setError(null);
          }
          await load();
          await loadModels("openai", true);
          setBusy(false);
        }}
        onToggleEnabled={async (enabled) => {
          setBusy(true);
          await fetch("/api/rextora/settings/ai-providers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ openai: { enabled } }),
          });
          await load();
          setBusy(false);
        }}
        onSelectModel={async (selectedModel) => {
          setBusy(true);
          await fetch("/api/rextora/settings/ai-providers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ openai: { selectedModel } }),
          });
          await load();
          setBusy(false);
        }}
        onRemove={async () => {
          if (!confirm("OpenAI 자격 증명을 삭제할까요?")) return;
          setBusy(true);
          await fetch("/api/rextora/settings/ai-providers/credential", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "openai", confirm: true }),
          });
          await load();
          setBusy(false);
        }}
        onSetDefault={async () => {
          setBusy(true);
          await fetch("/api/rextora/settings/ai-providers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ defaultProvider: "openai" }),
          });
          await load();
          setBusy(false);
        }}
      />

      <ProviderCard
        id="gemini"
        title="Google Gemini"
        health={settings.gemini}
        models={geminiModels}
        busy={busy}
        isDefault={settings.defaultProvider === "gemini"}
        onRefreshModels={async () => {
          setBusy(true);
          await loadModels("gemini", true);
          setBusy(false);
        }}
        onSaveTest={async (apiKey, model, save) => {
          setBusy(true);
          const parsed = await safeFetchJson<{
            ok?: boolean;
            errorKo?: string;
            messageKo?: string;
          }>("/api/rextora/settings/ai-providers/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "gemini",
              apiKey,
              model,
              saveOnSuccess: save,
            }),
          });
          if (!parsed.ok || parsed.data.ok === false) {
            setError(
              parsed.ok
                ? (parsed.data.errorKo ?? parsed.data.messageKo ?? "테스트 실패")
                : parsed.messageKo,
            );
          } else {
            setError(null);
          }
          await load();
          await loadModels("gemini", true);
          setBusy(false);
        }}
        onToggleEnabled={async (enabled) => {
          setBusy(true);
          await fetch("/api/rextora/settings/ai-providers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gemini: { enabled } }),
          });
          await load();
          setBusy(false);
        }}
        onSelectModel={async (selectedModel) => {
          setBusy(true);
          await fetch("/api/rextora/settings/ai-providers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gemini: { selectedModel } }),
          });
          await load();
          setBusy(false);
        }}
        onRemove={async () => {
          if (!confirm("Gemini 자격 증명을 삭제할까요?")) return;
          setBusy(true);
          await fetch("/api/rextora/settings/ai-providers/credential", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "gemini", confirm: true }),
          });
          await load();
          setBusy(false);
        }}
        onSetDefault={async () => {
          setBusy(true);
          await fetch("/api/rextora/settings/ai-providers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ defaultProvider: "gemini" }),
          });
          await load();
          setBusy(false);
        }}
      />
      </div>
    </div>
  );
}
