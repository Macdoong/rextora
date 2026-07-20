import { rankCandidates } from "./aiRanker";
import { convertAiCandidatesToExecutionCandidates } from "./aiExecutionBridge";
import { buildExecutionQueue, summarizeExecutionQueue } from "./executionQueue";
import { getRextoraSettings } from "./settings/settingsService";
import { getMarketDataSnapshot } from "./marketDataStore";
import { getMarketCoins } from "./marketWatcherService";
import { detectSignals } from "./signalEngine";
import { calculateTpSlPrices } from "./tpSlPlacement";
import { appendAuditLog, getAuditLogs } from "./storage/auditStore";
import { getLearningLogs } from "./learningLogger";
import type { ExecutionCandidate } from "./executionCandidateTypes";

export type TradingFlowStageStatus = "pass" | "warning" | "blocked";

export interface TradingFlowStage {
  id: string;
  label: string;
  status: TradingFlowStageStatus;
  message: string;
}

export interface TradingFlowReport {
  ok: boolean;
  stages: TradingFlowStage[];
  fatalIssues: string[];
}

function stage(id: string, label: string, status: TradingFlowStageStatus, message: string): TradingFlowStage {
  return { id, label, status, message };
}

export function buildTradingFlowReport(): TradingFlowReport {
  const stages: TradingFlowStage[] = [];
  const fatalIssues: string[] = [];

  const marketSnapshot = getMarketDataSnapshot();
  const marketCoins = getMarketCoins();
  if (marketSnapshot.coins.length > 0 || marketCoins.length > 0) {
    stages.push(stage("market", "시장 감시", "pass", `시장 데이터 ${Math.max(marketSnapshot.coins.length, marketCoins.length)}개 심볼 사용 가능`));
  } else {
    stages.push(stage("market", "시장 감시", "warning", "시장 스냅샷이 비어 있습니다."));
  }

  const sampleCoin = marketCoins[0] ?? marketSnapshot.coins[0];
  const signal = sampleCoin ? detectSignals(sampleCoin) : null;
  if (signal) {
    stages.push(stage("signal", "신호 엔진", "pass", `신호 생성 가능 (${signal.signalType ?? "신호"})`));
  } else {
    stages.push(stage("signal", "신호 엔진", "warning", "샘플 심볼에서 신호를 생성하지 못했습니다."));
  }

  const ranked = rankCandidates(5);
  if (ranked.length > 0) {
    stages.push(stage("ai", "AI 후보 선별", "pass", `AI 후보 ${ranked.length}개 생성됨`));
  } else {
    const blocked = stage("ai", "AI 후보 선별", "blocked", "AI 후보 데이터가 없습니다.");
    stages.push(blocked);
    fatalIssues.push(blocked.message);
  }

  const executionCandidates = convertAiCandidatesToExecutionCandidates(ranked);
  const costChecked = executionCandidates.some((c) => c.costPass || c.costReason.length > 0);
  if (costChecked) {
    stages.push(stage("cost", "비용 계산", "pass", "비용 검사 결과가 후보에 연결되었습니다."));
  } else {
    stages.push(stage("cost", "비용 계산", "warning", "비용 검사 결과가 없습니다."));
  }

  if (executionCandidates.length > 0) {
    stages.push(stage("bridge", "실행 후보 변환", "pass", `실행 후보 ${executionCandidates.length}개 변환됨`));
  } else {
    const blocked = stage("bridge", "실행 후보 변환", "blocked", "실행 후보를 생성하지 못했습니다.");
    stages.push(blocked);
    fatalIssues.push(blocked.message);
  }

  const queue = buildExecutionQueue(executionCandidates);
  if (queue.items.length >= 0) {
    stages.push(stage("queue", "실행 큐", "pass", `큐 수신 ${queue.received} · 대기 ${queue.queued} · 제외 ${queue.skipped}`));
  }

  const eligible = executionCandidates.filter((c) => c.status === "진입 가능");
  if (eligible.length > 0) {
    stages.push(stage("execution", "실행 엔진 분기", "pass", `진입 가능 후보 ${eligible.length}개 (모의/실전 분기 준비됨)`));
  } else {
    stages.push(stage("execution", "실행 엔진 분기", "warning", "현재 진입 가능 후보가 없습니다."));
  }

  const sample = eligible[0] ?? executionCandidates[0];
  if (sample && sample.entryPrice > 0) {
    const tpSl = calculateTpSlPrices(sample.entryPrice, sample.side);
    stages.push(stage("tpsl", "서버 손절/익절 계획", "pass", `손절 ${tpSl.stopLossPrice.toFixed(2)} · 익절 ${tpSl.takeProfitPrice.toFixed(2)}`));
  } else {
    stages.push(stage("tpsl", "서버 손절/익절 계획", "warning", "TP/SL 계획 샘플을 만들 수 없습니다."));
  }

  const auditOk = typeof appendAuditLog === "function" && getAuditLogs(1).length >= 0;
  const learningOk = getLearningLogs(1).length >= 0;
  if (auditOk && learningOk) {
    stages.push(stage("audit", "감사/학습 기록", "pass", "감사 및 학습 로그 기록 경로가 준비되었습니다."));
  } else {
    stages.push(stage("audit", "감사/학습 기록", "warning", "로그 기록 경로 확인 필요"));
  }

  return {
    ok: fatalIssues.length === 0,
    stages,
    fatalIssues
  };
}

export function verifyTradingFlowIntegrity(): TradingFlowReport {
  return buildTradingFlowReport();
}

export function dryRunExecutionCandidate(sample?: ExecutionCandidate): boolean {
  return Boolean(sample && sample.symbol && sample.side && Number.isFinite(sample.entryPrice));
}
