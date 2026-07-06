import { runBinanceDiagnostics } from "./binance/binanceDiagnosticsService";
import type { BinanceDiagnosticsReport, BinanceDiagnosticItem } from "./binanceDiagnosticsTypes";
import { getExpectedRemainingLiveBlocks } from "./liveReadinessChecklist";
import { evaluateLiveSafetyGate } from "./liveSafetyGate";
import { getMarketSnapshotAgeMs, getMarketDataSnapshot, refreshMarketData } from "./marketDataStore";
import { getMarketSourceBadge } from "./marketWatcherService";
import { getApiStatus } from "./apiStatusService";
import { getRextoraSettings } from "./settings/settingsService";
import { getTpSlManagerStatus, getTpSlStatus, tpSlImplementationReadiness } from "./tpSlManager";
import {
  getServerTpSlReadiness,
  initializeServerTpSlManagerReadiness,
  isServerTpSlManagerReady
} from "./serverTpSlReadiness";
import { getTelegramStatus } from "./telegramService";
import { syncPositionsFromBinance } from "./positionSyncService";
import { getUserStreamStatus } from "./binance/binanceUserStreamManager";
import { systemStatusSeed } from "./seedData";
import type { ApiStatus, PermissionStatus, SystemStatus } from "./types";

export type UserStreamDisplay = {
  connected: boolean;
  fallbackPolling: boolean;
  listenKeyReady: boolean;
  displayStatus: string;
  description: string;
};

export type TpSlDisplay = {
  featureReady: boolean;
  settingEnabled: boolean;
  managerActive: boolean;
  managerReady: boolean;
  managerStatusLabel: string;
  displayLabel: string;
  displayTone: "success" | "warning" | "danger" | "default";
  nextAction: string;
  reason: string;
};

export type SyncedSystemPayload = {
  binance: SystemStatus["binance"];
  liveReadiness: ReturnType<typeof evaluateLiveSafetyGate> & { status: string };
  userStream: UserStreamDisplay;
  tpSl: ReturnType<typeof getTpSlManagerStatus>;
  tpSlDisplay: TpSlDisplay;
  diagnostics: BinanceDiagnosticsReport | null;
};

let cachedDiagnostics: { report: BinanceDiagnosticsReport; at: number } | null = null;
const DIAGNOSTICS_CACHE_MS = 120_000;

export function cacheDiagnosticsReport(report: BinanceDiagnosticsReport): void {
  cachedDiagnostics = { report, at: Date.now() };
}

export function getCachedDiagnosticsReport(): BinanceDiagnosticsReport | null {
  if (!cachedDiagnostics) return null;
  if (Date.now() - cachedDiagnostics.at > DIAGNOSTICS_CACHE_MS) return null;
  return cachedDiagnostics.report;
}

function findDiagnostic(report: BinanceDiagnosticsReport | null | undefined, id: string): BinanceDiagnosticItem | undefined {
  return report?.items.find((item) => item.id === id);
}

function diagnosticIsNormal(report: BinanceDiagnosticsReport | null | undefined, id: string): boolean {
  return findDiagnostic(report, id)?.status === "normal";
}

function diagnosticIsOk(report: BinanceDiagnosticsReport | null | undefined, id: string): boolean {
  const item = findDiagnostic(report, id);
  return item?.status === "normal" || item?.status === "warning";
}

function permissionFromDiagnostic(
  report: BinanceDiagnosticsReport | null | undefined,
  id: string,
  fallback: PermissionStatus
): PermissionStatus {
  const item = findDiagnostic(report, id);
  if (!item) return fallback;
  if (item.status === "normal") return "정상";
  if (item.status === "warning") return "미확인";
  if (item.status === "blocked") return "차단";
  return "미확인";
}

export function applyDiagnosticsToApiStatus(
  report: BinanceDiagnosticsReport | null | undefined,
  base: ApiStatus = getApiStatus()
): ApiStatus {
  if (!report) return base;

  const connectionOk = diagnosticIsNormal(report, "connection");
  const futuresOk = diagnosticIsNormal(report, "futures_permission");
  const orderItem = findDiagnostic(report, "order_permission");

  let orderPermission: PermissionStatus = base.orderPermission;
  if (orderItem?.status === "normal" || orderItem?.status === "warning") orderPermission = "정상";
  else if (orderItem?.status === "blocked") orderPermission = "차단";

  return {
    ...base,
    binanceFuturesConnected: connectionOk || base.binanceFuturesConnected,
    readPermission: diagnosticIsNormal(report, "account") ? "정상" : connectionOk ? base.readPermission : "미확인",
    futuresPermission: futuresOk ? "정상" : permissionFromDiagnostic(report, "futures_permission", base.futuresPermission),
    orderPermission,
    serverTpSlActive: isServerTpSlManagerReady(),
    serviceState: connectionOk ? "read-only" : base.serviceState,
    strategyFileLoaded: base.strategyFileLoaded,
    strategyHashValid: base.strategyHashValid
  };
}

export function buildSyncedBinanceStatus(
  report: BinanceDiagnosticsReport | null | undefined,
  marketDataStatus: PermissionStatus
): SystemStatus["binance"] {
  const settings = getRextoraSettings();
  const tpSlActive = settings.tpSl.serverTpSlRequired && isServerTpSlManagerReady();

  if (!report) {
    return {
      ...systemStatusSeed.binance,
      marketData: marketDataStatus,
      serverTpSlActive: tpSlActive
    };
  }

  const orderItem = findDiagnostic(report, "order_permission");
  let orderPermission: PermissionStatus = "미확인";
  if (orderItem?.status === "normal") orderPermission = "정상";
  else if (orderItem?.status === "warning") orderPermission = "미확인";
  else if (orderItem?.status === "blocked") orderPermission = "차단";

  return {
    apiConnected: diagnosticIsNormal(report, "connection"),
    readPermission: diagnosticIsNormal(report, "account") ? "정상" : permissionFromDiagnostic(report, "connection", "미확인"),
    orderPermission,
    balanceFetch: diagnosticIsNormal(report, "balance") ? "정상" : permissionFromDiagnostic(report, "balance", "미확인"),
    marketData: marketDataStatus,
    serverTpSlActive: tpSlActive
  };
}

export function buildUserStreamDisplay(
  report: BinanceDiagnosticsReport | null | undefined,
  managerConnected: boolean,
  fallbackPolling: boolean
): UserStreamDisplay {
  const listenKeyReady = diagnosticIsNormal(report, "user_stream");
  if (listenKeyReady) {
    return {
      connected: managerConnected,
      fallbackPolling,
      listenKeyReady: true,
      displayStatus: "연결 준비 완료",
      description: "listenKey 발급 테스트가 정상입니다. 실시간 WebSocket 연결은 봇 실행 시 시작됩니다."
    };
  }
  const item = findDiagnostic(report, "user_stream");
  return {
    connected: managerConnected,
    fallbackPolling,
    listenKeyReady: false,
    displayStatus: managerConnected ? "연결됨" : fallbackPolling ? "폴링 대체" : "미연결",
    description: item?.reason ?? "listenKey 테스트를 실행하려면 Binance 연결 다시 점검을 누르세요."
  };
}

export function buildTpSlDisplay(): TpSlDisplay {
  const readiness = getServerTpSlReadiness();
  const ordersActive = getTpSlStatus("LIVE").active;

  if (readiness.implementationReady && readiness.settingEnabled && readiness.managerReady) {
    return {
      featureReady: readiness.implementationReady,
      settingEnabled: readiness.settingEnabled,
      managerActive: ordersActive,
      managerReady: true,
      managerStatusLabel: "준비됨",
      displayLabel: "통과",
      displayTone: "success",
      nextAction: "LIVE 체크리스트의 TP/SL 항목을 함께 확인하세요.",
      reason: "서버 TP/SL 보호 주문을 사용할 준비가 완료되었습니다."
    };
  }
  if (readiness.implementationReady && readiness.settingEnabled && !readiness.managerReady) {
    return {
      featureReady: readiness.implementationReady,
      settingEnabled: readiness.settingEnabled,
      managerActive: ordersActive,
      managerReady: false,
      managerStatusLabel: "준비 필요",
      displayLabel: "준비 필요",
      displayTone: "warning",
      nextAction: "서버 TP/SL 매니저 초기화를 실행하고 다시 점검하세요.",
      reason: "서버 TP/SL 설정은 활성화되었지만 매니저 초기화가 완료되지 않았습니다."
    };
  }
  if (readiness.implementationReady && !readiness.settingEnabled) {
    return {
      featureReady: readiness.implementationReady,
      settingEnabled: false,
      managerActive: ordersActive,
      managerReady: false,
      managerStatusLabel: "준비 필요",
      displayLabel: "비활성화됨",
      displayTone: "warning",
      nextAction: "설정 > TP/SL에서 서버 손절·익절 보호를 활성화하세요.",
      reason: "서버 TP/SL 기능은 구현되었으나 설정에서 비활성화되어 있습니다."
    };
  }
  return {
    featureReady: readiness.implementationReady,
    settingEnabled: readiness.settingEnabled,
    managerActive: ordersActive,
    managerReady: false,
    managerStatusLabel: "준비 필요",
    displayLabel: "준비 필요",
    displayTone: "danger",
    nextAction: tpSlImplementationReadiness.message,
    reason: readiness.reason
  };
}

export function resolveMarketDataStatus(): PermissionStatus {
  const market = getMarketDataSnapshot();
  if (market.stale) return "미확인";
  if (market.source === "real" || getMarketSourceBadge() === "real") return "정상";
  if (market.source === "mock" && market.updatedAt > 0) return "정상";
  return "미확인";
}

export function buildTradingPageLiveContext(): {
  diagnostics: BinanceDiagnosticsReport | null;
  api: ApiStatus;
  liveReadiness: ReturnType<typeof evaluateLiveSafetyGate> & { blockedReasons: string[] };
} {
  const report = getCachedDiagnosticsReport();
  const api = applyDiagnosticsToApiStatus(report);
  const liveGate = evaluateLiveSafetyGate({
    readinessOnly: true,
    diagnostics: report ?? undefined,
    api
  });
  const blockedReasons =
    report && diagnosticIsNormal(report, "connection")
      ? getExpectedRemainingLiveBlocks(liveGate)
      : liveGate.blockedReasons;

  return {
    diagnostics: report,
    api,
    liveReadiness: {
      ...liveGate,
      blockedReasons
    }
  };
}

export async function buildSyncedSystemPayload(options?: {
  forceDiagnostics?: boolean;
  forceMarketRefresh?: boolean;
}): Promise<SyncedSystemPayload> {
  if (options?.forceMarketRefresh) {
    await refreshMarketData({ force: true });
  }

  let report = getCachedDiagnosticsReport();
  if (options?.forceDiagnostics || !report) {
    report = await runBinanceDiagnostics();
    cacheDiagnosticsReport(report);
  }

  if (report && diagnosticIsNormal(report, "balance")) {
    await syncPositionsFromBinance().catch(() => undefined);
  }

  if (report && diagnosticIsNormal(report, "connection") && getRextoraSettings().tpSl.serverTpSlRequired) {
    await initializeServerTpSlManagerReadiness({ exchangeInfoValidated: true }).catch(() => undefined);
  }

  const api = applyDiagnosticsToApiStatus(report);
  const marketDataStatus = resolveMarketDataStatus();
  const liveGate = evaluateLiveSafetyGate({
    readinessOnly: true,
    diagnostics: report ?? undefined,
    api
  });
  const blockedReasons =
    report && diagnosticIsNormal(report, "connection")
      ? getExpectedRemainingLiveBlocks(liveGate)
      : liveGate.blockedReasons;
  const stream = getUserStreamStatus();

  return {
    binance: buildSyncedBinanceStatus(report, marketDataStatus),
    liveReadiness: {
      ...liveGate,
      blockedReasons,
      status: liveGate.status
    },
    userStream: buildUserStreamDisplay(report, stream.connected, stream.fallbackPolling),
    tpSl: getTpSlManagerStatus(),
    tpSlDisplay: buildTpSlDisplay(),
    diagnostics: report
  };
}