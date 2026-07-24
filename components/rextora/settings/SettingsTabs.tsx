"use client";

import { useEffect, useState } from "react";
import { LoadingState } from "@/components/rextora/LoadingState";
import { Badge, Card, Metric } from "@/components/ui/primitives";
import { displayLabel, displaySettingsFieldHelper, displaySettingsFieldLabel } from "@/src/lib/rextora/displayLabels";
import type { RextoraSettings, SettingsCategory } from "@/src/lib/rextora/settings/settingsTypes";

const TABS: Array<{ id: SettingsCategory; label: string }> = [
  { id: "trading", label: "거래 모드" },
  { id: "market", label: "감시 코인" },
  { id: "signal", label: "진입 조건" },
  { id: "cost", label: "비용" },
  { id: "execution", label: "주문" },
  { id: "tpSl", label: "손절/익절" },
  { id: "telegram", label: "알림" },
  { id: "ui", label: "시스템" }
];

const HIDDEN_FIELDS = new Set([
  "manualLiveConfirmationRequired",
  "liveConfirmationText",
  "operatorLiveStartRequired",
  "riskSettingsConfirmed",
  "requireTelegramForLive",
  "manualLiveConfirmationRequired"
]);

const ENUM_OPTIONS: Record<string, string[]> = {
  defaultMode: ["PAPER", "LIVE"],
  positionMode: ["oneWayMode", "hedgeMode"],
  marginType: ["ISOLATED", "CROSSED"],
  orderType: ["MARKET", "LIMIT"],
  positionSizeMode: ["FIXED_USDT", "BALANCE_PERCENT"]
};

type ApiEnvelope<T> = { ok: boolean; data: T; error?: string };

export function SettingsTabs(props?: {
  initialCategory?: SettingsCategory;
  hideTabBar?: boolean;
}) {
  const [settings, setSettings] = useState<RextoraSettings | null>(null);
  const [draft, setDraft] = useState<RextoraSettings | null>(null);
  const [tab, setTab] = useState<SettingsCategory>(
    props?.initialCategory ?? "trading",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const activeTab = props?.initialCategory ?? tab;

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/rextora/settings", { cache: "no-store" });
      const body = (await res.json()) as ApiEnvelope<{ settings: RextoraSettings; secretsNotice: string }>;
      if (!active) return;
      if (body.ok) {
        setSettings(body.data.settings);
        setDraft(body.data.settings);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    if (!draft) return;
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/rextora/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: draft })
    });
    const body = (await res.json()) as ApiEnvelope<{ settings: RextoraSettings }>;
    if (!body.ok) {
      setError(body.error ?? "저장 실패");
      return;
    }
    setSettings(body.data.settings);
    setDraft(body.data.settings);
    setSuccess("설정이 저장되었습니다.");
  };

  const reset = async () => {
    const res = await fetch("/api/rextora/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset" })
    });
    const body = (await res.json()) as ApiEnvelope<{ settings: RextoraSettings }>;
    if (body.ok) {
      setSettings(body.data.settings);
      setDraft(body.data.settings);
      setSuccess("기본값으로 초기화되었습니다.");
    }
  };

  const exportJson = async () => {
    const res = await fetch("/api/rextora/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "export" })
    });
    const body = (await res.json()) as ApiEnvelope<{ json: string }>;
    if (body.ok) navigator.clipboard.writeText(body.data.json);
  };

  if (loading || !draft) return <LoadingState message="설정을 불러오는 중입니다." hint="잠시만 기다려 주세요." lines={6} />;

  const section = draft[activeTab] as unknown as Record<string, unknown>;
  const visibleFields = Object.entries(section).filter(([fieldKey]) => !HIDDEN_FIELDS.has(fieldKey));

  return (
    <div className="space-y-4" data-testid="settings-tabs">
      {!props?.hideTabBar ? (
        <div className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`settings-tab-${item.id}`}
              onClick={() => setTab(item.id)}
              className={`rextora-btn-text rounded-lg px-3 py-1.5 ${activeTab === item.id ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-300"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <Card title={`${TABS.find((t) => t.id === activeTab)?.label} 설정`} action={<Badge tone="purple">편집 가능</Badge>}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleFields.map(([fieldKey, value]) => {
            const label = displaySettingsFieldLabel(fieldKey);
            const helper = displaySettingsFieldHelper(activeTab, fieldKey);
            const enumOptions = ENUM_OPTIONS[fieldKey];

            return (
              <label key={fieldKey} className="block">
                <span className="rextora-body mb-1 block font-medium text-slate-200">{label}</span>
                {helper && <p className="rextora-helper mb-2">{helper}</p>}
                {typeof value === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setDraft({ ...draft, [activeTab]: { ...section, [fieldKey]: e.target.checked } })}
                  />
                ) : typeof value === "number" ? (
                  <input
                    type="number"
                    className="rextora-body w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                    value={value}
                    onChange={(e) => setDraft({ ...draft, [activeTab]: { ...section, [fieldKey]: Number(e.target.value) } })}
                  />
                ) : Array.isArray(value) ? (
                  <textarea
                    className="rextora-body w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                    value={JSON.stringify(value)}
                    onChange={(e) => {
                      try {
                        setDraft({ ...draft, [activeTab]: { ...section, [fieldKey]: JSON.parse(e.target.value) } });
                      } catch {
                        /* ignore invalid json while typing */
                      }
                    }}
                  />
                ) : enumOptions ? (
                  <select
                    className="rextora-body w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                    value={String(value)}
                    onChange={(e) => setDraft({ ...draft, [activeTab]: { ...section, [fieldKey]: e.target.value } })}
                  >
                    {enumOptions.map((opt) => (
                      <option key={opt} value={opt}>{displayLabel(opt)}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="rextora-body w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                    value={String(value)}
                    onChange={(e) => setDraft({ ...draft, [activeTab]: { ...section, [fieldKey]: e.target.value } })}
                  />
                )}
              </label>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} className="rextora-btn-text rounded bg-emerald-600 px-4 py-2 text-white">
          저장
        </button>
        <button type="button" onClick={() => void reset()} className="rextora-btn-text rounded bg-slate-700 px-4 py-2 text-white">
          기본값 복원
        </button>
        <button type="button" onClick={() => void exportJson()} className="rextora-btn-text rounded bg-slate-700 px-4 py-2 text-white">
          JSON보내기
        </button>
      </div>

      {settings?.updatedAt && <Metric label="마지막 저장" value={new Date(settings.updatedAt).toLocaleString("ko-KR")} />}
      {error && <p className="rextora-helper text-red-300">{error}</p>}
      {success && <p className="rextora-helper text-emerald-300">{success}</p>}
      <p className="rextora-helper">비밀값(API 키, Telegram 토큰)은 환경변수로만 관리됩니다. settings.json에는 저장하지 않습니다.</p>
    </div>
  );
}
