"use client";

import {
  displayBlockReason,
  displayDiagnosticStatus,
  displayEngineLabel,
  displayLabel,
  formatDurationMs,
  formatLastCheckTime,
} from "@/src/lib/rextora/displayLabels";
import type { BinanceDiagnosticsReport } from "@/src/lib/rextora/binanceDiagnosticsTypes";
import type { RuntimeState } from "@/src/lib/rextora/runtimeState";
import type { SystemStatus } from "@/lib/types";
import {
  SETTINGS_SYSTEM_LEDE,
  SETTINGS_SYSTEM_POLL_MS,
  SETTINGS_SYSTEM_TECHNICAL_KEYS,
  settingsSystemBotLabel,
  settingsSystemConnectionLabel,
  settingsSystemConnectionTone,
  settingsSystemEmergencyLabel,
  settingsSystemEmergencyTone,
  settingsSystemEngineStatusNote,
  settingsSystemEngineTone,
  settingsSystemLiveFlagLabel,
  settingsSystemLiveFlagTone,
  settingsSystemLiveOrderLabel,
  settingsSystemLiveOrderTone,
  settingsSystemPermissionTone,
  settingsSystemRiskTone,
  settingsSystemStoreLabel,
  settingsSystemStoreTone,
  settingsSystemSyncLabel,
  settingsSystemSyncTone,
  settingsSystemTechnicalKeyLabel,
  settingsSystemTelegramLabel,
  settingsSystemTelegramTone,
  type SettingsSystemTone,
} from "@/src/lib/rextora/settings/settingsSystemStatusPresentation";

type Engine = SystemStatus["engines"][number];

type TpSlDisplay = {
  displayLabel: string;
  displayTone?: "success" | "warning" | "danger" | "default";
  managerStatusLabel?: string;
  reason?: string;
  nextAction?: string;
};

export type SettingsSystemStatusViewProps = {
  runtime: RuntimeState | null;
  engines: Engine[];
  binance: SystemStatus["binance"];
  liveReadiness?: { status: string; passed: boolean; blockedReasons: string[] };
  userStream?: {
    connected: boolean;
    fallbackPolling: boolean;
    listenKeyReady?: boolean;
    displayStatus?: string;
    description?: string;
  };
  tpSlDisplay?: TpSlDisplay;
  positionSync?: { lastSyncAt: string | null; lastError: string | null };
  orderSync?: { lastSyncAt: string | null; lastError: string | null };
  telegram?: { configured: boolean; serviceState: string; message: string };
  settingsStore?: { ok: boolean; updatedAt: string };
  audit?: { total: number; lastEntry: { type: string; timestamp: string } | null };
  diagnostics?: BinanceDiagnosticsReport | null;
  diagnosticsLoading?: boolean;
  onRefreshDiagnostics?: () => void;
  defaultMode: string;
  liveTradingEnabled: boolean;
  allowLiveTrading: boolean;
  serverTpSlRequired: boolean;
  riskState: string;
};

function toneClass(tone: SettingsSystemTone): string | undefined {
  return tone;
}

function Fact({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: SettingsSystemTone;
  testId?: string;
}) {
  return (
    <div className="v3-st-metric" data-testid={testId}>
      <span>{label}</span>
      <b className={toneClass(tone)}>{value}</b>
    </div>
  );
}

export function SettingsSystemStatusView(props: SettingsSystemStatusViewProps) {
  const liveReady = props.liveReadiness?.passed ?? props.liveReadiness?.status === "LIVE_READY";
  const connectionItem = props.diagnostics?.items.find((item) => item.id === "connection");
  const telegramConfigured = Boolean(props.telegram?.configured);
  const lastCheck = props.runtime?.lastHeartbeat ?? props.diagnostics?.checkedAt;
  const advancedItems = props.diagnostics?.items ?? [];
  const pollSec = SETTINGS_SYSTEM_POLL_MS / 1000;

  return (
    <div className="v3-st-system" data-testid="system-status-simple">
      <p className="v3-st-lede">{SETTINGS_SYSTEM_LEDE}</p>

      <section className="v3-st-group" data-testid="settings-system-summary">
        <h3 className="v3-st-group-label">운영 요약</h3>
        <div className="v3-st-facts">
          <Fact
            label="실행 모드"
            value={displayLabel(props.runtime?.mode ?? props.defaultMode)}
            testId="settings-system-runtime-mode"
          />
          <Fact
            label="봇 상태"
            value={settingsSystemBotLabel(
              Boolean(props.runtime?.running),
              String(props.runtime?.state ?? "대기"),
            )}
            testId="settings-system-bot-state"
          />
          <Fact
            label="실전 거래 사용"
            value={settingsSystemLiveFlagLabel(props.liveTradingEnabled)}
            tone={settingsSystemLiveFlagTone(props.liveTradingEnabled)}
            testId="settings-system-live-enabled"
          />
          <Fact
            label="실전 거래 허용"
            value={settingsSystemLiveFlagLabel(props.allowLiveTrading)}
            tone={settingsSystemLiveFlagTone(props.allowLiveTrading)}
            testId="settings-system-live-allowed"
          />
          <Fact
            label="실주문"
            value={settingsSystemLiveOrderLabel(Boolean(liveReady))}
            tone={settingsSystemLiveOrderTone(Boolean(liveReady))}
            testId="settings-system-live-orders"
          />
          <Fact
            label="긴급 정지"
            value={settingsSystemEmergencyLabel(Boolean(props.runtime?.emergencyStopped))}
            tone={settingsSystemEmergencyTone(Boolean(props.runtime?.emergencyStopped))}
            testId="settings-system-emergency"
          />
          <Fact
            label="위험 상태"
            value={props.riskState || "미확인"}
            tone={settingsSystemRiskTone(props.riskState)}
            testId="settings-system-risk"
          />
          <Fact
            label="서버 손절/익절 설정"
            value={props.serverTpSlRequired ? "필수" : "선택"}
          />
        </div>
      </section>

      <section className="v3-st-group" data-testid="settings-system-runtime">
        <h3 className="v3-st-group-label">런타임</h3>
        <div className="v3-st-facts">
          <Fact
            label="시장 감시"
            value={props.runtime?.scanInProgress ? "현재 시장 감시 중" : "시장 감시 대기 중"}
          />
          <Fact
            label="마지막 감시"
            value={formatDurationMs(props.runtime?.lastScanDurationMs)}
          />
          <Fact
            label="시장 데이터 경과"
            value={formatDurationMs(props.runtime?.marketSnapshotAgeMs)}
          />
          <Fact label="마지막 갱신" value={formatLastCheckTime(lastCheck)} />
          <Fact label="상태 폴링" value={`${pollSec}초`} />
        </div>
      </section>

      <section className="v3-st-group" data-testid="settings-system-services">
        <h3 className="v3-st-group-label">외부 서비스</h3>
        <div className="v3-st-facts">
          <Fact
            label="Binance 연결"
            value={settingsSystemConnectionLabel(
              connectionItem?.status,
              props.binance.apiConnected,
            )}
            tone={settingsSystemConnectionTone(
              connectionItem?.status,
              props.binance.apiConnected,
            )}
          />
          <Fact
            label="읽기 권한"
            value={props.binance.readPermission}
            tone={settingsSystemPermissionTone(props.binance.readPermission)}
          />
          <Fact
            label="주문 권한"
            value={props.binance.orderPermission}
            tone={settingsSystemPermissionTone(props.binance.orderPermission)}
          />
          <Fact
            label="시장 데이터"
            value={props.binance.marketData}
            tone={settingsSystemPermissionTone(props.binance.marketData)}
          />
          <Fact
            label="텔레그램"
            value={settingsSystemTelegramLabel(telegramConfigured)}
            tone={settingsSystemTelegramTone(telegramConfigured)}
          />
          <Fact
            label="서버 손절/익절"
            value={
              props.tpSlDisplay?.displayLabel ??
              (props.binance.serverTpSlActive ? "준비됨" : "준비 필요")
            }
            tone={
              props.tpSlDisplay?.displayTone === "success"
                ? "ok"
                : props.tpSlDisplay?.displayTone === "danger"
                  ? "bad"
                  : props.tpSlDisplay?.displayTone === "warning"
                    ? "warn"
                    : undefined
            }
          />
        </div>
        <p className="v3-st-note">
          주문 권한 차단은 실주문이 막혀 있음을 뜻하며, 시스템 오류가 아닙니다.
        </p>
      </section>

      {(props.liveReadiness?.blockedReasons?.length ?? 0) > 0 ? (
        <section className="v3-st-group" data-testid="settings-system-safety">
          <h3 className="v3-st-group-label">실주문 차단 사유</h3>
          <p className="v3-st-note">
            {displayBlockReason(props.liveReadiness?.blockedReasons?.[0] ?? "")}
          </p>
        </section>
      ) : null}

      <section className="v3-st-group" data-testid="settings-system-storage">
        <h3 className="v3-st-group-label">저장 · 동기화</h3>
        <div className="v3-st-facts">
          <Fact
            label="설정 저장소"
            value={settingsSystemStoreLabel(props.settingsStore?.ok ?? false)}
            tone={settingsSystemStoreTone(props.settingsStore?.ok ?? false)}
          />
          <Fact
            label="설정 저장 시각"
            value={formatLastCheckTime(props.settingsStore?.updatedAt)}
          />
          <Fact
            label="포지션 동기화"
            value={settingsSystemSyncLabel(
              props.positionSync?.lastSyncAt ?? null,
              props.positionSync?.lastError ?? null,
            )}
            tone={settingsSystemSyncTone(
              props.positionSync?.lastSyncAt ?? null,
              props.positionSync?.lastError ?? null,
            )}
          />
          <Fact
            label="주문 동기화"
            value={settingsSystemSyncLabel(
              props.orderSync?.lastSyncAt ?? null,
              props.orderSync?.lastError ?? null,
            )}
            tone={settingsSystemSyncTone(
              props.orderSync?.lastSyncAt ?? null,
              props.orderSync?.lastError ?? null,
            )}
          />
          {props.audit ? (
            <Fact label="감사 기록" value={`${props.audit.total}건`} />
          ) : null}
        </div>
      </section>

      <section className="v3-st-group" data-testid="settings-system-engines">
        <h3 className="v3-st-group-label">모듈 상태 (시드)</h3>
        <p className="v3-st-note">
          아래 값은 실시간 점검이 아니라 시스템에 등록된 모듈 목록입니다.
        </p>
        <div className="v3-st-facts">
          {props.engines.map((engine) => (
            <Fact
              key={engine.name}
              label={displayEngineLabel(engine.label)}
              value={`${engine.status} · ${settingsSystemEngineStatusNote(engine.serviceState)}`}
              tone={settingsSystemEngineTone(engine)}
            />
          ))}
        </div>
      </section>

      {props.onRefreshDiagnostics ? (
        <div className="v3-st-toolbar">
          <button
            type="button"
            className="rextora-btn-text rounded bg-slate-700 px-4 py-2 text-white"
            disabled={props.diagnosticsLoading}
            data-testid="binance-diagnostics-refresh"
            onClick={props.onRefreshDiagnostics}
          >
            {props.diagnosticsLoading ? "점검 중..." : "Binance 연결 다시 점검"}
          </button>
        </div>
      ) : null}

      <details className="v3-st-disc" data-testid="settings-system-advanced">
        <summary>기술 상세</summary>
        {props.userStream ? (
          <div className="v3-st-metric" data-testid="user-stream-status" style={{ marginTop: 10 }}>
            <span>User Data Stream</span>
            <b className={props.userStream.listenKeyReady ? "warn" : undefined}>
              {props.userStream.displayStatus ??
                (props.userStream.connected ? displayLabel("connected") : displayLabel("not connected"))}
            </b>
            {props.userStream.description ? (
              <p className="v3-st-help">{props.userStream.description}</p>
            ) : null}
          </div>
        ) : null}
        {props.tpSlDisplay?.reason ? (
          <p className="v3-st-note">손절/익절: {props.tpSlDisplay.reason}</p>
        ) : null}
        {props.diagnostics ? (
          <div className="v3-st-facts" style={{ marginTop: 10 }}>
            <Fact label="진단 네트워크" value={props.diagnostics.network} />
            <div className="v3-st-metric">
              <span>진단 주소</span>
              <b className="v3-st-wrap">{props.diagnostics.baseUrl}</b>
            </div>
            <Fact
              label="진단 시각"
              value={formatLastCheckTime(props.diagnostics.checkedAt)}
            />
          </div>
        ) : (
          <p className="v3-st-note">고급 진단 정보가 없습니다. 「Binance 연결 다시 점검」을 실행하세요.</p>
        )}
        {advancedItems.map((item) => (
          <div
            key={item.id}
            className="v3-st-metric"
            data-testid={`binance-diagnostic-${item.label}`}
            style={{ marginTop: 8 }}
          >
            <span>{item.label}</span>
            <b className={item.status === "normal" ? "ok" : item.status === "blocked" ? "warn" : "warn"}>
              {displayDiagnosticStatus(item.status)}
            </b>
            <p className="v3-st-help">사유: {item.reason}</p>
            <p className="v3-st-help">다음 조치: {item.nextAction}</p>
            {item.errorCode !== undefined ? (
              <p className="v3-st-help" data-testid="diagnostic-error-code">
                오류 코드: {item.errorCode}
              </p>
            ) : null}
          </div>
        ))}
        <ul className="v3-st-tech-keys">
          {SETTINGS_SYSTEM_TECHNICAL_KEYS.map((key) => (
            <li key={key}>
              <span>{key}</span>
              {settingsSystemTechnicalKeyLabel(key)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
