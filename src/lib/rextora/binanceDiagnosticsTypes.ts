export type BinanceDiagnosticStatus = "normal" | "warning" | "blocked" | "unknown";

export interface BinanceDiagnosticItem {
  id: string;
  label: string;
  status: BinanceDiagnosticStatus;
  reason: string;
  errorCode?: number | string;
  nextAction: string;
}

export interface BinanceDiagnosticsReport {
  checkedAt: string;
  network: "testnet" | "mainnet";
  baseUrl: string;
  items: BinanceDiagnosticItem[];
}

export function diagnosticStatusLabel(status: BinanceDiagnosticStatus): string {
  switch (status) {
    case "normal":
      return "정상";
    case "warning":
      return "주의";
    case "blocked":
      return "차단";
    default:
      return "미확인";
  }
}

export function diagnosticStatusTone(status: BinanceDiagnosticStatus): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "normal":
      return "success";
    case "warning":
      return "warning";
    case "blocked":
      return "danger";
    default:
      return "default";
  }
}
