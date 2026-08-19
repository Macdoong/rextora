import crypto from "node:crypto";
import type { ResearchResultsSummary } from "@/src/lib/rextora/strategySearch/researchResultsSummary";
import type { ResearchConfiguration, ResearchEvidence } from "./researchTypes";

export function configurationKey(configuration: ResearchConfiguration): string {
  return JSON.stringify({
    symbol: configuration.symbol.toUpperCase(),
    timeframe: configuration.timeframe.toLowerCase(),
    patternIds: [...configuration.patternIds].sort(),
    parametersHash: configuration.parametersHash,
  });
}

export function evidenceFromResearchSummary(
  summary: ResearchResultsSummary,
): ResearchEvidence[] {
  return summary.top10.map((card) => ({
    evidenceId: `evidence_${crypto.createHash("sha256").update(`${summary.jobId}:${card.iteration}`).digest("hex").slice(0, 16)}`,
    kind: "top_result" as const,
    sourceId: `${summary.jobId}#${card.iteration}`,
    verified: true as const,
    configuration: {
      symbol: card.symbol,
      timeframe: card.timeframe,
      patternIds: card.patternStack
        ? card.patternStack.split(/[+·,]/).map((item) => item.trim()).filter(Boolean)
        : [],
      parametersHash: card.paramsHash,
    },
    metrics: {
      totalReturn: card.netReturn,
      mdd: card.maxDrawdown,
      tradeCount: card.tradeCount,
      profitFactor: card.profitFactor,
      totalCost: card.totalCost,
    },
    status: card.finalRecommendable ? "recommendable" : "reviewed",
    rejectionReasons: card.finalRecommendable ? [] : [card.primaryWeakness].filter(Boolean),
    recordedAt: new Date().toISOString(),
  }));
}

export function testedConfigurationKeys(evidence: ResearchEvidence[]): Set<string> {
  return new Set(
    evidence
      .filter((item) => item.configuration)
      .map((item) => configurationKey(item.configuration!)),
  );
}

