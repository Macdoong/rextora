import type { BinanceDiagnosticsReport } from "./binanceDiagnosticsTypes";
import { getRextoraSettings } from "./settings/settingsService";
import { getServerTpSlReadiness } from "./serverTpSlReadiness";
import { rankCandidates } from "./aiRanker";
import { isEmergencyActive } from "./emergencyControls";
import { getRuntimeState } from "./runtimeState";
import type { LiveGateResult } from "./liveSafetyGate";

export type LiveReadinessItemStatus = "passed" | "needed" | "blocked" | "warning";

export interface LiveReadinessChecklistItem {
  id: string;
  label: string;
  status: LiveReadinessItemStatus;
  statusLabel: string;
  description: string;
  nextAction: string;
}

function findDiagnostic(report: BinanceDiagnosticsReport | null | undefined, id: string) {
  return report?.items.find((item) => item.id === id);
}

function diagnosticOk(report: BinanceDiagnosticsReport | null | undefined, id: string): boolean {
  const item = findDiagnostic(report, id);
  return item?.status === "normal";
}

function item(
  id: string,
  label: string,
  status: LiveReadinessItemStatus,
  description: string,
  nextAction: string
): LiveReadinessChecklistItem {
  const statusLabel = status === "passed" ? "통과" : status === "needed" ? "필요" : status === "warning" ? "주의" : "차단";
  return { id, label, status, statusLabel, description, nextAction };
}

export function buildFinalLiveReadinessChecklist(options: {
  diagnostics?: BinanceDiagnosticsReport | null;
  liveGate?: LiveGateResult;
}): LiveReadinessChecklistItem[] {
  const settings = getRextoraSettings();
  const report = options.diagnostics;
  const tpSlReadiness = getServerTpSlReadiness();
  const topCandidate = rankCandidates(1)[0];
  const emergency = isEmergencyActive() || getRuntimeState().emergencyStopped;
  const liveAllowed = settings.trading.allowLiveTrading || settings.trading.liveTradingEnabled;

  const binanceOk =
    diagnosticOk(report, "connection") &&
    diagnosticOk(report, "account") &&
    diagnosticOk(report, "balance") &&
    diagnosticOk(report, "position");

  return [
    item(
      "binance_connection",
      "Binance 연결",
      binanceOk ? "passed" : report ? "blocked" : "needed",
      binanceOk ? "Binance 연결 진단이 정상입니다." : "Binance 연결 진단을 먼저 완료하세요.",
      binanceOk ? "연결 상태를 유지하세요." : "시스템 상태에서 Binance 연결 다시 점검을 실행하세요."
    ),
    item(
      "account_queries",
      "계정/잔고 조회",
      diagnosticOk(report, "balance") && diagnosticOk(report, "account") ? "passed" : report ? "blocked" : "needed",
      diagnosticOk(report, "balance") ? "계정·잔고 조회가 정상입니다." : "조회 진단이 완료되지 않았습니다.",
      "Binance API 읽기 권한과 IP 제한을 확인하세요."
    ),
    item(
      "order_permission",
      "주문 권한",
      diagnosticOk(report, "order_permission") ? "passed" : report ? "blocked" : "needed",
      diagnosticOk(report, "order_permission")
        ? "주문 권한(canTrade)이 정상입니다."
        : "주문 권한 진단이 필요합니다.",
      "시스템 상태에서 Binance 연결 다시 점검을 실행하세요."
    ),
    item(
      "futures_permission",
      "Futures 권한",
      diagnosticOk(report, "futures_permission") ? "passed" : report ? "blocked" : "needed",
      diagnosticOk(report, "futures_permission")
        ? "Futures 계정 접근과 포지션 조회가 정상입니다."
        : "Futures 권한 진단이 필요합니다.",
      "Binance API 관리에서 Futures 권한을 확인하세요."
    ),
    item(
      "server_tpsl",
      "서버 TP/SL",
      tpSlReadiness.managerReady ? "passed" : tpSlReadiness.settingEnabled ? "needed" : "blocked",
      tpSlReadiness.managerReady
        ? "서버 TP/SL 매니저가 준비되었습니다."
        : "서버 TP/SL 매니저 초기화가 필요합니다.",
      tpSlReadiness.managerReady
        ? "진입 시 TP/SL이 자동 배치됩니다."
        : "시스템 상태에서 Binance 연결 다시 점검을 실행하세요."
    ),
    item(
      "emergency_status",
      "긴급 중단 상태",
      emergency ? "blocked" : "passed",
      emergency ? "긴급 중단 상태입니다. 신규 진입이 차단됩니다." : "긴급 중단이 활성화되지 않았습니다.",
      emergency ? "긴급 중단을 해제한 후 다시 시작하세요." : "정상 상태입니다."
    ),
    item(
      "live_setting",
      "LIVE 설정",
      liveAllowed ? "passed" : "needed",
      liveAllowed ? "설정에서 LIVE 실전 거래가 허용되어 있습니다." : "설정에서 LIVE 실전 거래가 꺼져 있습니다.",
      liveAllowed ? "자동매매 페이지에서 Start LIVE를 누르세요." : "설정 > 운영 모드에서 LIVE 실전 거래를 켜세요."
    ),
    item(
      "current_candidate",
      "현재 후보",
      topCandidate?.status === "진입 가능" && topCandidate.costPassed ? "passed" : topCandidate ? "warning" : "needed",
      topCandidate
        ? `${topCandidate.symbol} — ${topCandidate.status}`
        : "아직 후보가 없습니다.",
      topCandidate?.status === "진입 가능"
        ? "Start LIVE 후 진입 가능 후보만 실행됩니다."
        : "AI 후보 랭킹에서 진입 가능 후보를 확인하세요."
    )
  ];
}

const REMAINING_BLOCK_ALLOWLIST = [
  "설정에서 실전 거래 허용을 켜야 합니다.",
  "LIVE 실전 거래 설정이 꺼져 있습니다.",
  "서버 TP/SL 보호가 아직 준비되지 않았습니다.",
  "Binance 연결이 정상이 아닙니다.",
  "주문 권한이 정상이 아닙니다.",
  "Futures 권한이 정상이 아닙니다.",
  "긴급 중지 상태입니다.",
  "진입 가능한 후보가 선택되지 않았습니다.",
  "LIVE 모드가 선택되지 않았습니다.",
  "실전 거래 시작 버튼을 눌러야 LIVE가 시작됩니다."
];

function normalizeRemainingBlock(reason: string): string {
  if (reason.includes("서버 TP/SL") || reason.includes("서버 손절")) return "서버 TP/SL 보호가 아직 준비되지 않았습니다.";
  if (reason.includes("실전 거래 허용")) return "설정에서 실전 거래 허용을 켜야 합니다.";
  return reason;
}

export function getExpectedRemainingLiveBlocks(liveGate: LiveGateResult): string[] {
  const normalized = liveGate.blockedReasons
    .map(normalizeRemainingBlock)
    .filter((reason) => REMAINING_BLOCK_ALLOWLIST.includes(reason) || reason.includes("후보"));

  return Array.from(new Set(normalized));
}
