"use client";

import { useCallback, useEffect, useState } from "react";
import { SystemStatusPanel } from "@/components/rextora/SystemStatusPanel";
import { PageHeader } from "@/components/rextora/StatusCards";
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
  liveReadiness?: { status: string; passed: boolean; blockedReasons: string[] };
  userStream?: ExtendedSystemStatus["userStream"];
  tpSl?: { ready: boolean; openTpSlCount: number; failedTpSlCount: number };
  tpSlDisplay?: ExtendedSystemStatus["tpSlDisplay"];
  positionSync?: { lastSyncAt: string | null; lastError: string | null };
  telegram?: { configured: boolean; serviceState: string; message: string };
  settingsStore?: { ok: boolean; updatedAt: string };
  diagnostics?: BinanceDiagnosticsReport | null;
};

const POLL_MS = 12_000;

type ApiEnvelope<T> = { ok: boolean; data: T; meta: { durationMs: number; source: string } };

export default function SystemStatusPage() {
  const [status, setStatus] = useState<ExtendedSystemStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [binanceDiagnostics, setBinanceDiagnostics] = useState<BinanceDiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (fresh = false) => {
    try {
      const response = await fetch(`/api/rextora/system${fresh ? "?fresh=1&market=1" : ""}`, { cache: "no-store" });
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
          diagnostics: body.data.diagnostics
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
    <>
      <PageHeader title="시스템 상태" description="시장 감시부터 주문 실행까지 각 엔진 상태와 Binance 연결을 확인합니다." />
      {runtime && (
        <p className="rextora-helper mb-3 text-slate-500" data-testid="runtime-meta">
          {formatRuntimeMeta(runtime)}
        </p>
      )}
      <PanelErrorBoundary title="시스템 상태">
        {loading ? (
          <LoadingState lines={10} />
        ) : error || !status ? (
          <ErrorState onRetry={() => void load(true)} />
        ) : (
          <>
          <SystemStatusPanel
            status={status}
            lastCheckTime={runtime?.lastHeartbeat}
            binanceDiagnostics={binanceDiagnostics}
            diagnosticsLoading={diagnosticsLoading}
            onRefreshDiagnostics={() => void refreshDiagnostics()}
          />
          </>
        )}
      </PanelErrorBoundary>
    </>
  );
}
