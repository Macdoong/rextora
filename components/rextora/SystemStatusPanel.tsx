"use client";

import { Badge, Button, Card, Metric } from "@/components/ui/primitives";

import type { BinanceDiagnosticsReport } from "@/src/lib/rextora/binanceDiagnosticsTypes";
import { diagnosticStatusTone } from "@/src/lib/rextora/binanceDiagnosticsTypes";
import {
  displayBlockReason,
  displayDiagnosticStatus,
  displayEngineLabel,
  displayLabel,
  formatLastCheckTime,
  LIVE_READINESS_NEXT_ACTIONS
} from "@/src/lib/rextora/displayLabels";

import type { SystemStatus } from "@/lib/types";

const engineTone = (status: string) => {
  if (status === "정상") return "success";
  if (status === "대기") return "warning";
  if (status === "차단") return "danger";
  return "danger";
};

const permTone = (status: string) => (status === "정상" ? "success" : status === "차단" ? "danger" : "warning");

const readinessTone = (status: string) => {
  if (status === "LIVE_READY") return "success";
  if (status === "LIVE_ERROR" || status === "LIVE_EMERGENCY_STOPPED") return "danger";
  return "warning";
};

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

function resolveOrderPermissionDisplay(
  orderPermission: string,
  diagnostics?: BinanceDiagnosticsReport | null
): { value: string; tone: "success" | "warning" | "danger" | "default" } {
  const item = diagnostics?.items.find((entry) => entry.id === "order_permission");
  if (item?.status === "warning") return { value: "주의", tone: "warning" };
  if (orderPermission === "정상") return { value: "정상", tone: "success" };
  if (orderPermission === "차단") return { value: "차단", tone: "danger" };
  return { value: orderPermission, tone: "warning" };
}

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
        <p className="rextora-helper mt-1 text-slate-500">오류 코드: {errorCode}</p>
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
  const liveStatus = status.liveReadiness?.status ?? "LIVE_BLOCKED";
  const blockedReasons = status.liveReadiness?.blockedReasons ?? [];
  const liveReady = liveStatus === "LIVE_READY";
  const telegramConfigured = Boolean(status.telegram?.configured);
  const orderPermissionDisplay = resolveOrderPermissionDisplay(status.binance.orderPermission, binanceDiagnostics);
  const userStream = status.userStream;
  const tpSlDisplay = status.tpSlDisplay;

  return (
    <div className="space-y-3" data-testid="system-status-panel">
      <Card
        title="Binance 연결 진단"
        data-testid="binance-diagnostics-card"
        action={
          onRefreshDiagnostics ? (
            <Button
              tone="default"
              disabled={diagnosticsLoading}
              data-testid="binance-diagnostics-refresh"
              onClick={onRefreshDiagnostics}
            >
              {diagnosticsLoading ? "점검 중..." : "Binance 연결 다시 점검"}
            </Button>
          ) : undefined
        }
      >
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Metric label="네트워크" value={binanceDiagnostics?.network === "testnet" ? "테스트넷" : binanceDiagnostics?.network === "mainnet" ? "메인넷" : "-"} />
          <Metric label="마지막 점검" value={formatLastCheckTime(binanceDiagnostics?.checkedAt)} />
          <Metric
            label="Telegram"
            value={telegramConfigured ? "설정됨" : "미설정"}
            tone={telegramConfigured ? "success" : "warning"}
          />
        </div>
        {diagnosticsLoading && !binanceDiagnostics ? (
          <p className="rextora-helper text-slate-400">Binance 연결을 점검하는 중입니다...</p>
        ) : binanceDiagnostics?.items?.length ? (
          <div className="space-y-2">
            {binanceDiagnostics.items.map((item) => (
              <DiagnosticRow
                key={item.id}
                label={item.label}
                status={item.status}
                reason={item.reason}
                nextAction={item.nextAction}
                errorCode={item.errorCode}
              />
            ))}
          </div>
        ) : (
          <p className="rextora-helper text-slate-400">진단 정보가 없습니다. 「Binance 연결 다시 점검」 버튼을 눌러주세요.</p>
        )}
      </Card>

      <Card title="실전 거래 준비 상태" action={<Badge tone={readinessTone(liveStatus)}>{displayLabel(liveStatus)}</Badge>}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Metric label="현재 상태" value={displayLabel(liveStatus)} tone={readinessTone(liveStatus)} />
            <Metric label="실전 거래 가능 여부" value={liveReady ? "가능" : "불가"} tone={liveReady ? "success" : "danger"} />
            <Metric label="마지막 점검 시간" value={formatLastCheckTime(lastCheckTime)} />
          </div>
          <div>
            <p className="rextora-body mb-2 font-medium text-slate-200">차단 이유</p>
            {blockedReasons.length === 0 ? (
              <p className="rextora-helper">현재 차단 사유가 없습니다. 실전 시작 전 환경변수와 확인 문구를 다시 점검하세요.</p>
            ) : (
              <ol className="rextora-helper list-decimal space-y-1 pl-5 text-slate-300">
                {blockedReasons.slice(0, 8).map((reason) => (
                  <li key={reason}>{displayBlockReason(reason)}</li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <p className="rextora-body mb-2 font-medium text-slate-200">다음 조치</p>
            <ol className="rextora-helper list-decimal space-y-1 pl-5 text-slate-300">
              {LIVE_READINESS_NEXT_ACTIONS.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          </div>
        </div>
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

      <Card title="Binance 상태" data-testid="binance-status-summary">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Metric label="API 연결" value={status.binance.apiConnected ? displayLabel("connected") : displayLabel("not connected")} tone={status.binance.apiConnected ? "success" : "default"} />
          <Metric label="읽기 권한" value={status.binance.readPermission} tone={permTone(status.binance.readPermission)} />
          <Metric label="주문 권한" value={orderPermissionDisplay.value} tone={orderPermissionDisplay.tone} />
          <Metric label="잔고 조회" value={status.binance.balanceFetch} tone={permTone(status.binance.balanceFetch)} />
          <Metric label="시장 데이터" value={status.binance.marketData} tone={permTone(status.binance.marketData)} />
          <Metric
            label="서버 TP/SL"
            value={tpSlDisplay?.displayLabel ?? (status.binance.serverTpSlActive ? displayLabel("active") : displayLabel("SERVER REQUIRED"))}
            tone={tpSlDisplay?.displayTone ?? (status.binance.serverTpSlActive ? "success" : "danger")}
          />
        </div>
        {tpSlDisplay && (
          <div className="rextora-helper mt-3 space-y-1 text-slate-400" data-testid="tpsl-readiness-detail">
            <p>서버 TP/SL 기능: {tpSlDisplay.featureReady ? "구현됨" : "준비 중"}</p>
            <p>설정 상태: {tpSlDisplay.settingEnabled ? "활성화됨" : "비활성화됨"}</p>
            <p>매니저 상태: {tpSlDisplay.managerStatusLabel ?? (tpSlDisplay.managerReady ? "준비됨" : "준비 필요")}</p>
            {tpSlDisplay.reason && <p>설명: {tpSlDisplay.reason}</p>}
            <p>다음 조치: {tpSlDisplay.nextAction}</p>
          </div>
        )}
      </Card>

      {userStream && (
        <Card title="Binance 실시간 계정 동기화" data-testid="user-stream-status">
          <Metric label="상태" value={userStream.displayStatus ?? (userStream.connected ? displayLabel("connected") : displayLabel("not connected"))} tone={userStream.listenKeyReady ? "success" : userStream.connected ? "success" : "warning"} />
          {userStream.description && <p className="rextora-helper mt-2 text-slate-400">{userStream.description}</p>}
        </Card>
      )}
      {status.settingsStore && <Metric label="설정 저장소" value={status.settingsStore.ok ? "정상" : "오류"} />}
    </div>
  );
}
