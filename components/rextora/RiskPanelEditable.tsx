"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  FieldHelp,
  Metric,
  ProgressBar,
} from "@/components/ui/primitives";
import type { RiskSettings, RiskStatus } from "@/lib/types";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import {
  computeRemainingLossAllowancePct,
  computeRiskUsagePct,
  normalizeDailyLossPct,
} from "@/src/lib/rextora/metrics/riskFormulas";
import { Gauge, ShieldAlert } from "lucide-react";

const DEFAULT_SETTINGS: RiskSettings = {
  dailyLossLimitPct: -5,
  totalLossLimitPct: -10,
  consecutiveLossLimit: 3,
  maxDailyTrades: 20,
  maxLeverage: 2.5,
  maxSimultaneousPositions: 1,
  maxPositionSizePerCoinPct: 3,
  overtradingCooldownMinutes: 15,
};

const RISK_FIELD_HELPERS: Record<keyof RiskSettings, string> = {
  dailyLossLimitPct: "하루에 허용할 최대 손실입니다.",
  totalLossLimitPct: "전체 계정 기준 최대 손실입니다.",
  consecutiveLossLimit: "연속으로 손실이 발생하면 봇을 멈춥니다.",
  maxSimultaneousPositions: "동시에 열 수 있는 최대 거래 수입니다.",
  maxPositionSizePerCoinPct: "한 코인에 너무 많이 들어가지 않도록 제한합니다.",
  maxLeverage: "사용할 수 있는 최대 레버리지입니다.",
  maxDailyTrades: "과매매를 막기 위한 제한입니다.",
  overtradingCooldownMinutes: "거래 후 다음 거래까지 대기 시간입니다.",
};

const RISK_FIELD_META: Partial<
  Record<keyof RiskSettings, { recommended: string; safe: string }>
> = {
  dailyLossLimitPct: { recommended: "-3 ~ -5%", safe: "-5%" },
  totalLossLimitPct: { recommended: "-8 ~ -12%", safe: "-10%" },
  consecutiveLossLimit: { recommended: "3", safe: "3" },
  maxLeverage: { recommended: "2~3배", safe: "2.5배" },
  maxSimultaneousPositions: { recommended: "1", safe: "1" },
  maxDailyTrades: { recommended: "20 이하", safe: "20" },
};

type EditableRisk = RiskStatus & { riskView?: UnifiedRiskView };

function buildViewFromRisk(risk: RiskStatus): UnifiedRiskView {
  const limit = risk.settings.dailyLossLimitPct;
  const current = normalizeDailyLossPct(risk.dailyLossPct);
  const usagePct = computeRiskUsagePct(current, limit);
  return {
    riskState: risk.riskState,
    dailyLossLimitPct: limit,
    currentDailyLossPct: current,
    remainingDailyLossPct: computeRemainingLossAllowancePct(current, limit),
    usagePct,
    accountDrawdownPct: risk.totalLossPct,
    accountLossLimitPct: risk.settings.totalLossLimitPct,
    consecutiveLosses: risk.consecutiveLosses,
    consecutiveLossLimit: risk.settings.consecutiveLossLimit,
    dailyTrades: risk.dailyTrades,
    maxDailyTrades: risk.settings.maxDailyTrades,
    remainingTrades: Math.max(0, risk.settings.maxDailyTrades - risk.dailyTrades),
    openPositions: risk.openPositions,
    maxPositions: risk.settings.maxSimultaneousPositions,
    remainingPositionSlots: Math.max(
      0,
      risk.settings.maxSimultaneousPositions - risk.openPositions,
    ),
    currentLeverage: risk.currentLeverage,
    maxLeverage: risk.settings.maxLeverage,
    limitBreached: usagePct >= 100,
  };
}

function UtilizationGauge({
  label,
  used,
  max,
  unit = "",
}: {
  label: string;
  used: number;
  max: number;
  unit?: string;
}) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const tone = pct >= 100 ? "danger" : pct >= 70 ? "warning" : "success";
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rextora-caption">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-slate-200">
          {used}
          {unit} / {max}
          {unit}
        </span>
      </div>
      <ProgressBar value={pct} tone={tone} />
    </div>
  );
}

export function RiskPanelEditable({ initialRisk }: { initialRisk: EditableRisk }) {
  const [settings, setSettings] = useState<RiskSettings>({
    ...initialRisk.settings,
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const risk = { ...initialRisk, settings };
  const view = initialRisk.riskView ?? buildViewFromRisk(risk);
  const riskTone =
    view.riskState === "정상"
      ? "success"
      : view.riskState === "주의"
        ? "warning"
        : "danger";

  function updateField<K extends keyof RiskSettings>(
    key: K,
    value: RiskSettings[K],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
    setStatusMessage("");
    setErrorMessage("");
  }

  async function saveSettings() {
    setSaving(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const res = await fetch("/api/rextora/risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { risk?: { settings?: RiskSettings } };
        error?: string;
        risk?: { settings?: RiskSettings };
      };
      if (!res.ok || body.ok === false) {
        setErrorMessage(body.error ?? "리스크 설정 저장에 실패했습니다.");
        return;
      }
      const saved =
        body.data?.risk?.settings ?? body.risk?.settings ?? settings;
      setSettings({ ...saved });
      setStatusMessage("리스크 설정이 저장되었습니다. 새로고침 후에도 유지됩니다.");
    } catch {
      setErrorMessage(
        "네트워크 오류로 저장하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetDefaults() {
    setSaving(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const res = await fetch("/api/rextora/risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: DEFAULT_SETTINGS }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { risk?: { settings?: RiskSettings } };
        error?: string;
        risk?: { settings?: RiskSettings };
      };
      if (!res.ok || body.ok === false) {
        setErrorMessage(body.error ?? "기본값 복원에 실패했습니다.");
        return;
      }
      const saved =
        body.data?.risk?.settings ?? body.risk?.settings ?? DEFAULT_SETTINGS;
      setSettings({ ...saved });
      setStatusMessage("기본값으로 복원하고 저장했습니다.");
    } catch {
      setErrorMessage("기본값 복원 중 네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const fields: Array<{ key: keyof RiskSettings; label: string; step?: number }> =
    [
      { key: "dailyLossLimitPct", label: "일일 손실 한도 (%)", step: 0.5 },
      { key: "totalLossLimitPct", label: "전체 손실 한도 (%)", step: 0.5 },
      { key: "consecutiveLossLimit", label: "연속 손실 제한", step: 1 },
      { key: "maxSimultaneousPositions", label: "동시 포지션 수", step: 1 },
      {
        key: "maxPositionSizePerCoinPct",
        label: "코인별 진입 금액 제한 (%)",
        step: 0.5,
      },
      { key: "maxLeverage", label: "최대 레버리지", step: 0.1 },
      { key: "maxDailyTrades", label: "하루 최대 거래 횟수", step: 1 },
      {
        key: "overtradingCooldownMinutes",
        label: "과매매 방지 쿨다운 (분)",
        step: 1,
      },
    ];

  return (
    <div className="space-y-4">
      <Card
        title="리스크 사용률"
        description="한도 대비 현재 소진과 남은 여유를 한눈에 확인합니다."
        icon={<Gauge className="h-4 w-4" />}
        action={<Badge tone={riskTone}>{view.riskState}</Badge>}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <div className="rextora-caption">일 손실 한도 사용</div>
                <div className="rextora-metric-primary text-slate-50">
                  {view.usagePct}%
                </div>
              </div>
              <div className="text-right">
                <div className="rextora-caption">남은 여유</div>
                <div className="rextora-metric-secondary text-emerald-300">
                  {view.remainingDailyLossPct.toFixed(2)}%
                </div>
              </div>
            </div>
            <ProgressBar
              value={Math.min(100, view.usagePct)}
              tone={
                view.usagePct >= 100
                  ? "danger"
                  : view.usagePct > 70
                    ? "warning"
                    : "success"
              }
            />
            {view.limitBreached && (
              <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                일 손실 한도에 도달했습니다. 신규 진입이 차단될 수 있습니다.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="오늘 손실 한도"
              value={`${Math.abs(view.dailyLossLimitPct).toFixed(2)}%`}
            />
            <Metric
              label="현재 일 손실"
              value={`${Math.abs(view.currentDailyLossPct).toFixed(2)}%`}
              tone={view.usagePct > 70 ? "danger" : "default"}
            />
            <Metric label="계정 낙폭" value={`${view.accountDrawdownPct}%`} />
            <Metric
              label="계정 손실 한도"
              value={`${Math.abs(view.accountLossLimitPct).toFixed(2)}%`}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <UtilizationGauge
            label="일 거래 사용"
            used={view.dailyTrades}
            max={view.maxDailyTrades}
          />
          <UtilizationGauge
            label="포지션 슬롯"
            used={view.openPositions}
            max={view.maxPositions}
          />
          <UtilizationGauge
            label="연속 손실"
            used={view.consecutiveLosses}
            max={view.consecutiveLossLimit}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="남은 거래" value={view.remainingTrades} />
          <Metric label="남은 포지션 슬롯" value={view.remainingPositionSlots} />
          <Metric
            label="현재 레버리지"
            value={`${view.currentLeverage} / ${view.maxLeverage}`}
          />
        </div>
      </Card>

      <Card
        title="리스크 한도 설정"
        icon={<ShieldAlert className="h-4 w-4" />}
        description="권장·안전 값을 참고해 조정하세요. 과도한 완화는 자본 위험을 키웁니다."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fields.map(({ key, label, step = 1 }) => {
            const meta = RISK_FIELD_META[key];
            return (
              <label key={key} className="block">
                <span className="rextora-body mb-1 block font-medium text-slate-200">
                  {label}
                </span>
                <FieldHelp
                  help={RISK_FIELD_HELPERS[key]}
                  recommended={meta?.recommended}
                  safe={meta?.safe}
                />
                <input
                  type="number"
                  step={step}
                  value={settings[key] as number}
                  onChange={(e) =>
                    updateField(key, Number(e.target.value) as RiskSettings[typeof key])
                  }
                  className="rextora-input"
                />
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="success"
            loading={saving}
            onClick={() => void saveSettings()}
            data-testid="risk-settings-save"
          >
            설정 저장
          </Button>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => void resetDefaults()}
            data-testid="risk-settings-reset"
          >
            기본값 복원
          </Button>
        </div>
        {statusMessage && (
          <p
            className="rextora-helper mt-3 text-emerald-300"
            data-testid="risk-settings-success"
          >
            {statusMessage}
          </p>
        )}
        {errorMessage && (
          <p
            className="rextora-helper mt-3 text-red-300"
            data-testid="risk-settings-error"
          >
            {errorMessage}
          </p>
        )}
      </Card>
    </div>
  );
}
