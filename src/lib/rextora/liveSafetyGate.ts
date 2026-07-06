import { getConfig } from "./config";
import { hasBinanceCredentials } from "./env";
import { getApiStatus } from "./apiStatusService";
import { isServerTpSlManagerReady } from "./serverTpSlReadiness";
import { getRextoraSettings } from "./settings/settingsService";
import { verifyBinanceReadiness } from "./positionSyncService";
import { getMarketDataSnapshot, getMarketStaleBlockReason } from "./marketDataStore";
import { getAccountState } from "./accountStateStore";
import { isEmergencyActive } from "./emergencyControls";
import { getRuntimeState } from "./runtimeState";
import type { BinanceDiagnosticsReport } from "./binanceDiagnosticsTypes";
import type { AiCandidate, ApiStatus, LiveSafetyChecklist, TradingMode } from "./types";
import type { LiveExecutionStatus } from "./tpSlTypes";
import { getLiveExecutionStatus, setLiveExecutionStatus } from "./serverTpSlManager";

export interface LiveGateOptions {
  mode?: TradingMode;
  operatorLiveStartRequested?: boolean;
  diagnostics?: BinanceDiagnosticsReport;
  candidate?: AiCandidate;
  api?: ApiStatus;
  /** Readiness UI — skip mode / operator-start / candidate checks */
  readinessOnly?: boolean;
  /** Active order placement — skip candidate / operator-start checks */
  executionInProgress?: boolean;
}

export interface LiveGateResult {
  passed: boolean;
  blockedReasons: string[];
  checklist: LiveSafetyChecklist;
  status: LiveExecutionStatus;
}

function findDiagnosticItem(report: BinanceDiagnosticsReport | undefined, id: string) {
  return report?.items.find((item) => item.id === id);
}

function diagnosticIsNormal(report: BinanceDiagnosticsReport | undefined, id: string): boolean {
  return findDiagnosticItem(report, id)?.status === "normal";
}

function isLiveTradingAllowed(): boolean {
  const settings = getRextoraSettings();
  return settings.trading.allowLiveTrading || settings.trading.liveTradingEnabled;
}

function buildChecklist(
  api: ApiStatus,
  diagnostics?: BinanceDiagnosticsReport,
  candidate?: AiCandidate
): LiveSafetyChecklist {
  const settings = getRextoraSettings();
  const emergency =
    isEmergencyActive() ||
    getLiveExecutionStatus() === "LIVE_EMERGENCY_STOPPED" ||
    getRuntimeState().emergencyStopped;

  return {
    exchangeConnectionNormal: diagnostics ? diagnosticIsNormal(diagnostics, "connection") : api.binanceFuturesConnected,
    balanceFetchNormal: diagnostics ? diagnosticIsNormal(diagnostics, "balance") : api.readPermission === "정상",
    accountReadNormal: diagnostics
      ? diagnosticIsNormal(diagnostics, "account") && diagnosticIsNormal(diagnostics, "position")
      : api.readPermission === "정상",
    orderPermissionNormal: diagnostics
      ? diagnosticIsNormal(diagnostics, "order_permission")
      : api.orderPermission === "정상",
    futuresPermissionNormal: diagnostics
      ? diagnosticIsNormal(diagnostics, "futures_permission")
      : api.futuresPermission === "정상",
    serverTpSlEnabled: !settings.tpSl.serverTpSlRequired || isServerTpSlManagerReady(),
    liveSettingEnabled: isLiveTradingAllowed(),
    emergencyStopActive: emergency,
    candidateReady: Boolean(candidate && candidate.status === "진입 가능" && candidate.costPassed)
  };
}

function checkDuplicatePosition(symbol: string): boolean {
  const settings = getRextoraSettings();
  if (!settings.execution.preventDuplicateSymbolPosition) return false;
  const account = getAccountState();
  return account.positions.some((p) => p.symbol === symbol && p.side !== "FLAT" && p.quantity > 0);
}

function countOpenPositions(): number {
  const account = getAccountState();
  return account.positions.filter((p) => p.side !== "FLAT" && p.quantity > 0).length;
}

export async function evaluateLiveSafetyGateAsync(options: LiveGateOptions = {}): Promise<LiveGateResult> {
  const syncResult = evaluateLiveSafetyGate(options);
  const reasons = [...syncResult.blockedReasons];
  const settings = getRextoraSettings();
  const diagnostics = options.diagnostics;

  if (!options.readinessOnly && !options.executionInProgress) {
    const readiness = await verifyBinanceReadiness();
    if (!diagnostics || !diagnosticIsNormal(diagnostics, "connection")) {
      if (!readiness.serverTimeOk) reasons.push("Binance 서버 시간 조회 실패");
      if (!readiness.exchangeInfoOk) reasons.push("exchangeInfo 로드 실패");
      if (!readiness.balanceOk) reasons.push("잔고 조회 실패");
      if (!readiness.accountOk) reasons.push("계정 조회 실패");
    }
  }

  if (settings.risk.blockWhenMarketDataStale && !options.readinessOnly && !options.executionInProgress) {
    if (!diagnostics || !diagnosticIsNormal(diagnostics, "connection")) {
      const staleReason = getMarketStaleBlockReason();
      if (staleReason) reasons.push(staleReason);
    }
  }

  const passed = reasons.length === 0;
  const status: LiveExecutionStatus = passed ? "LIVE_READY" : "LIVE_BLOCKED";
  if (!options.readinessOnly) setLiveExecutionStatus(status);

  return {
    passed,
    blockedReasons: Array.from(new Set(reasons)),
    checklist: syncResult.checklist,
    status
  };
}

export function evaluateLiveSafetyGate(options: LiveGateOptions = {}): LiveGateResult {
  const config = getConfig();
  const settings = getRextoraSettings();
  const api = options.api ?? getApiStatus();
  const diagnostics = options.diagnostics;
  const candidate = options.candidate;
  const checklist = buildChecklist(api, diagnostics, candidate);
  const reasons: string[] = [];
  const readinessOnly = options.readinessOnly === true;
  const executionInProgress = options.executionInProgress === true;

  if (!readinessOnly && !executionInProgress && options.mode !== "LIVE") {
    reasons.push("LIVE 모드가 선택되지 않았습니다.");
  }

  if (!isLiveTradingAllowed()) {
    reasons.push("LIVE 실전 거래 설정이 꺼져 있습니다.");
  }

  if (
    !readinessOnly &&
    !executionInProgress &&
    settings.trading.operatorLiveStartRequired &&
    !options.operatorLiveStartRequested
  ) {
    reasons.push("실전 거래 시작 버튼을 눌러야 LIVE가 시작됩니다.");
  }

  if (!hasBinanceCredentials()) {
    reasons.push("Binance API 키가 설정되지 않았습니다.");
  }

  if (!checklist.exchangeConnectionNormal && (!diagnostics || !diagnosticIsNormal(diagnostics, "connection"))) {
    reasons.push("Binance 연결이 정상이 아닙니다.");
  }

  if (!checklist.balanceFetchNormal && (!diagnostics || !diagnosticIsNormal(diagnostics, "balance"))) {
    reasons.push("잔고 조회가 정상 확인되지 않았습니다.");
  }

  if (!checklist.accountReadNormal && diagnostics) {
    if (!diagnosticIsNormal(diagnostics, "account") || !diagnosticIsNormal(diagnostics, "position")) {
      reasons.push("계정/포지션 조회가 정상 확인되지 않았습니다.");
    }
  }

  if (!checklist.orderPermissionNormal) {
    reasons.push("주문 권한이 정상이 아닙니다.");
  }

  if (!checklist.futuresPermissionNormal) {
    reasons.push("Futures 권한이 정상이 아닙니다.");
  }

  if ((config.serverTpSlRequired || settings.tpSl.serverTpSlRequired) && !checklist.serverTpSlEnabled) {
    reasons.push("서버 TP/SL 보호가 아직 준비되지 않았습니다.");
  }

  if (checklist.emergencyStopActive) {
    reasons.push("긴급 중지 상태입니다.");
  }

  if (!readinessOnly && !executionInProgress) {
    const maxPositions = settings.execution.maxConcurrentPositions ?? settings.risk.maxPositions;
    if (countOpenPositions() >= maxPositions) {
      reasons.push("최대 동시 포지션 수에 도달했습니다.");
    }
  }

  if (!readinessOnly && candidate) {
    if (candidate.status !== "진입 가능") reasons.push("후보 상태가 진입 가능이 아닙니다.");
    if (!candidate.costPassed) reasons.push("비용 규칙 미통과");
    const coin = getMarketDataSnapshot().coins.find((c) => c.symbol === candidate.symbol);
    const spreadPct = coin?.spread ?? 0;
    const fundingPct = coin?.fundingFee ?? 0;
    if (spreadPct > settings.signal.maxSpreadPct) reasons.push("스프레드가 허용 한도를 초과했습니다.");
    if (Math.abs(fundingPct) > settings.cost.maxFundingFeePct) reasons.push("펀딩비가 허용 한도를 초과했습니다.");
    if (checkDuplicatePosition(candidate.symbol)) {
      reasons.push("동일 심볼 포지션이 이미 존재합니다.");
    }
  } else if (!readinessOnly && !executionInProgress && !candidate) {
    reasons.push("진입 가능한 후보가 선택되지 않았습니다.");
  }

  const passed = reasons.length === 0;
  const status: LiveExecutionStatus = passed ? "LIVE_READY" : "LIVE_BLOCKED";
  if (!readinessOnly) setLiveExecutionStatus(status);

  return {
    passed,
    blockedReasons: Array.from(new Set(reasons)),
    checklist,
    status
  };
}

export function canPassLiveSafetyGate(options: LiveGateOptions = {}): boolean {
  return evaluateLiveSafetyGate({
    ...options,
    mode: "LIVE",
    operatorLiveStartRequested: true
  }).passed;
}
