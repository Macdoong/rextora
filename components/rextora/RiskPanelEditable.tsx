"use client";

import { useState } from "react";
import { Badge, Button, Card, Metric, ProgressBar } from "@/components/ui/primitives";
import type { RiskSettings, RiskStatus } from "@/lib/types";

const DEFAULT_SETTINGS: RiskSettings = {
  dailyLossLimitPct: -5,
  totalLossLimitPct: -10,
  consecutiveLossLimit: 3,
  maxDailyTrades: 20,
  maxLeverage: 2.5,
  maxSimultaneousPositions: 1,
  maxPositionSizePerCoinPct: 3,
  overtradingCooldownMinutes: 15
};

const RISK_FIELD_HELPERS: Record<keyof RiskSettings, string> = {
  dailyLossLimitPct: "하루에 허용할 최대 손실입니다.",
  totalLossLimitPct: "전체 계정 기준 최대 손실입니다.",
  consecutiveLossLimit: "연속으로 손실이 발생하면 봇을 멈춥니다.",
  maxSimultaneousPositions: "동시에 열 수 있는 최대 거래 수입니다.",
  maxPositionSizePerCoinPct: "한 코인에 너무 많이 들어가지 않도록 제한합니다.",
  maxLeverage: "사용할 수 있는 최대 레버리지입니다.",
  maxDailyTrades: "과매매를 막기 위한 제한입니다.",
  overtradingCooldownMinutes: "거래 후 다음 거래까지 대기 시간입니다."
};

type EditableRisk = RiskStatus;

export function RiskPanelEditable({ initialRisk }: { initialRisk: EditableRisk }) {
  const [settings, setSettings] = useState<RiskSettings>({ ...initialRisk.settings });
  const [statusMessage, setStatusMessage] = useState("");
  const risk = { ...initialRisk, settings };
  const dailyRemaining = Math.max(0, 100 - (Math.abs(risk.dailyLossPct / risk.settings.dailyLossLimitPct) * 100));
  const riskTone = risk.riskState === "정상" ? "success" : risk.riskState === "주의" ? "warning" : "danger";

  function updateField<K extends keyof RiskSettings>(key: K, value: RiskSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setStatusMessage("");
  }

  function saveSettings() {
    setStatusMessage("리스크 설정이 mock 로컬 상태에 저장되었습니다. 실거래에는 연결되지 않습니다.");
  }

  function resetDefaults() {
    setSettings({ ...DEFAULT_SETTINGS });
    setStatusMessage("기본값으로 초기화되었습니다.");
  }

  const fields: Array<{ key: keyof RiskSettings; label: string; step?: number }> = [
    { key: "dailyLossLimitPct", label: "일일 손실 한도 (%)", step: 0.5 },
    { key: "totalLossLimitPct", label: "전체 손실 한도 (%)", step: 0.5 },
    { key: "consecutiveLossLimit", label: "연속 손실 제한", step: 1 },
    { key: "maxSimultaneousPositions", label: "동시 포지션 수", step: 1 },
    { key: "maxPositionSizePerCoinPct", label: "코인별 진입 금액 제한 (%)", step: 0.5 },
    { key: "maxLeverage", label: "최대 레버리지", step: 0.1 },
    { key: "maxDailyTrades", label: "하루 최대 거래 횟수", step: 1 },
    { key: "overtradingCooldownMinutes", label: "과매매 방지 쿨다운 (분)", step: 1 }
  ];

  return (
    <div className="space-y-3">
      <Card title="리스크 상태" action={<Badge tone={riskTone}>{risk.riskState}</Badge>}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fields.map(({ key, label, step = 1 }) => (
            <label key={key} className="block">
              <span className="rextora-body mb-1 block font-medium text-slate-200">{label}</span>
              <p className="rextora-helper mb-2">{RISK_FIELD_HELPERS[key]}</p>
              <input
                type="number"
                step={step}
                value={settings[key] as number}
                onChange={(e) => updateField(key, Number(e.target.value) as RiskSettings[typeof key])}
                className="rextora-body w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button tone="success" onClick={saveSettings}>설정 저장</Button>
          <Button tone="muted" onClick={resetDefaults}>기본값 복원</Button>
        </div>
        {statusMessage && <p className="rextora-helper mt-3 text-green-300">{statusMessage}</p>}
      </Card>
      <Card title="한도 사용 현황">
        <div className="space-y-3">
          <div>
            <div className="rextora-helper mb-1 flex justify-between"><span>일 손실</span><span>{risk.dailyLossPct}% / {risk.settings.dailyLossLimitPct}%</span></div>
            <ProgressBar value={100 - dailyRemaining} tone="danger" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="연속 손실" value={`${risk.consecutiveLosses}/${risk.settings.consecutiveLossLimit}`} />
            <Metric label="일 거래" value={`${risk.dailyTrades}/${risk.settings.maxDailyTrades}`} />
            <Metric label="포지션" value={`${risk.openPositions}/${risk.settings.maxSimultaneousPositions}`} />
          </div>
        </div>
      </Card>
    </div>
  );
}
