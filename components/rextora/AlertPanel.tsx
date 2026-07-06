"use client";

import { useState } from "react";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { displayLabel } from "@/src/lib/rextora/displayLabels";
import type { AlertItem, TelegramAlertSettings } from "@/lib/types";

export function AlertPanel({
  telegramStatus,
  settings,
  alerts
}: {
  telegramStatus: { configured: boolean; serviceState: string; message: string };
  settings: TelegramAlertSettings;
  alerts: AlertItem[];
}) {
  const [testResult, setTestResult] = useState("");

  async function sendTest() {
    const res = await fetch("/api/telegram/test", { method: "POST" });
    const body = await res.json();
    setTestResult(body.message ?? "테스트 완료");
  }

  const settingRows: Array<[string, boolean]> = [
    ["진입 후보 알림", settings.entryCandidate],
    ["진입 알림", settings.entry],
    ["청산 알림", settings.exit],
    ["손익 알림", settings.pnl],
    ["위험 알림", settings.risk],
    ["일일 리포트", settings.dailyReport],
    ["TOP 후보 브리핑", settings.topCandidateBriefing]
  ];

  return (
    <div className="space-y-3">
      <Card title="Telegram 연결" action={<Badge tone={telegramStatus.configured ? "success" : "muted"}>{displayLabel(telegramStatus.serviceState)}</Badge>}>
        <Metric label="상태" value={telegramStatus.message} />
        <Button tone="purple" className="mt-3" onClick={sendTest}>테스트 발송</Button>
        {testResult && <p className="mt-2 text-xs text-slate-300">{testResult}</p>}
      </Card>
      <Card title="알림 설정">
        <p className="rextora-helper mb-3">각 알림은 켜짐/꺼짐으로 제어합니다. 실전 거래 전 Telegram 테스트 발송을 권장합니다.</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {settingRows.map(([label, enabled]) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-xs">
              <span>{label}</span>
              <Badge tone={enabled ? "success" : "muted"}>{enabled ? displayLabel("ON") : displayLabel("OFF")}</Badge>
            </div>
          ))}
        </div>
      </Card>
      <Card title="최근 알림">
        <div className="overflow-x-auto">
          <table className="rextora-table w-full text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="px-2 py-2">시간</th>
                <th className="px-2 py-2">코인</th>
                <th className="px-2 py-2">내용</th>
                <th className="px-2 py-2">위험도</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/60">
                  <td className="px-2 py-2">{a.time}</td>
                  <td className="px-2 py-2">{a.symbol}</td>
                  <td className="px-2 py-2">{a.content}</td>
                  <td className="px-2 py-2">{a.riskLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
