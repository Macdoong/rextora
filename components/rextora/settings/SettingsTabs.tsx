"use client";

import { useEffect, useState } from "react";
import { LoadingState } from "@/components/rextora/LoadingState";
import { V3Card } from "@/components/rextora/v3/V3Card";
import { displayLabel, displaySettingsFieldHelper, displaySettingsFieldLabel } from "@/src/lib/rextora/displayLabels";
import {
  compactSymbolPreview,
  SETTINGS_COST_FIELD_KEYS,
  SETTINGS_MARKET_FIELD_KEYS,
  settingsCostDisplayUnit,
  settingsCostSummaryFacts,
} from "@/src/lib/rextora/settings/settingsDataPresentation";
import { SETTINGS_TRADING_FIELD_KEYS } from "@/src/lib/rextora/settings/settingsExchangePresentation";
import {
  SETTINGS_TELEGRAM_FIELD_KEYS,
  SETTINGS_TELEGRAM_GROUPS,
  settingsTelegramDisplayUnit,
} from "@/src/lib/rextora/settings/settingsNotificationsPresentation";
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

const SENSITIVE_FIELDS = new Set([
  "liveTradingEnabled",
  "allowLiveTrading",
  "defaultMode",
  "defaultLeverage",
  "maxLeverage",
]);

type ApiEnvelope<T> = { ok: boolean; data: T; error?: string };

function SettingsStringListField({
  values,
  onChange,
  compact = false,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const preview = compact
    ? compactSymbolPreview(values, expanded)
    : { visible: values, hiddenCount: 0, compact: false };
  const showToggle = compact && preview.compact;

  function commit() {
    const next = draft.trim();
    if (!next) return;
    if (!values.includes(next)) onChange([...values, next]);
    setDraft("");
  }

  return (
    <div className="space-y-2" data-testid="settings-symbol-list" data-symbol-total={values.length}>
      {values.length > 0 ? (
        <p className="v3-st-help" data-testid="settings-symbol-count">
          {values.length}개
        </p>
      ) : (
        <span className="v3-st-help">종목이 없습니다.</span>
      )}
      {values.length > 0 ? (
        <div className={expanded && showToggle ? "v3-st-symbol-chips v3-st-symbol-expanded" : "v3-st-symbol-chips"}>
          {preview.visible.map((symbol) => (
            <button
              key={symbol}
              type="button"
              className="v3-st-chip"
              data-testid={`settings-symbol-chip-${symbol}`}
              onClick={() => onChange(values.filter((item) => item !== symbol))}
            >
              {symbol} ×
            </button>
          ))}
        </div>
      ) : null}
      {showToggle && !expanded ? (
        <button
          type="button"
          className="v3-st-symbol-more v3-hover"
          data-testid="settings-symbols-expand"
          onClick={() => setExpanded(true)}
        >
          +{preview.hiddenCount}개 더 보기
        </button>
      ) : null}
      {showToggle && expanded ? (
        <button
          type="button"
          className="v3-st-symbol-more v3-hover"
          data-testid="settings-symbols-collapse"
          onClick={() => setExpanded(false)}
        >
          접기
        </button>
      ) : null}
      <input
        type="text"
        className="rextora-body w-full min-h-11 rounded bg-slate-950 px-3 py-2"
        placeholder="종목 추가 후 Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

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
  const visibleFields = Object.entries(section)
    .filter(([fieldKey]) => !HIDDEN_FIELDS.has(fieldKey))
    .sort((a, b) => {
      const order =
        activeTab === "cost"
          ? (SETTINGS_COST_FIELD_KEYS as readonly string[])
          : activeTab === "telegram"
            ? (SETTINGS_TELEGRAM_FIELD_KEYS as readonly string[])
            : null;
      if (!order) return 0;
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  const dirty = Boolean(settings && JSON.stringify(draft) !== JSON.stringify(settings));
  const marketSourceKeys = SETTINGS_MARKET_FIELD_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(section, key),
  );
  const costSourceKeys = SETTINGS_COST_FIELD_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(section, key),
  );
  const tradingSourceKeys = SETTINGS_TRADING_FIELD_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(section, key),
  );
  const telegramSourceKeys = SETTINGS_TELEGRAM_FIELD_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(section, key),
  );
  const costSummary =
    activeTab === "cost"
      ? settingsCostSummaryFacts({
          useTakerFeeForMarketOrders: Boolean(section.useTakerFeeForMarketOrders),
          includeFundingFee: Boolean(section.includeFundingFee),
        })
      : [];

  const renderField = (fieldKey: string, value: unknown) => {
    const label = displaySettingsFieldLabel(fieldKey);
    const helper = displaySettingsFieldHelper(activeTab, fieldKey);
    const enumOptions = ENUM_OPTIONS[fieldKey];
    const sensitive = SENSITIVE_FIELDS.has(fieldKey);
    const dangerOn =
      (fieldKey === "liveTradingEnabled" || fieldKey === "allowLiveTrading") &&
      value === true;
    const isStringList =
      Array.isArray(value) && value.every((item) => typeof item === "string");
    const FieldTag = isStringList ? "div" : "label";
    const costUnit = activeTab === "cost" ? settingsCostDisplayUnit(fieldKey) : null;
    const telegramUnit =
      activeTab === "telegram" ? settingsTelegramDisplayUnit(fieldKey) : null;
    const unit = costUnit ?? telegramUnit;
    const fieldTestId =
      activeTab === "cost"
        ? `settings-cost-field-${fieldKey}`
        : activeTab === "telegram"
          ? `settings-telegram-field-${fieldKey}`
          : undefined;

    return (
      <FieldTag
        key={fieldKey}
        className={`v3-st-field${sensitive ? " v3-st-sensitive" : ""}${dangerOn ? " is-danger" : ""}`}
        data-testid={fieldTestId}
      >
        <span className="rextora-body">{label}</span>
        {helper ? <p className="rextora-helper v3-st-help">{helper}</p> : null}
        {fieldKey === "liveTradingEnabled" || fieldKey === "allowLiveTrading" ? (
          <p className="v3-st-help">현재 {value ? "켜짐" : "꺼짐"}</p>
        ) : null}
        {typeof value === "boolean" ? (
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => setDraft({ ...draft, [activeTab]: { ...section, [fieldKey]: e.target.checked } })}
          />
        ) : typeof value === "number" ? (
          unit ? (
            <div className="v3-st-input-unit">
              <input
                type="number"
                className="rextora-body w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                value={value}
                onChange={(e) => setDraft({ ...draft, [activeTab]: { ...section, [fieldKey]: Number(e.target.value) } })}
              />
              <span className="v3-st-unit">{unit}</span>
            </div>
          ) : (
            <input
              type="number"
              className="rextora-body w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={value}
              onChange={(e) => setDraft({ ...draft, [activeTab]: { ...section, [fieldKey]: Number(e.target.value) } })}
            />
          )
        ) : isStringList ? (
          <SettingsStringListField
            values={value as string[]}
            compact={fieldKey === "allowedSymbols"}
            onChange={(next) =>
              setDraft({
                ...draft,
                [activeTab]: { ...section, [fieldKey]: next },
              })
            }
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
      </FieldTag>
    );
  };

  const telegramMappedKeys = new Set(
    SETTINGS_TELEGRAM_GROUPS.flatMap((group) => [...group.keys]),
  );
  const telegramLeftoverFields = visibleFields.filter(
    ([fieldKey]) => !telegramMappedKeys.has(fieldKey as (typeof SETTINGS_TELEGRAM_FIELD_KEYS)[number]),
  );

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

      <V3Card
        title={`${TABS.find((t) => t.id === activeTab)?.label} 설정`}
        meta="편집 가능"
      >
        {dirty ? (
          <p className="v3-st-dirty" data-testid="settings-dirty">
            저장하지 않은 변경이 있습니다.
          </p>
        ) : null}
        {activeTab === "cost" && costSummary.length > 0 ? (
          <div className="v3-st-facts v3-st-cost-summary" data-testid="settings-cost-summary">
            {costSummary.map((fact) => (
              <div className="v3-st-metric" key={fact.label}>
                <span>{fact.label}</span>
                <b>{fact.value}</b>
              </div>
            ))}
          </div>
        ) : null}
        {activeTab === "telegram" ? (
          <div data-testid="settings-telegram-groups">
            {SETTINGS_TELEGRAM_GROUPS.map((group) => {
              const fields = visibleFields.filter(([fieldKey]) =>
                (group.keys as readonly string[]).includes(fieldKey),
              );
              if (fields.length === 0) return null;
              return (
                <section
                  key={group.id}
                  className="v3-st-group"
                  data-testid={`settings-telegram-group-${group.id}`}
                >
                  <h3 className="v3-st-group-label">{group.label}</h3>
                  <div className="v3-st-form" data-section="telegram">
                    {fields.map(([fieldKey, value]) => renderField(fieldKey, value))}
                  </div>
                </section>
              );
            })}
            {telegramLeftoverFields.length > 0 ? (
              <section className="v3-st-group" data-testid="settings-telegram-group-other">
                <h3 className="v3-st-group-label">기타</h3>
                <div className="v3-st-form" data-section="telegram">
                  {telegramLeftoverFields.map(([fieldKey, value]) =>
                    renderField(fieldKey, value),
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="v3-st-form" data-section={activeTab}>
            {visibleFields.map(([fieldKey, value]) => renderField(fieldKey, value))}
          </div>
        )}
        {activeTab === "cost" ? (
          <p className="v3-st-note" data-testid="settings-cost-validation-note">
            최소 기대 수익은 0보다 커야 하고, 안전 마진은 음수일 수 없습니다. 표시 숫자는 저장된 값 그대로이며 단위만 안내합니다.
          </p>
        ) : null}
        {activeTab === "market" && marketSourceKeys.length > 0 ? (
          <details className="v3-st-disc" data-testid="settings-market-source-keys">
            <summary>원본 설정 키</summary>
            <ul className="v3-st-tech-keys">
              {marketSourceKeys.map((key) => (
                <li key={key}>
                  <span>{key}</span>
                  {displaySettingsFieldLabel(key)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {activeTab === "cost" && costSourceKeys.length > 0 ? (
          <details className="v3-st-disc" data-testid="settings-cost-source-keys">
            <summary>원본 설정 키</summary>
            <ul className="v3-st-tech-keys">
              {costSourceKeys.map((key) => (
                <li key={key}>
                  <span>{key}</span>
                  {displaySettingsFieldLabel(key)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {activeTab === "trading" && tradingSourceKeys.length > 0 ? (
          <details className="v3-st-disc" data-testid="settings-trading-source-keys">
            <summary>원본 설정 키</summary>
            <ul className="v3-st-tech-keys">
              {tradingSourceKeys.map((key) => (
                <li key={key}>
                  <span>{key}</span>
                  {displaySettingsFieldLabel(key)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {activeTab === "telegram" && telegramSourceKeys.length > 0 ? (
          <details className="v3-st-disc" data-testid="settings-telegram-source-keys">
            <summary>원본 설정 키</summary>
            <ul className="v3-st-tech-keys">
              {telegramSourceKeys.map((key) => (
                <li key={key}>
                  <span>{key}</span>
                  {displaySettingsFieldLabel(key)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </V3Card>

      <div className="v3-st-toolbar">
        <button type="button" onClick={() => void save()} className="rextora-btn-text rounded bg-emerald-600 px-4 py-2 text-white">
          저장
        </button>
        <button type="button" onClick={() => void reset()} className="rextora-btn-text rounded bg-slate-700 px-4 py-2 text-white">
          기본값 복원
        </button>
        <button type="button" onClick={() => void exportJson()} className="rextora-btn-text min-h-11 rounded bg-slate-700 px-4 py-2 text-white">
          설정 내보내기
        </button>
      </div>

      {settings?.updatedAt ? (
        <p className="v3-st-help">마지막 저장 {new Date(settings.updatedAt).toLocaleString("ko-KR")}</p>
      ) : null}
      {error ? <p className="v3-st-error">{error}</p> : null}
      {success ? <p className="v3-st-ok">{success}</p> : null}
      <p className="v3-st-help">비밀값(API 키, Telegram 토큰)은 환경변수로만 관리됩니다. settings.json에는 저장하지 않습니다.</p>
    </div>
  );
}
