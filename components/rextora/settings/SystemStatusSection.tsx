"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsSystemStatusView } from "@/components/rextora/settings/SettingsSystemStatusView";
import { ErrorState } from "@/components/rextora/ErrorState";
import { LoadingState } from "@/components/rextora/LoadingState";
import { PanelErrorBoundary } from "@/components/rextora/PanelShell";
import type { BinanceDiagnosticsReport } from "@/src/lib/rextora/binanceDiagnosticsTypes";
import type { SystemStatus } from "@/lib/types";
import { formatRuntimeMeta } from "@/src/lib/rextora/displayFormat";
import type { RuntimeState } from "@/src/lib/rextora/runtimeState";
import { SETTINGS_SYSTEM_POLL_MS } from "@/src/lib/rextora/settings/settingsSystemStatusPresentation";

type TpSlDisplay = {
  featureReady: boolean;
  settingEnabled: boolean;
  managerActive: boolean;
  displayLabel: string;
  displayTone: "success" | "warning" | "danger" | "default";
  nextAction: string;
  managerStatusLabel?: string;
  reason?: string;
};

type ExtendedSystemStatus = SystemStatus & {
  liveReadiness?: { status: string; passed: boolean; blockedReasons: string[] };
  userStream?: {
    connected: boolean;
    fallbackPolling: boolean;
    listenKeyReady?: boolean;
    displayStatus?: string;
    description?: string;
  };
  tpSl?: { ready: boolean; openTpSlCount: number; failedTpSlCount: number };
  tpSlDisplay?: TpSlDisplay;
  positionSync?: { lastSyncAt: string | null; lastError: string | null };
  orderSync?: { lastSyncAt: string | null; lastError: string | null };
  telegram?: { configured: boolean; serviceState: string; message: string };
  settingsStore?: { ok: boolean; updatedAt: string };
  audit?: { total: number; lastEntry: { type: string; timestamp: string } | null };
  diagnostics?: BinanceDiagnosticsReport | null;
};

type SystemApiData = {
  engines: SystemStatus["engines"];
  binance: SystemStatus["binance"];
  runtime: RuntimeState;
  serviceState: string;
  liveReadiness?: ExtendedSystemStatus["liveReadiness"];
  userStream?: ExtendedSystemStatus["userStream"];
  tpSl?: ExtendedSystemStatus["tpSl"];
  tpSlDisplay?: ExtendedSystemStatus["tpSlDisplay"];
  positionSync?: ExtendedSystemStatus["positionSync"];
  orderSync?: ExtendedSystemStatus["orderSync"];
  telegram?: ExtendedSystemStatus["telegram"];
  settingsStore?: ExtendedSystemStatus["settingsStore"];
  audit?: ExtendedSystemStatus["audit"];
  diagnostics?: BinanceDiagnosticsReport | null;
};

type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
  meta: { durationMs: number; source: string };
};

/** Client wrapper that loads /api/rextora/system for the Settings #system section. */
export function SystemStatusSection(props: {
  defaultMode: string;
  liveTradingEnabled: boolean;
  allowLiveTrading: boolean;
  serverTpSlRequired: boolean;
  riskState: string;
}) {
  const [status, setStatus] = useState<ExtendedSystemStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (fresh = false) => {
    try {
      const response = await fetch(
        `/api/rextora/system${fresh ? "?fresh=1&market=1" : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        setError(true);
        return;
      }
      const body = (await response.json()) as ApiEnvelope<SystemApiData>;
      if (body.ok) {
        setStatus({
          engines: body.data.engines,
          binance: body.data.binance,
          serviceState: body.data.serviceState as SystemStatus["serviceState"],
          liveReadiness: body.data.liveReadiness,
          userStream: body.data.userStream,
          tpSl: body.data.tpSl,
          tpSlDisplay: body.data.tpSlDisplay,
          positionSync: body.data.positionSync,
          orderSync: body.data.orderSync,
          telegram: body.data.telegram,
          settingsStore: body.data.settingsStore,
          audit: body.data.audit,
          diagnostics: body.data.diagnostics,
        });
        setRuntime(body.data.runtime);
        setError(false);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    try {
      await load(true);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [load]);

  useEffect(() => {
    const boot = window.setTimeout(() => void load(false), 0);
    const timer = window.setInterval(() => void load(false), SETTINGS_SYSTEM_POLL_MS);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [load]);

  return (
    <div className="space-y-3 v3-st-system" data-testid="settings-system-section">
      {runtime ? (
        <p className="v3-st-help" data-testid="runtime-meta">
          {formatRuntimeMeta(runtime)}
        </p>
      ) : null}
      <PanelErrorBoundary title="시스템 상태">
        {loading ? (
          <LoadingState lines={8} />
        ) : error || !status ? (
          <ErrorState
            message="시스템 상태를 불러오지 못했습니다."
            why={
              error
                ? "서버 응답 오류 또는 네트워크 실패"
                : "응답이 비어 있습니다."
            }
            fix="네트워크와 서버 로그를 확인한 뒤 다시 시도하세요."
            onRetry={() => void load(true)}
          />
        ) : (
          <SettingsSystemStatusView
            runtime={runtime}
            engines={status.engines}
            binance={status.binance}
            liveReadiness={status.liveReadiness}
            userStream={status.userStream}
            tpSlDisplay={status.tpSlDisplay}
            positionSync={status.positionSync}
            orderSync={status.orderSync}
            telegram={status.telegram}
            settingsStore={status.settingsStore}
            audit={status.audit}
            diagnostics={status.diagnostics}
            diagnosticsLoading={diagnosticsLoading}
            onRefreshDiagnostics={() => void refreshDiagnostics()}
            defaultMode={props.defaultMode}
            liveTradingEnabled={props.liveTradingEnabled}
            allowLiveTrading={props.allowLiveTrading}
            serverTpSlRequired={props.serverTpSlRequired}
            riskState={props.riskState}
          />
        )}
      </PanelErrorBoundary>
    </div>
  );
}
