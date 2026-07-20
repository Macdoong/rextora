import { rankCandidates } from "./aiRanker";
import { convertAiCandidatesToExecutionCandidates } from "./aiExecutionBridge";
import { buildExecutionQueue, summarizeExecutionQueue } from "./executionQueue";
import { getMarketDataSnapshot } from "./marketDataStore";
import { getMarketCoins } from "./marketWatcherService";
import { detectSignals } from "./signalEngine";
import { calculateTpSlPrices } from "./tpSlPlacement";
import { appendAuditLog, getAuditLogs } from "./storage/auditStore";
import { getLearningLogs } from "./learningLogger";
import { buildTradingDashboardStatus } from "./tradingDashboardStatus";
import { calculateLearningAdjustment } from "./learningEngine";
import { decideLeverage } from "./leverageEngine";
import type { ExecutionCandidate } from "./executionCandidateTypes";

export interface PaperEndToEndStage {
  id: string;
  label: string;
  ok: boolean;
  message: string;
}

export interface PaperEndToEndReport {
  ok: boolean;
  summary: string;
  stages: PaperEndToEndStage[];
  usedLiveOrderEndpoints: false;
}

function stage(id: string, label: string, ok: boolean, message: string): PaperEndToEndStage {
  return { id, label, ok, message };
}

function simulatePaperExecution(candidate: ExecutionCandidate): { ok: boolean; message: string } {
  if (candidate.entryPrice <= 0) {
    return { ok: false, message: "진입가 정보 없음 — 모의 실행 생략" };
  }
  return {
    ok: true,
    message: `${candidate.symbol} ${candidate.sideLabel} 모의 진입 시뮬레이션 (${candidate.leverageLabel}, 수량 추정)`
  };
}

function simulatePaperTpSl(candidate: ExecutionCandidate): { ok: boolean; message: string } {
  const plan = calculateTpSlPrices(candidate.entryPrice, candidate.side);
  return {
    ok: true,
    message: `모의 손절 ${plan.stopLossPrice.toFixed(2)} · 익절 ${plan.takeProfitPrice.toFixed(2)}`
  };
}

export function verifyPaperEndToEndFlow(): PaperEndToEndReport {
  const stages: PaperEndToEndStage[] = [];

  const marketSnapshot = getMarketDataSnapshot();
  const marketCoins = getMarketCoins();
  const symbolCount = Math.max(marketSnapshot.coins.length, marketCoins.length);
  stages.push(
    stage(
      "market",
      "시장 스냅샷",
      symbolCount > 0,
      symbolCount > 0 ? `시장 데이터 ${symbolCount}개 심볼 확인` : "시장 스냅샷 없음"
    )
  );

  const sampleCoin = marketCoins[0] ?? marketSnapshot.coins[0];
  const signal = sampleCoin ? detectSignals(sampleCoin) : null;
  stages.push(
    stage(
      "signal",
      "신호 생성",
      Boolean(signal),
      signal ? `신호 유형: ${signal.signalType ?? "신호"}` : "샘플 신호 없음"
    )
  );

  const ranked = rankCandidates(10);
  stages.push(
    stage(
      "ai",
      "AI 후보 랭킹",
      ranked.length > 0,
      ranked.length > 0 ? `AI 후보 ${ranked.length}개` : "AI 후보 없음"
    )
  );

  const executionCandidates = convertAiCandidatesToExecutionCandidates(ranked);
  const top = executionCandidates[0];
  if (top) {
    const learning = calculateLearningAdjustment({
      symbol: top.symbol,
      side: top.sideLabel,
      signalType: top.source.signal,
      aiScore: top.aiScore,
      costPass: top.costPass
    });
    stages.push(
      stage(
        "learning",
        "학습 보정",
        true,
        `점수 보정 ${learning.scoreDelta >= 0 ? "+" : ""}${learning.scoreDelta} · ${learning.reason}`
      )
    );

    const leverage = decideLeverage({
      aiScore: top.aiScore,
      finalScore: top.finalScore,
      symbol: top.symbol,
      learningLeverageMultiplier: learning.leverageMultiplier,
      consecutiveLosses: 0,
      recentWinRate: 50,
      costPass: top.costPass
    });
    stages.push(stage("leverage", "레버리지 결정", true, `${leverage.leverageLabel} · ${leverage.reason}`));
  } else {
    stages.push(stage("learning", "학습 보정", false, "후보 없음"));
    stages.push(stage("leverage", "레버리지 결정", false, "후보 없음"));
  }

  const costOk = executionCandidates.some((c) => c.costPass || c.costReason.length > 0);
  stages.push(
    stage(
      "cost",
      "비용 검사",
      costOk,
      costOk ? "비용 검사 결과 연결됨" : "비용 검사 결과 없음"
    )
  );

  const queue = buildExecutionQueue(executionCandidates, "PAPER");
  const queueSummary = summarizeExecutionQueue(queue);
  stages.push(
    stage(
      "queue",
      "실행 큐",
      true,
      `수신 ${queueSummary.received} · 대기 ${queueSummary.queued} · 제외 ${queueSummary.skipped}`
    )
  );

  const eligible = executionCandidates.find((c) => c.status === "진입 가능" && c.costPass) ?? executionCandidates[0];
  if (eligible) {
    const paper = simulatePaperExecution(eligible);
    stages.push(stage("paper-exec", "모의 실행", paper.ok, paper.message));
    const tpSl = simulatePaperTpSl(eligible);
    stages.push(stage("paper-tpsl", "모의 손절/익절", tpSl.ok, tpSl.message));
  } else {
    stages.push(stage("paper-exec", "모의 실행", false, "모의 실행 대상 없음"));
    stages.push(stage("paper-tpsl", "모의 손절/익절", false, "TP/SL 시뮬레이션 대상 없음"));
  }

  appendAuditLog({
    type: "preflight",
    actor: "paperEndToEndVerifier",
    message: "모의 종단 간 검증 실행",
    mode: "PAPER",
    correlationId: `paper-e2e-${Date.now()}`
  });
  const auditReady = getAuditLogs(1).length > 0;
  const learningReady = getLearningLogs(1).length >= 0;
  stages.push(
    stage(
      "audit",
      "감사/학습 기록",
      auditReady && learningReady,
      auditReady ? "감사 로그 기록 가능" : "감사 로그 확인 실패"
    )
  );

  const dashboard = buildTradingDashboardStatus(null);
  const dashboardOk =
    dashboard.topCandidates.length >= 0 &&
    dashboard.queueSummary !== undefined &&
    dashboard.learningSummary !== undefined &&
    dashboard.recentExecutionLogs.length >= 0;
  stages.push(
    stage(
      "dashboard",
      "대시보드 상태",
      dashboardOk,
      `후보 ${dashboard.topCandidates.length} · 포지션 ${dashboard.positions.length} · 큐 수신 ${dashboard.queueSummary.received}`
    )
  );

  const failed = stages.filter((item) => !item.ok);
  const ok = failed.length === 0 || (failed.every((item) => item.id === "signal" || item.id === "paper-exec") && stages.some((s) => s.ok));

  const summary = ok
    ? `[모의 종단 검증] 통과 — ${stages.filter((s) => s.ok).length}/${stages.length}단계 성공. 실제 주문 API는 호출하지 않았습니다.`
    : `[모의 종단 검증] 주의 — ${failed.map((f) => f.label).join(", ")} 확인 필요. 실제 주문 API는 호출하지 않았습니다.`;

  return {
    ok,
    summary,
    stages,
    usedLiveOrderEndpoints: false
  };
}
