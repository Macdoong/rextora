/**
 * Structured StoredStrategy execution provenance (P3-A8.3.1).
 *
 * Optional on historical records. New promotions stamp this object.
 * Free-text description remains display/audit copy, not machine authority
 * when this field is present.
 */

import type { ResearchCostProvenance } from "../strategySearch/researchEvaluationIdentity";
import {
  ENGINE_COST_MODEL_EVENT_SEQUENCE,
  ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
  ENGINE_COST_MODEL_SAFE,
  GROUP_PATTERN,
  GROUP_PATTERN_CANONICAL,
  GROUP_SAFE,
  type RankingCompatibilityGroup,
  type ResearchEngineCostModel,
} from "../strategySearch/researchEvaluationIdentity";

export const STRATEGY_EXECUTION_PROVENANCE_VERSION =
  "strategy_execution_provenance_v1" as const;

export type StrategyExecutionProvenanceStatus = "stamped" | "reconstructed";

export type StrategyCostModelWarning = "legacy_event_sequence_ledger_v0";

export type CompetitiveExecutionGroup =
  | typeof GROUP_SAFE
  | typeof GROUP_PATTERN_CANONICAL
  | typeof GROUP_PATTERN;

export interface StrategyExecutionProvenance {
  version: typeof STRATEGY_EXECUTION_PROVENANCE_VERSION;
  engineCostModel: ResearchEngineCostModel;
  rankingCompatibilityGroup: CompetitiveExecutionGroup;
  researchEvaluationHash?: string;
  sourceResearchJobId?: string;
  sourceIteration?: number;
  candidateParamsHash?: string;
  costModelWarning?: StrategyCostModelWarning;
  provenanceStatus: StrategyExecutionProvenanceStatus;
  costAssumptions?: ResearchCostProvenance;
}

export type ParsedStrategyExecutionProvenance =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "ok"; value: StrategyExecutionProvenance };

export function parseResearchEngineCostModel(
  value?: string | null,
): ResearchEngineCostModel | null {
  if (
    value === ENGINE_COST_MODEL_SAFE ||
    value === ENGINE_COST_MODEL_EVENT_SEQUENCE ||
    value === ENGINE_COST_MODEL_EVENT_SEQUENCE_V1
  ) {
    return value;
  }
  return null;
}

export function parseCompetitiveExecutionGroup(
  value?: string | null,
): CompetitiveExecutionGroup | null {
  if (
    value === GROUP_SAFE ||
    value === GROUP_PATTERN_CANONICAL ||
    value === GROUP_PATTERN
  ) {
    return value;
  }
  return null;
}

function asFiniteInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.trunc(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim();
}

/**
 * Read-only parse. Does not rewrite stored JSON.
 * Unknown extra keys on a valid object are ignored for machine use and left
 * intact on the persisted record.
 */
export function parseStrategyExecutionProvenance(
  raw: unknown,
): ParsedStrategyExecutionProvenance {
  if (raw == null) return { kind: "absent" };
  if (typeof raw !== "object") return { kind: "invalid" };
  const obj = raw as Record<string, unknown>;
  if (obj.version !== STRATEGY_EXECUTION_PROVENANCE_VERSION) {
    return { kind: "invalid" };
  }
  const engineCostModel = parseResearchEngineCostModel(
    typeof obj.engineCostModel === "string" ? obj.engineCostModel : null,
  );
  const rankingCompatibilityGroup = parseCompetitiveExecutionGroup(
    typeof obj.rankingCompatibilityGroup === "string"
      ? obj.rankingCompatibilityGroup
      : null,
  );
  if (!engineCostModel || !rankingCompatibilityGroup) {
    return { kind: "invalid" };
  }
  if (obj.provenanceStatus !== "stamped" && obj.provenanceStatus !== "reconstructed") {
    return { kind: "invalid" };
  }
  const value: StrategyExecutionProvenance = {
    version: STRATEGY_EXECUTION_PROVENANCE_VERSION,
    engineCostModel,
    rankingCompatibilityGroup,
    provenanceStatus: obj.provenanceStatus,
  };
  const hash = asNonEmptyString(obj.researchEvaluationHash);
  if (hash) value.researchEvaluationHash = hash;
  const jobId = asNonEmptyString(obj.sourceResearchJobId);
  if (jobId) value.sourceResearchJobId = jobId;
  const iteration = asFiniteInt(obj.sourceIteration);
  if (iteration != null) value.sourceIteration = iteration;
  const candidate = asNonEmptyString(obj.candidateParamsHash);
  if (candidate) value.candidateParamsHash = candidate;
  if (obj.costModelWarning === "legacy_event_sequence_ledger_v0") {
    value.costModelWarning = "legacy_event_sequence_ledger_v0";
  }
  if (obj.costAssumptions && typeof obj.costAssumptions === "object") {
    value.costAssumptions = obj.costAssumptions as ResearchCostProvenance;
  }
  return { kind: "ok", value };
}

export function buildStrategyExecutionProvenance(input: {
  engineCostModel: string;
  rankingCompatibilityGroup: string;
  researchEvaluationHash: string;
  sourceResearchJobId: string;
  sourceIteration: number;
  candidateParamsHash: string;
  reconstructed: boolean;
  costAssumptions?: ResearchCostProvenance;
}): StrategyExecutionProvenance | null {
  const engineCostModel = parseResearchEngineCostModel(input.engineCostModel);
  const rankingCompatibilityGroup = parseCompetitiveExecutionGroup(
    input.rankingCompatibilityGroup,
  );
  if (!engineCostModel || !rankingCompatibilityGroup) return null;
  const provenance: StrategyExecutionProvenance = {
    version: STRATEGY_EXECUTION_PROVENANCE_VERSION,
    engineCostModel,
    rankingCompatibilityGroup,
    researchEvaluationHash: input.researchEvaluationHash,
    sourceResearchJobId: input.sourceResearchJobId,
    sourceIteration: input.sourceIteration,
    candidateParamsHash: input.candidateParamsHash,
    provenanceStatus: input.reconstructed ? "reconstructed" : "stamped",
  };
  if (engineCostModel === ENGINE_COST_MODEL_EVENT_SEQUENCE) {
    provenance.costModelWarning = "legacy_event_sequence_ledger_v0";
  }
  if (input.costAssumptions) {
    provenance.costAssumptions = input.costAssumptions;
  }
  return provenance;
}

export function rankingGroupForProvenanceModel(
  engineCostModel: ResearchEngineCostModel,
): CompetitiveExecutionGroup {
  if (engineCostModel === ENGINE_COST_MODEL_SAFE) return GROUP_SAFE;
  if (engineCostModel === ENGINE_COST_MODEL_EVENT_SEQUENCE_V1) {
    return GROUP_PATTERN_CANONICAL;
  }
  return GROUP_PATTERN;
}

export type { RankingCompatibilityGroup, ResearchEngineCostModel };
