"use client";

import { useState } from "react";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";

import type { BinanceDiagnosticsReport } from "@/src/lib/rextora/binanceDiagnosticsTypes";
import { diagnosticStatusTone } from "@/src/lib/rextora/binanceDiagnosticsTypes";
import {
  displayBlockReason,
  displayDiagnosticStatus,
  displayEngineLabel,
  displayLabel,
  formatLastCheckTime
} from "@/src/lib/rextora/displayLabels";

import type { SystemStatus } from "@/lib/types";

const engineTone = (status: string) => {
  if (status === "정상") return "success";
  if (status === "대기") return "warning";
  if (status === "차단") return "danger";
  return "danger";
};

const permTone = (status: string) => (status === "정상" ? "success" : status === "차단" ? "danger" : "warning");

type ExtendedStatus = SystemStatus & {
  liveReadiness?: { status: string; passed: boolean; blockedReasons: string[] };
  userStream?: {
    connected: boolean;
    fallbackPolling: boolean;
    listenKeyReady?: boolean;
    displayStatus?: string;
    description?: string;
  };
  tpSl?: { ready: boolean; openTpSlCount: number; failedTpSlCount: number };
  tpSlDisplay?: {
    featureReady: boolean;
    settingEnabled: boolean;
    managerActive: boolean;
    managerReady?: boolean;
    managerStatusLabel?: string;
    displayLabel: string;
    displayTone: "success" | "warning" | "danger" | "default";
    nextAction: string;
    reason?: string;
  };
  positionSync?: { lastSyncAt: string | null; lastError: string | null };
  telegram?: { configured: boolean; serviceState: string; message: string };
  settingsStore?: { ok: boolean; updatedAt: string };
};

const ADVANCED_IDS = new Set([
  "account",
  "balance",
  "position",
  "open_orders",
  "user_data_stream",
  "order_permission",
  "futures_permission"
]);

function DiagnosticRow({ label, status, reason, nextAction, errorCode }: {
  label: string;
  status: string;
  reason: string;
  nextAction: string;
  errorCode?: number | string;
}) {
  const tone = diagnosticStatusTone(status as "normal" | "warning" | "blocked" | "unknown");
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2" data-testid={`binance-diagnostic-${label}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="rextora-body font-medium text-slate-100">{label}</span>
        <Badge tone={tone}>{displayDiagnosticStatus(status)}</Badge>
      </div>
      <p className="rextora-helper mt-2 text-slate-400">사유: {reason}</p>
      <p className="rextora-helper mt-1 text-slate-300">다음 조치: {nextAction}</p>
      {errorCode !== undefined && (
        <p className="rextora-helper mt-1 text-slate-500" data-testid="diagnostic-error-code">오류 코드: {errorCode}</p>
      )}
    </div>
  );
}

export function SystemStatusPanel({
  status,
  lastCheckTime,
  binanceDiagnostics,
  diagnosticsLoading,
  onRefreshDiagnostics
}: {
  status: ExtendedStatus;
  lastCheckTime?: string;
  binanceDiagnostics?: BinanceDiagnosticsReport | null;
  diagnosticsLoading?: boolean;
  onRefreshDiagnostics?: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const liveReady = status.liveReadiness?.passed ?? status.liveReadiness?.status === "LIVE_READY";
  const blockedReasons = status.liveReadiness?.blockedReasons ?? [];
  const telegramConfigured = Boolean(status.telegram?.configured);
  const tpSlDisplay = status.tpSlDisplay;
  const connectionItem = binanceDiagnostics?.items.find((item) => item.id === "connection");
  const connectionLabel = connectionItem ? displayDiagnosticStatus(connectionItem.status) : status.binance.apiConnected ? "연결됨" : "미연결";

  const simpleItems = binanceDiagnostics?.items.filter((item) => item.id === "connection") ?? [];
  const advancedItems = binanceDiagnostics?.items.filter((item) => ADVANCED_IDS.has(item.id)) ?? [];

  return (
    <div className="space-y-3" data-testid="system-status-panel">
      <Card title="간단 상태" data-testid="system-status-simple">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Metric label="Binance 연결" value={connectionLabel} tone={connectionItem?.status === "normal" || status.binance.apiConnected ? "success" : "warning"} />
          <Metric label="실전 주문 가능 여부" value={liveReady ? "가능" : "불가"} tone={liveReady ? "success" : "danger"} />
          <Metric
            label="서버 손절/익절"
            value={tpSlDisplay?.displayLabel ?? (status.binance.serverTpSlActive ? "준비됨" : "준비 필요")}
            tone={tpSlDisplay?.displayTone ?? (status.binance.serverTpSlActive ? "success" : "warning")}
          />
          <Metric label="텔레그램" value={telegramConfigured ? "설정됨" : "미설정"} tone={telegramConfigured ? "success" : "warning"} />
          <Metric label="최근 점검 시간" value={formatLastCheckTime(lastCheckTime ?? binanceDiagnostics?.checkedAt)} />
        </div>
        {blockedReasons.length > 0 && (
          <div className="rextora-helper mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-orange-100">
            <p className="font-medium">실행 차단 요약</p>
            <p className="mt-1">{displayBlockReason(blockedReasons[0])}</p>
          </div>
        )}
        {onRefreshDiagnostics && (
          <div className="mt-3">
            <Button tone="default" disabled={diagnosticsLoading} data-testid="binance-diagnostics-refresh" onClick={onRefreshDiagnostics}>
              {diagnosticsLoading ? "점검 중..." : "Binance 연결 다시 점검"}
            </Button>
          </div>
        )}
      </Card>

      <Card
        title="고급 진단 보기"
        data-testid="system-status-advanced"
        action={
          <Button tone="muted" data-testid="advanced-diagnostics-toggle" onClick={() => setAdvancedOpen((v) => !v)}>
            {advancedOpen ? "접기" : "펼치기"}
          </Button>
        }
      >
        {!advancedOpen ? (
          <p className="rextora-helper text-slate-400">계정·권한·User Data Stream 등 상세 진단은 필요할 때만 펼쳐서 확인하세요.</p>
        ) : diagnosticsLoading && !binanceDiagnostics ? (
          <p className="rextora-helper text-slate-400">Binance 연결을 점검하는 중입니다...</p>
        ) : (
          <div className="space-y-3">
            {simpleItems.map((item) => (
              <DiagnosticRow key={item.id} label={item.label} status={item.status} reason={item.reason} nextAction={item.nextAction} errorCode={item.errorCode} />
            ))}
            {advancedItems.length > 0 ? (
              advancedItems.map((item) => (
                <DiagnosticRow key={item.id} label={item.label} status={item.status} reason={item.reason} nextAction={item.nextAction} errorCode={item.errorCode} />
              ))
            ) : (
              <p className="rextora-helper text-slate-400">고급 진단 정보가 없습니다. 「Binance 연결 다시 점검」을 실행하세요.</p>
            )}
            {status.userStream && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2" data-testid="user-stream-status">
                <div className="flex items-center justify-between gap-2">
                  <span className="rextora-body font-medium text-slate-100">User Data Stream</span>
                  <Badge tone={status.userStream.listenKeyReady ? "success" : "warning"}>
                    {status.userStream.displayStatus ?? (status.userStream.connected ? displayLabel("connected") : displayLabel("not connected"))}
                  </Badge>
                </div>
                {status.userStream.description && <p className="rextora-helper mt-2 text-slate-400">{status.userStream.description}</p>}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="파이프라인 모듈 상태">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {status.engines.map((engine) => (
            <div key={engine.name} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
              <div>
                <div className="rextora-body font-semibold text-slate-100">{displayEngineLabel(engine.label)}</div>
                <div className="rextora-helper mt-1">{engine.message.replace("mock 또는 configured", `${displayLabel("mock")} 또는 ${displayLabel("configured")}`)}</div>
              </div>
              <Badge tone={engineTone(engine.status)}>{engine.status}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Binance 요약" data-testid="binance-status-summary">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Metric label="API 연결" value={status.binance.apiConnected ? displayLabel("connected") : displayLabel("not connected")} tone={status.binance.apiConnected ? "success" : "default"} />
          <Metric label="읽기 권한" value={status.binance.readPermission} tone={permTone(status.binance.readPermission)} />
          <Metric label="시장 데이터" value={status.binance.marketData} tone={permTone(status.binance.marketData)} />
        </div>
        {tpSlDisplay && (
          <div className="rextora-helper mt-3 space-y-1 text-slate-400" data-testid="tpsl-readiness-detail">
            <p>매니저 상태: {tpSlDisplay.managerStatusLabel ?? (tpSlDisplay.managerReady ? "준비됨" : "준비 필요")}</p>
            {tpSlDisplay.reason && <p>설명: {tpSlDisplay.reason}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
