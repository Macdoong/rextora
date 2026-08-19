"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { safeFetchJson } from "@/src/lib/rextora/client/safeFetchJson";

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

  return (
    <Card
      title={props.title}
      description="API 키는 서버에만 안전하게 저장되며 브라우저로 다시 내려오지 않습니다."
      data-testid={`ai-provider-card-${props.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={props.health.configured ? "success" : "muted"}>
          {props.health.configured ? "구성됨" : "미구성"}
        </Badge>
        {props.health.envFallback ? (
          <Badge tone="warning">환경변수 폴백</Badge>
        ) : null}
        {props.isDefault ? <Badge tone="info">기본 공급자</Badge> : null}
        {props.health.fingerprint ? (
          <span className="text-xs text-slate-500">
            fingerprint {props.health.fingerprint}
          </span>
        ) : null}
      </div>

      <label className="mt-4 block text-sm text-slate-300">
        API 키
        <div className="mt-1 flex gap-2">
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
          >
            {show ? "숨김" : "표시"}
          </button>
        </div>
      </label>

      <label className="mt-3 block text-sm text-slate-300">
        모델
        <select
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          value={model}
          onChange={(e) => setModelOverride(e.target.value)}
          data-testid={`ai-provider-model-${props.id}`}
        >
          <option value="">모델 선택</option>
          {props.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.labelKo}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
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

      <p className="mt-3 text-xs text-slate-400">
        최근 테스트:{" "}
        {props.health.lastTestAt
          ? `${props.health.lastTestAt} · ${
              props.health.lastTestOk ? "성공" : "실패"
            }`
          : "없음"}
      </p>
      {props.health.lastErrorKo ? (
        <p className="mt-1 text-xs text-rose-300">{props.health.lastErrorKo}</p>
      ) : null}
      {message ? <p className="mt-1 text-xs text-emerald-300">{message}</p> : null}
    </Card>
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
      <Card title="AI 공급자" data-testid="ai-provider-settings">
        <p className="text-sm text-slate-400">{error ?? "불러오는 중…"}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="ai-provider-settings">
      <Card
        title="AI 공급자"
        description="OpenAI와 Google Gemini를 연결하고 기본 모델을 선택합니다."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={settings.reasoningActive ? "success" : "warning"}>
            {settings.reasoningActive
              ? "Provider 활성"
              : "로컬 폴백만 활성"}
          </Badge>
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
      </Card>

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
  );
}
