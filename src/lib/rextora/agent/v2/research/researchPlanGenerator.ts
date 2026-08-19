import { configurationKey, testedConfigurationKeys } from "./researchEvidence";
import type { ResearchConfiguration, ResearchEvidence, ResearchPlanDraftV2 } from "./researchTypes";

export function generateResearchPlan(input: {
  symbol: string;
  timeframe: string;
  supportedPatternCombinations: string[][];
  evidence: ResearchEvidence[];
  retestJustification?: string | null;
}): ResearchPlanDraftV2 {
  const tested = testedConfigurationKeys(input.evidence);
  const candidates: ResearchConfiguration[] = input.supportedPatternCombinations.map((patternIds) => ({
    symbol: input.symbol,
    timeframe: input.timeframe,
    patternIds,
    parametersHash: null,
  }));
  const untested = candidates.find((candidate) => !tested.has(configurationKey(candidate)));
  const selected = untested ?? candidates[0];
  if (!selected) throw new Error("NO_SUPPORTED_PATTERN_COMBINATION");
  const duplicate = input.evidence.find(
    (item) => item.configuration && configurationKey(item.configuration) === configurationKey(selected),
  );
  if (duplicate && !input.retestJustification?.trim()) throw new Error("DUPLICATE_RESEARCH_REQUIRES_JUSTIFICATION");
  return {
    symbol: selected.symbol,
    timeframe: selected.timeframe,
    patternIds: selected.patternIds,
    reasonKo: duplicate
      ? `기존 설정을 다시 검증합니다. 사유: ${input.retestJustification}`
      : "이전에 검증하지 않은 지원 패턴 조합이라 연구 범위를 넓힐 수 있습니다.",
    evidenceRefs: input.evidence.map((item) => item.evidenceId),
    duplicateOf: duplicate?.evidenceId ?? null,
    retestJustification: duplicate ? input.retestJustification!.trim() : null,
    executionStarted: false,
  };
}

