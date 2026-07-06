"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui/primitives";
import { displayLabel } from "@/src/lib/rextora/displayLabels";
import type { EngineResult, TradingMode } from "@/lib/types";

type ActionLog = { id: string; label: string; message: string; mode: TradingMode; serviceState: string };

async function postAction(path: string): Promise<EngineResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "PAPER" })
  });
  if (!response.ok) return { ok: false, mode: "PAPER", serviceState: "simulated", message: `${path} 요청 실패` };
  return response.json() as Promise<EngineResult>;
}

export function QuickControls({ className = "" }: { className?: string }) {
  const [logs, setLogs] = useState<ActionLog[]>([]);

  async function run(label: string, path: string) {
    const result = await postAction(path);
    setLogs((current) => [{ id: `${label}-${Date.now()}`, label, message: result.message, mode: result.mode, serviceState: result.serviceState }, ...current].slice(0, 4));
  }

  return (
    <Card title="긴급 제어" className={className}>
      <div className="grid grid-cols-2 gap-2">
        <Button tone="danger" data-testid="bot-stop" onClick={() => run("봇 중지", "/api/bot/stop")}>봇 중지</Button>
        <Button tone="warning" data-testid="emergency-stop-all" onClick={() => run("긴급 전체 중단", "/api/emergency/stop-all")}>긴급 전체 중단</Button>
        <Button tone="warning" data-testid="close-all-positions" onClick={() => run("전체 포지션 청산", "/api/orders/close-position")}>전체 포지션 청산</Button>
        <Button tone="danger" data-testid="cancel-all-orders" onClick={() => run("모든 주문 취소", "/api/orders/cancel-all")}>모든 주문 취소</Button>
      </div>
      <p className="rextora-helper mt-3">PAPER 모의 실행 · LIVE 실전 거래 조건이 아직 충족되지 않았습니다.</p>
      <div className="rextora-helper mt-3 space-y-1 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-slate-300" data-testid="emergency-action-log">
        {logs.length === 0 ? <div>긴급 동작 로그 대기 중</div> : logs.map((log) => (
          <div key={log.id}>{log.label}: {log.message} ({displayLabel(log.mode)} · {displayLabel(log.serviceState)})</div>
        ))}
      </div>
    </Card>
  );
}
