import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
  tradeId?: string;
  analysisType?: string;
}

export type AiAnalysisMethod = "규칙 기반 분석" | "AI API 분석";

export interface AiTradeReport {
  id: string;
  createdAt: string;
  symbol: string;
  mode: "PAPER" | "LIVE";
  analysisMethod: AiAnalysisMethod;
  analysisType: string;
  tradeId: string | null;
  reportHash: string;
  whyEntered: string;
  whyExited: string;
  followedRules: boolean;
  costImpact: string;
  slippageImpact: string;
  recurringLossPattern: string;
  parameterSuggestion: string;
  needsMoreBacktesting: boolean;
  summary: string;
  /** Structured Korean sections for UI */
  sections: {
    targetTrade: string;
    analyzedAt: string;
    coreCause: string;
    strengths: string;
    problems: string;
    costEffect: string;
    prevention: string;
    backtestAdvice: string;
  };
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

function bucketTimestamp(iso: string): string {
  const d = new Date(iso);
  d.setSeconds(0, 0);
  return d.toISOString();
}

export function computeAiReportHash(input: AiTradeReportInput, analysisType: string, createdAt: string): string {
  const payload = {
    tradeId: input.tradeId ?? `${input.symbol}:${input.entryPrice}:${input.exitPrice}:${input.mode ?? "PAPER"}`,
    analysisType,
    bucket: bucketTimestamp(createdAt),
    symbol: input.symbol,
    side: input.side,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    exitReason: input.exitReason ?? "",
    realizedPnlPct: input.realizedPnlPct ?? 0
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

/**
 * Rule-based post-trade analysis. Never decides entries.
 * Labels method explicitly as 규칙 기반 분석 (no AI API call).
 */
export function generateAiTradeReport(input: AiTradeReportInput): AiTradeReport {
  const pnl = input.realizedPnlPct ?? 0;
  const exit = input.exitReason ?? "unknown";
  const followedRules = !/manual|error|강제/i.test(exit);
  const analysisType = input.analysisType ?? "trade_close";
  const createdAt = new Date().toISOString();
  const reportHash = computeAiReportHash(input, analysisType, createdAt);

  const existing = readStore().find((r) => r.reportHash === reportHash);
  if (existing) return existing;

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
    ? "동일 심볼·기간으로 재백테스트하고, 비용 안전 계수와 손절·익절 ATR 배수 민감도를 확인하세요."
    : "현 파라미터 준수 거래로 보입니다. 월간 성과가 악화되면 추세·거래량 필터 민감도만 제한적으로 재검증하세요.";

  const report: AiTradeReport = {
    id: `ai-report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt,
    symbol: input.symbol,
    mode: input.mode ?? "PAPER",
    analysisMethod: "규칙 기반 분석",
    analysisType,
    tradeId: input.tradeId ?? null,
    reportHash,
    whyEntered,
    whyExited,
    followedRules,
    costImpact,
    slippageImpact,
    recurringLossPattern,
    parameterSuggestion,
    needsMoreBacktesting,
    summary: `${input.symbol} ${input.side} 분석: 손익 ${pnl.toFixed(2)}% · 규칙준수 ${followedRules ? "예" : "아니오"} · 추가백테스트 ${needsMoreBacktesting ? "권장" : "선택"}`,
    sections: {
      targetTrade: `${input.symbol} ${input.side} · 진입 ${input.entryPrice} → 청산 ${input.exitPrice}`,
      analyzedAt: new Date(createdAt).toLocaleString("ko-KR"),
      coreCause: whyExited,
      strengths: followedRules ? "전략 규칙에 따른 진입·청산" : "규칙 이탈 청산 — 재발 방지 필요",
      problems: pnl < 0 ? recurringLossPattern : "손실 패턴 없음",
      costEffect: `${costImpact} / ${slippageImpact}`,
      prevention: parameterSuggestion,
      backtestAdvice: needsMoreBacktesting ? "동일 조건 재백테스트 권고" : "필수 아님 — 월간 모니터링 유지"
    },
    raw: input
  };

  const rows = readStore();
  rows.unshift(report);
  writeStore(rows);
  return report;
}

export function listAiTradeReports(limit = 20): AiTradeReport[] {
  const seen = new Set<string>();
  const out: AiTradeReport[] = [];
  for (const row of readStore()) {
    const key = row.reportHash ?? row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export function getLatestAiTradeReportSummary(): string | null {
  const latest = listAiTradeReports(1)[0];
  return latest?.summary ?? null;
}

/** One-time cleanup of duplicate report hashes in store. */
export function dedupeAiTradeReports(): number {
  const rows = readStore();
  const seen = new Set<string>();
  const next: AiTradeReport[] = [];
  let removed = 0;
  for (const row of rows) {
    const key = row.reportHash ?? `${row.symbol}:${row.createdAt}:${row.summary}`;
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    next.push(row);
  }
  writeStore(next);
  return removed;
}
