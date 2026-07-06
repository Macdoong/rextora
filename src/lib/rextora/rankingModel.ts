import type { AiCandidate, CostBreakdown, MarketCoin, RiskLevel } from "./types";
import type { SignalResult } from "./signalEngine";

export interface RankingInput {
  coin: MarketCoin;
  signal: SignalResult;
  cost: CostBreakdown;
  riskPassed: boolean;
  costPassed: boolean;
}

export function scoreCandidate(input: RankingInput): number {
  let score = input.signal.strength * 100;
  if (input.costPassed) score += 8;
  if (input.riskPassed) score += 5;
  if (input.coin.state === "돌파") score += 4;
  if (input.coin.state === "과열") score -= 6;
  if (!input.cost.passed) score -= 20;
  return Number(Math.max(0, Math.min(100, score)).toFixed(1));
}

export function toRiskGrade(score: number): RiskLevel {
  if (score >= 0.8) return "낮음";
  if (score >= 0.6) return "중간";
  if (score >= 0.4) return "높음";
  return "위험";
}

export function buildRankedCandidate(input: RankingInput, rank: number): AiCandidate {
  const overheated = input.coin.state === "과열";
  const aiScore = scoreCandidate(input);
  let status: AiCandidate["status"] = "진입 가능";
  if (overheated) status = "과열 구간 차단";
  else if (!input.costPassed) status = "비용 초과로 차단";
  else if (!input.riskPassed) status = "리스크 초과로 차단";
  else if (input.signal.strength < 0.55) status = "신호 약함";
  else if (input.signal.strength < 0.75) status = "관찰 필요";

  return {
    rank,
    symbol: input.coin.symbol,
    direction: input.signal.direction,
    signalType: input.signal.signalType,
    aiScore,
    expectedProfitPct: Number((input.signal.strength * 2.2).toFixed(2)),
    expectedCostPct: Number((input.cost.roundTripFeePct + input.cost.estimatedSlippagePct + input.cost.fundingFeePct).toFixed(2)),
    stopLossDistancePct: Number((input.coin.volatility * 0.25).toFixed(2)),
    riskGrade: toRiskGrade(input.signal.strength),
    status,
    entryReason: input.signal.reason,
    signalReason: input.signal.reason,
    costPassed: input.costPassed,
    riskPassed: input.riskPassed,
    blockReason: status !== "진입 가능" && status !== "관찰 필요" ? input.signal.reason : undefined,
    serviceState: input.coin.serviceState
  };
}

export function sortAndLimitCandidates(candidates: AiCandidate[], limit = 5): AiCandidate[] {
  return candidates
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, limit)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}
