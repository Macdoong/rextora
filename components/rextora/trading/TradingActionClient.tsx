"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { displayBlockReason, displayLabel } from "@/src/lib/rextora/displayLabels";
import type { EngineResult, TradingMode } from "@/lib/types";

type ActionLog = {
  id: string;
  label: string;
  message: string;
  mode: TradingMode;
  serviceState: string;
};

type ActionBody = { mode: TradingMode };

const paperBody: ActionBody = { mode: "PAPER" };
const liveBody: ActionBody = { mode: "LIVE" };

type ReadinessSummary = {
  liveReady: boolean;
  liveAllowed: boolean;
  remainingBlocks: string[];
};

async function postAction(path: string, body: ActionBody = paperBody): Promise<EngineResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as EngineResult | null;
    return payload ?? { ok: false, mode: body.mode, serviceState: "live-blocked", message: `${path} 요청 실패` };
  }

  return response.json() as Promise<EngineResult>;
}

export function PaperBotActionPanel() {
  const [status, setStatus] = useState("PAPER 모의 거래 대기");
  const [logs, setLogs] = useState<ActionLog[]>([]);

  async function run(label: string, path: string, body = paperBody) {
    const result = await postAction(path, body);
    const log = {
      id: `${label}-${Date.now()}`,
      label,
      message: result.message,
      mode: result.mode,
      serviceState: result.serviceState
    };
    setLogs((current) => [log, ...current].slice(0, 5));
    setStatus(result.ok ? result.message : `차단: ${result.message}`);
  }

  return (
    <Card title="PAPER 모의 거래" action={<Badge tone="success">PAPER</Badge>}>
      <div className="rextora-body mb-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-green-200" data-testid="bot-action-status">
        {status}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button tone="success" data-testid="bot-start" onClick={() => run("PAPER 봇 시작", "/api/bot/start")}>봇 시작</Button>
        <Button tone="danger" data-testid="bot-stop" onClick={() => run("PAPER 봇 중지", "/api/bot/stop")}>봇 중지</Button>
        <Button tone="muted" data-testid="bot-restart" onClick={() => run("PAPER 봇 재시작", "/api/bot/restart")}>재시작</Button>
      </div>
      <div className="rextora-helper mt-3 space-y-1 text-slate-300" data-testid="bot-action-log">
        {logs.length === 0 ? <div>아직 PAPER 동작 로그가 없습니다.</div> : logs.map((log) => (
          <div key={log.id}>{log.label}: {log.message} ({displayLabel(log.mode)} · {displayLabel(log.serviceState)})</div>
        ))}
      </div>
    </Card>
  );
}

export function LiveTradingActionPanel() {
  const [status, setStatus] = useState("LIVE 실전 거래 대기");
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [readiness, setReadiness] = useState<ReadinessSummary | null>(null);

  const loadReadiness = useCallback(async () => {
    const res = await fetch("/api/rextora/live/readiness", { cache: "no-store" });
    const body = await res.json();
    if (body.ok) setReadiness(body.data);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReadiness();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReadiness]);

  async function run(label: string, path: string, body = liveBody) {
    const result = await postAction(path, body);
    const log = {
      id: `${label}-${Date.now()}`,
      label,
      message: result.message,
      mode: result.mode,
      serviceState: result.serviceState
    };
    setLogs((current) => [log, ...current].slice(0, 6));
    setStatus(result.ok ? result.message : displayBlockReason(result.blockedReasons?.[0] ?? result.message));
    await loadReadiness();
  }

  const summary = readiness?.liveReady
    ? "실전 거래 실행 가능"
    : readiness?.liveAllowed
      ? "일부 운영 조건이 아직 충족되지 않았습니다."
      : "설정에서 LIVE 실전 거래를 켜야 합니다.";

  return (
    <Card title="LIVE 실전 거래" action={<Badge tone={readiness?.liveReady ? "success" : "warning"}>LIVE</Badge>} data-testid="live-trading-panel">
      <div
        className={`rextora-body mb-3 rounded-lg border p-3 ${readiness?.liveReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-orange-500/30 bg-orange-500/10 text-orange-100"}`}
        data-testid="live-start-status"
      >
        {summary}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Button tone="success" data-testid="live-start" onClick={() => run("LIVE 시작", "/api/bot/start", liveBody)}>Start LIVE</Button>
        <Button tone="danger" data-testid="live-stop" onClick={() => run("LIVE 중지", "/api/bot/stop", liveBody)}>Stop bot</Button>
        <Button tone="warning" data-testid="live-emergency-stop" onClick={() => run("긴급 중단", "/api/emergency/stop-all", liveBody)}>Emergency stop</Button>
        <Button tone="warning" data-testid="live-close-all" onClick={() => run("전체 청산", "/api/orders/close-position", liveBody)}>Close all positions</Button>
        <Button tone="danger" data-testid="live-cancel-all" onClick={() => run("전체 주문 취소", "/api/orders/cancel-all", liveBody)}>Cancel all orders</Button>
      </div>
      <div className="rextora-helper mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-100" data-testid="live-start-blocked-reason">
        {status}
      </div>
      <div className="rextora-helper mt-3 space-y-1 text-slate-300" data-testid="live-action-log">
        {logs.length === 0 ? <div>LIVE 동작 로그 대기 중</div> : logs.map((log) => (
          <div key={log.id}>{log.label}: {log.message}</div>
        ))}
      </div>
    </Card>
  );
}

export function EmergencyActionPanel() {
  const [logs, setLogs] = useState<ActionLog[]>([]);

  async function run(label: string, path: string) {
    const result = await postAction(path);
    const log = {
      id: `${label}-${Date.now()}`,
      label,
      message: result.message,
      mode: result.mode,
      serviceState: result.serviceState
    };
    setLogs((current) => [log, ...current].slice(0, 6));
  }

  return (
    <Card title="긴급 제어">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div>
          <Button tone="warning" data-testid="emergency-stop-all" onClick={() => run("긴급 전체 중단", "/api/emergency/stop-all")}>긴급 전체 중단</Button>
          <p className="rextora-helper mt-1">봇을 멈추고 신규 진입을 차단합니다.</p>
        </div>
        <div>
          <Button tone="warning" data-testid="close-all-positions" onClick={() => run("모든 포지션 청산", "/api/orders/close-position")}>전체 포지션 청산</Button>
          <p className="rextora-helper mt-1">현재 열린 포지션을 모두 종료합니다.</p>
        </div>
        <div>
          <Button tone="danger" data-testid="cancel-all-orders" onClick={() => run("모든 주문 취소", "/api/orders/cancel-all")}>모든 주문 취소</Button>
          <p className="rextora-helper mt-1">아직 체결되지 않은 주문과 TP/SL 주문을 취소합니다.</p>
        </div>
      </div>
      <p className="rextora-helper mt-3">긴급 동작은 로그로 남습니다. PAPER는 모의 실행, LIVE는 실전 조건 충족 시 실행됩니다.</p>
      <div className="rextora-helper mt-3 space-y-1 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-slate-300" data-testid="emergency-action-log">
        {logs.length === 0 ? <div>PAPER 긴급 동작 로그 대기 중</div> : logs.map((log) => (
          <div key={log.id}>{log.label}: {log.message} ({displayLabel(log.mode)} · {displayLabel(log.serviceState)})</div>
        ))}
      </div>
    </Card>
  );
}
