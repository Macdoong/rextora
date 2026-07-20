import fs from "node:fs";
import path from "node:path";

export interface AiTradeReportInput {
  symbol: string;
  side: "LONG" | "SHORT" | "롱" | "숏";
  signalType?: string;
  entryReason?: string;
  exitReason?: string;
  entryPrice: number;
  exitPrice: number;
  leverage?: number;
  realizedPnlPct?: number;
  feeImpactPct?: number;
  slippageImpactPct?: number;
  paramsHash?: string;
  mode?: "PAPER" | "LIVE";
}

export interface AiTradeReport {
  id: string;
  createdAt: string;
  symbol: string;
  mode: "PAPER" | "LIVE";
  whyEntered: string;
  whyExited: string;
  followedRules: boolean;
  costImpact: string;
  slippageImpact: string;
  recurringLossPattern: string;
  parameterSuggestion: string;
  needsMoreBacktesting: boolean;
  summary: string;
  raw: AiTradeReportInput;
}

const STORE_REL = path.join("data", "rextora", "ai-trade-reports.json");

function storePath(): string {
  return path.join(process.cwd(), STORE_REL);
}

function readStore(): AiTradeReport[] {
  const p = storePath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(raw) ? (raw as AiTradeReport[]) : [];
  } catch {
    return [];
  }
}

function writeStore(rows: AiTradeReport[]): void {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(rows.slice(0, 500), null, 2), "utf8");
}

/**
 * AI analyzes completed trades only. Never decides entries.
 */
export function generateAiTradeReport(input: AiTradeReportInput): AiTradeReport {
  const pnl = input.realizedPnlPct ?? 0;
  const exit = input.exitReason ?? "unknown";
  const followedRules = !/manual|error|강제/i.test(exit);

  const whyEntered =
    input.entryReason ||
    `${input.signalType ?? "SAFE_v44"} 조건 통과로 ${input.side} 진입 (수학적 시그널, AI 의사결정 없음)`;

  const whyExited =
    exit.includes("익절") || exit === "take_profit"
      ? "목표가(ATR TP) 도달로 청산"
      : exit.includes("손절") || exit === "stop_loss"
        ? "손절가(ATR SL) 도달로 청산"
        : exit.includes("trailing")
          ? "트레일링 스탑 발동으로 청산"
          : exit.includes("max_hold") || exit.includes("보유")
            ? "최대 보유 봉 도달로 청산"
            : `청산 사유: ${exit}`;

  const costImpact =
    input.feeImpactPct != null
      ? `추정 수수료 영향 ${(input.feeImpactPct * 100).toFixed(3)}%`
      : "수수료 영향 데이터 없음 — 왕복 테이커 수수료를 성과에서 차감했는지 확인 필요";

  const slippageImpact =
    input.slippageImpactPct != null
      ? `추정 슬리피지 ${(input.slippageImpactPct * 100).toFixed(3)}%`
      : "슬리피지 실측 없음 — 체결가와 시그널가 괴리를 기록하도록 권장";

  const recurringLossPattern =
    pnl < 0 && (exit.includes("손절") || exit === "stop_loss")
      ? "손절 반복 패턴 가능: ATR 배수·진입 필터·비용 가드를 백테스트로 재검증"
      : pnl < 0
        ? "손실 청산: 보유시간/트레일링/시장 레짐 불일치 가능성"
        : "최근 거래는 손실 패턴으로 분류되지 않음";

  const needsMoreBacktesting = pnl < 0 || !followedRules;
  const parameterSuggestion = needsMoreBacktesting
    ? "SAFE_v44_i4060 파라미터를 동일 심볼·기간으로 재백테스트하고, cost_guard_k와 sl/tp ATR 배수 민감도를 확인하세요."
    : "현 파라미터 준수 거래로 보입니다. 월간 성과가 악화되면 slope_min/vol_ratio_min 민감도만 제한적으로 재검증하세요.";

  const report: AiTradeReport = {
    id: `ai-report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    symbol: input.symbol,
    mode: input.mode ?? "PAPER",
    whyEntered,
    whyExited,
    followedRules,
    costImpact,
    slippageImpact,
    recurringLossPattern,
    parameterSuggestion,
    needsMoreBacktesting,
    summary: `${input.symbol} ${input.side} 분석: PnL ${pnl.toFixed(2)}% · 규칙준수 ${followedRules ? "예" : "아니오"} · 추가백테스트 ${needsMoreBacktesting ? "권장" : "선택"}`,
    raw: input
  };

  const rows = readStore();
  rows.unshift(report);
  writeStore(rows);
  return report;
}

export function listAiTradeReports(limit = 20): AiTradeReport[] {
  return readStore().slice(0, Math.max(1, limit));
}

export function getLatestAiTradeReportSummary(): string | null {
  const latest = readStore()[0];
  return latest?.summary ?? null;
}
