"use client";

import { useCallback, useEffect, useState } from "react";
import { SystemStatusPanel } from "@/components/rextora/SystemStatusPanel";
import { ErrorState } from "@/components/rextora/ErrorState";
import { LoadingState } from "@/components/rextora/LoadingState";
import { PanelErrorBoundary } from "@/components/rextora/PanelShell";
import { formatRuntimeMeta } from "@/src/lib/rextora/displayFormat";
import type { BinanceDiagnosticsReport } from "@/src/lib/rextora/binanceDiagnosticsTypes";
import type { SystemStatus } from "@/lib/types";
import type { RuntimeState } from "@/src/lib/rextora/runtimeState";

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
  tpSlDisplay?: {
    featureReady: boolean;
    settingEnabled: boolean;
    managerActive: boolean;
    displayLabel: string;
    displayTone: "success" | "warning" | "danger" | "default";
    nextAction: string;
  };
  positionSync?: { lastSyncAt: string | null; lastError: string | null };
  telegram?: { configured: boolean; serviceState: string; message: string };
  settingsStore?: { ok: boolean; updatedAt: string };
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
  telegram?: ExtendedSystemStatus["telegram"];
  settingsStore?: ExtendedSystemStatus["settingsStore"];
  diagnostics?: BinanceDiagnosticsReport | null;
};

type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
  meta: { durationMs: number; source: string };
};

const POLL_MS = 12_000;

/** Client wrapper that loads /api/rextora/system for the Settings #system section. */
export function SystemStatusSection() {
  const [status, setStatus] = useState<ExtendedSystemStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [binanceDiagnostics, setBinanceDiagnostics] =
    useState<BinanceDiagnosticsReport | null>(null);
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
          telegram: body.data.telegram,
          settingsStore: body.data.settingsStore,
          diagnostics: body.data.diagnostics,
        });
        if (body.data.diagnostics) setBinanceDiagnostics(body.data.diagnostics);
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
    const boot = window.setTimeout(() => void load(true), 0);
    const timer = window.setInterval(() => void load(false), POLL_MS);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [load]);

  return (
    <div className="space-y-3" data-testid="settings-system-section">
      {runtime && (
        <p className="rextora-caption" data-testid="runtime-meta">
          {formatRuntimeMeta(runtime)}
        </p>
      )}
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
          <SystemStatusPanel
            status={status}
            lastCheckTime={runtime?.lastHeartbeat}
            binanceDiagnostics={binanceDiagnostics}
            diagnosticsLoading={diagnosticsLoading}
            onRefreshDiagnostics={() => void refreshDiagnostics()}
          />
        )}
      </PanelErrorBoundary>
    </div>
  );
}
