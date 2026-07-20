import { calculateTpSlPrices } from "./tpSlPlacement";
import { getRextoraSettings } from "./settings/settingsService";
import { getMarketDataSnapshot } from "./marketDataStore";
import { calculateLearningAdjustment, getConsecutiveLosses, getRecentWinRate } from "./learningEngine";
import { decideLeverage } from "./leverageEngine";
import type { AiCandidate } from "./types";
import type { ExecutionCandidate, ExecutionCandidateStatus } from "./executionCandidateTypes";

function mapSide(direction: string): { side: "LONG" | "SHORT"; sideLabel: "롱" | "숏" } {
  if (direction === "롱" || direction.toUpperCase() === "LONG") return { side: "LONG", sideLabel: "롱" };
  return { side: "SHORT", sideLabel: "숏" };
}

function resolveStatus(
  candidate: AiCandidate,
  entryPrice: number,
  costPass: boolean,
  learningReject: boolean,
  learningReason: string
): {
  status: ExecutionCandidateStatus;
  rejectReason?: string;
} {
  if (!costPass) {
    return { status: "제외", rejectReason: candidate.blockReason ?? "비용 조건 미통과" };
  }
  if (learningReject) {
    return { status: "제외", rejectReason: learningReason || "학습 패턴 제외" };
  }
  if (entryPrice <= 0) {
    return { status: "대기", rejectReason: "시장 가격 정보 없음" };
  }
  if (candidate.status !== "진입 가능") {
    if (candidate.status === "관찰 필요" || candidate.status === "신호 약함") {
      return { status: "대기", rejectReason: candidate.blockReason ?? candidate.status };
    }
    return { status: "제외", rejectReason: candidate.blockReason ?? candidate.status };
  }
  if (!candidate.riskPassed) {
    return { status: "제외", rejectReason: "리스크 조건 미통과" };
  }
  return { status: "진입 가능" };
}

export function convertAiCandidateToExecutionCandidate(candidate: AiCandidate, index: number): ExecutionCandidate {
  const settings = getRextoraSettings();
  const coin = getMarketDataSnapshot().coins.find((c) => c.symbol === candidate.symbol);
  const entryPrice = coin?.price ?? 0;
  const { side, sideLabel } = mapSide(candidate.direction);
  const tpSl = entryPrice > 0 ? calculateTpSlPrices(entryPrice, side) : null;
  const costPass = Boolean(candidate.costPassed);
  const confidence = Math.min(100, Math.max(0, candidate.aiScore));
  const baseFinalScore = Number(
    (candidate.aiScore * 0.7 + (costPass ? 20 : 0) + (candidate.riskPassed ? 10 : 0)).toFixed(2)
  );

  const learning = calculateLearningAdjustment({
    symbol: candidate.symbol,
    side: sideLabel,
    signalType: candidate.signalType ?? candidate.signalReason ?? "unknown",
    aiScore: candidate.aiScore,
    costPass
  });

  const finalScore = Math.max(
    0,
    Math.min(100, Number((baseFinalScore + learning.scoreDelta).toFixed(2)))
  );

  const leverageDecision = decideLeverage({
    aiScore: candidate.aiScore,
    finalScore,
    symbol: candidate.symbol,
    volatility: coin?.volatility,
    spread: coin?.spread,
    fundingFee: coin?.fundingFee,
    learningLeverageMultiplier: learning.leverageMultiplier,
    consecutiveLosses: getConsecutiveLosses(),
    recentWinRate: getRecentWinRate(),
    costPass
  });

  const { status, rejectReason } = resolveStatus(
    candidate,
    entryPrice,
    costPass,
    learning.reject,
    learning.reason
  );

  return {
    id: `exec-${candidate.symbol}-${index}-${Date.now()}`,
    symbol: candidate.symbol,
    side,
    sideLabel,
    aiScore: candidate.aiScore,
    finalScore,
    confidence,
    entryPrice,
    stopLossPrice: tpSl?.stopLossPrice ?? 0,
    takeProfitPrice: tpSl?.takeProfitPrice ?? 0,
    costPass,
    costReason: costPass ? "비용 조건 통과" : candidate.blockReason ?? "비용 조건 미통과",
    leverage: leverageDecision.leverage,
    leverageLabel: leverageDecision.leverageLabel,
    positionSizePct: settings.execution.positionSizePct ?? settings.risk.maxPositionSizePct,
    learningScoreDelta: learning.scoreDelta,
    learningReason: learning.reason,
    learningConfidence: learning.confidence,
    leverageReason: leverageDecision.reason,
    riskLevel: leverageDecision.riskLevel,
    status,
    rejectReason,
    source: {
      signal: candidate.signalType ?? candidate.signalReason ?? "신호",
      ai: `AI 점수 ${candidate.aiScore.toFixed(1)} · 학습 ${learning.scoreDelta >= 0 ? "+" : ""}${learning.scoreDelta}`,
      cost: costPass ? "비용 통과" : "비용 미통과"
    }
  };
}

export function convertAiCandidatesToExecutionCandidates(candidates: AiCandidate[]): ExecutionCandidate[] {
  const converted = candidates.map((candidate, index) => convertAiCandidateToExecutionCandidate(candidate, index));
  return converted.sort((a, b) => b.finalScore - a.finalScore);
}

export function toAiCandidate(candidate: ExecutionCandidate, rank = 1): AiCandidate {
  let status: AiCandidate["status"] = "관찰 필요";
  if (candidate.status === "진입 가능") {
    status = "진입 가능";
  } else if (!candidate.costPass) {
    status = "비용 초과로 차단";
  } else if (candidate.status === "제외") {
    status = "신호 약함";
  }

  return {
    rank,
    symbol: candidate.symbol,
    direction: candidate.sideLabel,
    signalType: "breakout",
    aiScore: candidate.aiScore,
    expectedProfitPct: 0,
    expectedCostPct: 0,
    stopLossDistancePct: 0,
    riskGrade: "중간",
    status,
    entryReason: candidate.source.signal,
    signalReason: candidate.source.signal,
    costPassed: candidate.costPass,
    riskPassed: candidate.status === "진입 가능",
    blockReason: candidate.rejectReason,
    serviceState: "paper",
    leverage: candidate.leverage,
    finalScore: candidate.finalScore
  };
}
