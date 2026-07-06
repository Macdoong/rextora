import { getConfig } from "./config";
import { aiCandidatesSeed } from "./seedData";
import { calculateCostBreakdown, passesCostRule } from "./costEngine";
import { detectSignals } from "./signalEngine";
import { evaluateCandidateRisk } from "./riskEngine";
import { getMarketCoins } from "./marketWatcherService";
import { buildRankedCandidate, sortAndLimitCandidates } from "./rankingModel";
import type { AiCandidate } from "./types";

type CandidateCache = {
  candidates: AiCandidate[];
  updatedAt: number;
  limit: number;
};

let candidateCache: CandidateCache | null = null;

export function invalidateCandidateCache(): void {
  candidateCache = null;
}

export function getCandidateSnapshotAgeMs(): number {
  if (!candidateCache) return Number.POSITIVE_INFINITY;
  return Date.now() - candidateCache.updatedAt;
}

export function rankCandidates(limit = 5, options?: { force?: boolean }): AiCandidate[] {
  const config = getConfig();
  const cacheFresh =
    candidateCache &&
    candidateCache.limit >= limit &&
    Date.now() - candidateCache.updatedAt < config.market.candidateCacheTtlMs;

  if (!options?.force && cacheFresh) {
    return candidateCache!.candidates.slice(0, limit);
  }

  const coins = getMarketCoins();
  const ranked = coins
    .map((coin) => {
      const signal = detectSignals(coin);
      if (!signal || signal.blocked) return null;

      const expectedProfitPct = Number((signal.strength * 2.2).toFixed(2));
      const cost = calculateCostBreakdown({ symbol: coin.symbol, expectedProfitPct, coin });
      const riskEval = evaluateCandidateRisk(coin, signal.strength);
      const costPassed = passesCostRule(cost);

      return buildRankedCandidate({ coin, signal, cost, riskPassed: riskEval.passed, costPassed }, 0);
    })
    .filter((c): c is AiCandidate => c !== null);

  const result = sortAndLimitCandidates(ranked, Math.max(limit, 5));
  const final = result.length > 0 ? result : aiCandidatesSeed.slice(0, Math.max(limit, 5));

  candidateCache = {
    candidates: final,
    updatedAt: Date.now(),
    limit: final.length
  };

  return final.slice(0, limit);
}

export function getTopCandidates(limit = 5): AiCandidate[] {
  return rankCandidates(limit);
}

export function getCandidateBySymbol(symbol: string): AiCandidate | undefined {
  return getTopCandidates(5).find((c) => c.symbol === symbol) ?? aiCandidatesSeed.find((c) => c.symbol === symbol);
}
