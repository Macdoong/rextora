import type { BinanceDiagnosticsReport } from "./binanceDiagnosticsTypes";
import { getServerTpSlReadiness } from "./serverTpSlReadiness";
import type { LiveSafetyChecklist } from "./types";

export type ChecklistDisplayStatus = "passed" | "warning" | "blocked";

export interface TradingChecklistRow {
  id: string;
  label: string;
  status: ChecklistDisplayStatus;
  statusLabel: string;
  description?: string;
}

function findDiagnostic(report: BinanceDiagnosticsReport | null | undefined, id: string) {
  return report?.items.find((item) => item.id === id);
}

function statusLabel(status: ChecklistDisplayStatus): string {
  if (status === "passed") return "통과";
  if (status === "warning") return "주의";
  return "차단";
}

function diagnosticRow(
  id: string,
  label: string,
  report: BinanceDiagnosticsReport | null | undefined,
  diagnosticId: string,
  fallbackOk: boolean,
  options?: { warningAsPassed?: boolean; description?: string }
): TradingChecklistRow {
  const item = findDiagnostic(report, diagnosticId);
  if (item?.status === "normal") {
    return {
      id,
      label,
      status: "passed",
      statusLabel: "통과",
      description: options?.description
    };
  }
  if (item?.status === "warning") {
    return {
      id,
      label,
      status: options?.warningAsPassed ? "passed" : "warning",
      statusLabel: options?.warningAsPassed ? "통과" : "주의",
      description: options?.description
    };
  }
  if (item?.status === "blocked") {
    return { id, label, status: "blocked", statusLabel: "차단", description: item.reason };
  }
  if (report) {
    return { id, label, status: "blocked", statusLabel: "차단" };
  }
  return {
    id,
    label,
    status: fallbackOk ? "passed" : "warning",
    statusLabel: fallbackOk ? "통과" : "필요"
  };
}

export function buildTradingChecklistRows(
  checklist: LiveSafetyChecklist,
  diagnostics?: BinanceDiagnosticsReport | null
): TradingChecklistRow[] {
  const tpSlReadiness = getServerTpSlReadiness();

  const exchange = diagnosticRow(
    "exchange",
    "거래소 연결 정상",
    diagnostics,
    "connection",
    checklist.exchangeConnectionNormal
  );
  const balance = diagnosticRow(
    "balance",
    "잔고 조회 정상",
    diagnostics,
    "balance",
    checklist.balanceFetchNormal
  );
  const order = diagnosticRow(
    "order_permission",
    "주문 권한 정상",
    diagnostics,
    "order_permission",
    checklist.orderPermissionNormal,
    { description: "canTrade=true 상태여야 LIVE 주문이 가능합니다." }
  );
  const futures = diagnosticRow(
    "futures_permission",
    "Futures 권한 정상",
    diagnostics,
    "futures_permission",
    checklist.futuresPermissionNormal
  );

  let tpSl: TradingChecklistRow;
  if (checklist.serverTpSlEnabled || tpSlReadiness.managerReady) {
    tpSl = {
      id: "server_tpsl",
      label: "서버 TP/SL 활성",
      status: "passed",
      statusLabel: "통과",
      description: "서버 TP/SL 매니저가 준비되었습니다."
    };
  } else if (tpSlReadiness.settingEnabled) {
    tpSl = {
      id: "server_tpsl",
      label: "서버 TP/SL 활성",
      status: "warning",
      statusLabel: "필요",
      description: "서버 TP/SL 매니저 초기화가 필요합니다."
    };
  } else {
    tpSl = {
      id: "server_tpsl",
      label: "서버 TP/SL 활성",
      status: "warning",
      statusLabel: "준비 필요"
    };
  }

  const configRow = (id: string, label: string, ok: boolean): TradingChecklistRow => ({
    id,
    label,
    status: ok ? "passed" : "warning",
    statusLabel: ok ? "통과" : "필요"
  });

  return [
    exchange,
    balance,
    configRow("account_read", "계정/포지션 조회", checklist.accountReadNormal),
    tpSl,
    order,
    futures,
    configRow("live_setting", "LIVE 설정", checklist.liveSettingEnabled),
    configRow("emergency", "긴급 중단", !checklist.emergencyStopActive),
    configRow("candidate", "현재 후보", checklist.candidateReady)
  ];
}

export function checklistBadgeTone(status: ChecklistDisplayStatus): "success" | "warning" | "danger" {
  if (status === "passed") return "success";
  if (status === "warning") return "warning";
  return "danger";
}
