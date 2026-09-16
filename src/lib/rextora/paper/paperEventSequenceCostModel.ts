/**
 * Paper-only Event-Sequence cost-model resolution (P3-A8.3).
 *
 * Does not change Research/Backtest/SAFE arithmetic.
 * Does not change Live execution. Live must not import this module
 * into an execution accounting path.
 *
 * Missing/unknown values never silently become today's canonical default.
 */

import {
  ENGINE_DEFAULT_FEE_RATE,
  ENGINE_DEFAULT_FUNDING_RATE,
  ENGINE_DEFAULT_SLIPPAGE_RATE,
  API_DEFAULT_APPLY_FUNDING,
  API_DEFAULT_APPLY_SPREAD,
} from "../backtest/backtestCostAssumptionsDiagnosis";
import { SAFE_STRATEGY_ID } from "../strategy/strategyTypes";
import type { StoredStrategyV1 } from "../strategy/definition/bridge";
import { parseStrategyExecutionProvenance } from "../strategy/strategyExecutionProvenance";
import {
  EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
  EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
  type EventSequenceCostModel,
} from "../strategy/eventSequenceCostModel";
import { getJobExecutionProfile } from "../strategySearch/jobExecutionProfile";
import type { StrategySearchStoreOptions } from "../strategySearch/jobStore";
import { parseSourceResearchJobId } from "../strategySearch/researchResultsSummary";
import type { PaperSession } from "./paperSessionStore";
import {
  PAPER_ES_COST_LABEL_UNRESOLVED,
  paperEventSequenceCostModelOperatorLabel,
  type PaperEventSequenceCostModelStatus,
} from "./paperEventSequenceCostLabels";

export const PAPER_COST_MODEL_UNRESOLVED = "PAPER_COST_MODEL_UNRESOLVED" as const;

export {
  PAPER_ES_COST_LABEL_CANONICAL,
  PAPER_ES_COST_LABEL_LEGACY,
  PAPER_ES_COST_LABEL_UNRESOLVED,
  paperEventSequenceCostModelOperatorLabel,
} from "./paperEventSequenceCostLabels";
export type { PaperEventSequenceCostModelStatus } from "./paperEventSequenceCostLabels";

export const ENGINE_DEFAULT_SPREAD_RATE = 0.0001;

export interface PaperEventSequenceCostAssumptions {
  feeRate: number;
  slippageRate: number;
  fundingRate: number;
  applyFunding: boolean;
  applySpread: boolean;
  spreadRate: number;
}

export interface PaperEventSequenceCostResolution {
  status: PaperEventSequenceCostModelStatus;
  costModel: EventSequenceCostModel | null;
  operatorLabel: string;
  technicalId: string | null;
  code: typeof PAPER_COST_MODEL_UNRESOLVED | null;
  reason: string;
  source:
    | "session"
    | "strategy_structured"
    | "strategy_explicit"
    | "strategy_legacy_provenance"
    | "job_profile"
    | "none";
  costAssumptions: PaperEventSequenceCostAssumptions;
}

const DEFAULT_COST_ASSUMPTIONS: PaperEventSequenceCostAssumptions = {
  feeRate: ENGINE_DEFAULT_FEE_RATE,
  slippageRate: ENGINE_DEFAULT_SLIPPAGE_RATE,
  fundingRate: ENGINE_DEFAULT_FUNDING_RATE,
  applyFunding: API_DEFAULT_APPLY_FUNDING,
  applySpread: API_DEFAULT_APPLY_SPREAD,
  spreadRate: ENGINE_DEFAULT_SPREAD_RATE,
};

export function parseExplicitEventSequenceCostModel(
  value?: string | null,
): EventSequenceCostModel | null {
  if (value === EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1) {
    return EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1;
  }
  if (value === EVENT_SEQUENCE_COST_MODEL_LEDGER_V0) {
    return EVENT_SEQUENCE_COST_MODEL_LEDGER_V0;
  }
  return null;
}

export function paperEventSequenceCostModelStatusFromModel(
  model: EventSequenceCostModel | null | undefined,
): PaperEventSequenceCostModelStatus {
  if (model === EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1) return "canonical";
  if (model === EVENT_SEQUENCE_COST_MODEL_LEDGER_V0) return "legacy";
  return "unresolved";
}

function parseProvenanceToken(
  description: string | null | undefined,
  key: string,
): string | null {
  if (!description) return null;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = description.match(new RegExp(`${escaped}=([^\\s·]+)`));
  return match?.[1] ?? null;
}

function isEventSequenceStrategy(
  strategy?: StoredStrategyV1 | null,
): boolean {
  return Boolean(strategy?.definition?.eventSequence);
}

function isSafeStrategy(strategy?: StoredStrategyV1 | null): boolean {
  return strategy?.id === SAFE_STRATEGY_ID;
}

function descriptionHasResearchProvenance(
  description: string | null | undefined,
): boolean {
  if (!description) return false;
  return (
    parseSourceResearchJobId(description) != null ||
    /candidateParamsHash=/.test(description) ||
    description.includes("전략 탐색") ||
    description.includes("costModelWarning=legacy_event_sequence_ledger_v0")
  );
}

function readJobId(input: {
  strategy?: StoredStrategyV1 | null;
  session?: PaperSession | null;
}): string | null {
  if (input.session?.sourceResearchJobId) return input.session.sourceResearchJobId;
  const structured = parseStrategyExecutionProvenance(
    input.strategy?.executionProvenance,
  );
  if (structured.kind === "ok" && structured.value.sourceResearchJobId) {
    return structured.value.sourceResearchJobId;
  }
  const desc = input.strategy?.description ?? "";
  const fromDesc = parseSourceResearchJobId(desc);
  if (fromDesc) return fromDesc;
  const meta = (input.strategy?.definition?.metadata ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof meta.sourceResearchJobId === "string" && meta.sourceResearchJobId.trim()) {
    return meta.sourceResearchJobId.trim();
  }
  if (typeof meta.linkedJobId === "string" && meta.linkedJobId.trim()) {
    return meta.linkedJobId.trim();
  }
  return null;
}

function costsFromStructuredProvenance(
  strategy?: StoredStrategyV1 | null,
): Partial<PaperEventSequenceCostAssumptions> | null {
  const parsed = parseStrategyExecutionProvenance(strategy?.executionProvenance);
  if (parsed.kind !== "ok" || !parsed.value.costAssumptions) return null;
  const cost = parsed.value.costAssumptions;
  return {
    feeRate: cost.fee.effectiveRate,
    slippageRate: cost.slippage.effectiveRate,
    fundingRate: cost.funding.configuredRate,
    applyFunding: cost.funding.configuredEnabled,
    applySpread: cost.spread.configuredEnabled,
    spreadRate: cost.spread.configuredRate,
  };
}

function readStructuredEventSequenceCostModel(
  strategy?: StoredStrategyV1 | null,
): {
  present: boolean;
  invalid: boolean;
  model: EventSequenceCostModel | null;
} {
  const parsed = parseStrategyExecutionProvenance(strategy?.executionProvenance);
  if (parsed.kind === "absent") {
    return { present: false, invalid: false, model: null };
  }
  if (parsed.kind === "invalid") {
    return { present: true, invalid: true, model: null };
  }
  const model = parseExplicitEventSequenceCostModel(
    parsed.value.engineCostModel,
  );
  if (!model) {
    return { present: true, invalid: true, model: null };
  }
  return { present: true, invalid: false, model };
}

function readExplicitModelFromStrategy(
  strategy?: StoredStrategyV1 | null,
): EventSequenceCostModel | null {
  if (!strategy) return null;
  const desc = strategy.description ?? "";
  const fromEngine = parseExplicitEventSequenceCostModel(
    parseProvenanceToken(desc, "engineCostModel"),
  );
  if (fromEngine) return fromEngine;
  const fromGroup = parseExplicitEventSequenceCostModel(
    parseProvenanceToken(desc, "rankingCompatibilityGroup"),
  );
  if (fromGroup) return fromGroup;
  if (desc.includes("costModelWarning=legacy_event_sequence_ledger_v0")) {
    return EVENT_SEQUENCE_COST_MODEL_LEDGER_V0;
  }
  const meta = (strategy.definition?.metadata ?? {}) as Record<string, unknown>;
  return (
    parseExplicitEventSequenceCostModel(
      typeof meta.engineCostModel === "string" ? meta.engineCostModel : null,
    ) ??
    parseExplicitEventSequenceCostModel(
      typeof meta.eventSequenceCostModel === "string"
        ? meta.eventSequenceCostModel
        : null,
    ) ??
    parseExplicitEventSequenceCostModel(
      typeof meta.rankingCompatibilityGroup === "string"
        ? meta.rankingCompatibilityGroup
        : null,
    )
  );
}

function readSessionPersistedModel(
  session?: PaperSession | null,
): {
  model: EventSequenceCostModel | null;
  unresolved: boolean;
  present: boolean;
} {
  if (!session) {
    return { model: null, unresolved: false, present: false };
  }
  const explicit = parseExplicitEventSequenceCostModel(
    session.eventSequenceCostModel,
  );
  if (explicit) {
    return { model: explicit, unresolved: false, present: true };
  }
  if (session.eventSequenceCostModelStatus === "unresolved") {
    return { model: null, unresolved: true, present: true };
  }
  if (session.eventSequenceCostModelStatus === "not_applicable") {
    return { model: null, unresolved: false, present: true };
  }
  if (
    session.eventSequenceCostModel != null &&
    String(session.eventSequenceCostModel).length > 0
  ) {
    return { model: null, unresolved: true, present: true };
  }
  return { model: null, unresolved: false, present: false };
}

function mergeCostAssumptions(
  ...parts: Array<Partial<PaperEventSequenceCostAssumptions> | null | undefined>
): PaperEventSequenceCostAssumptions {
  const out: PaperEventSequenceCostAssumptions = { ...DEFAULT_COST_ASSUMPTIONS };
  for (const part of parts) {
    if (!part) continue;
    if (typeof part.feeRate === "number" && Number.isFinite(part.feeRate)) {
      out.feeRate = part.feeRate;
    }
    if (
      typeof part.slippageRate === "number" &&
      Number.isFinite(part.slippageRate)
    ) {
      out.slippageRate = part.slippageRate;
    }
    if (
      typeof part.fundingRate === "number" &&
      Number.isFinite(part.fundingRate)
    ) {
      out.fundingRate = part.fundingRate;
    }
    if (typeof part.applyFunding === "boolean") {
      out.applyFunding = part.applyFunding;
    }
    if (typeof part.applySpread === "boolean") {
      out.applySpread = part.applySpread;
    }
    if (typeof part.spreadRate === "number" && Number.isFinite(part.spreadRate)) {
      out.spreadRate = part.spreadRate;
    }
  }
  return out;
}

function readJobProfileEvidence(
  jobId: string | null,
  storeOptions?: StrategySearchStoreOptions,
): {
  model: EventSequenceCostModel | null;
  missingFieldLegacy: boolean;
  costs: Partial<PaperEventSequenceCostAssumptions> | null;
} {
  if (!jobId) {
    return { model: null, missingFieldLegacy: false, costs: null };
  }
  try {
    const profile = getJobExecutionProfile(jobId, storeOptions);
    if (!profile) {
      return { model: null, missingFieldLegacy: false, costs: null };
    }
    const explicit = parseExplicitEventSequenceCostModel(
      profile.eventSequenceCostModel,
    );
    return {
      model: explicit,
      missingFieldLegacy: profile.eventSequenceCostModel == null,
      costs: profile.baseCostConfig
        ? {
            feeRate: profile.baseCostConfig.feeRate,
            slippageRate: profile.baseCostConfig.slippageRate,
            fundingRate: profile.baseCostConfig.fundingRate,
            applyFunding: profile.baseCostConfig.applyFunding,
            applySpread: profile.baseCostConfig.applySpread,
            spreadRate: profile.baseCostConfig.spreadRate,
          }
        : null,
    };
  } catch {
    return { model: null, missingFieldLegacy: false, costs: null };
  }
}

function resolutionFromModel(
  model: EventSequenceCostModel,
  source: PaperEventSequenceCostResolution["source"],
  reason: string,
  costs: PaperEventSequenceCostAssumptions,
): PaperEventSequenceCostResolution {
  const status = paperEventSequenceCostModelStatusFromModel(model);
  return {
    status,
    costModel: model,
    operatorLabel: paperEventSequenceCostModelOperatorLabel(status),
    technicalId: model,
    code: null,
    reason,
    source,
    costAssumptions: costs,
  };
}

function unresolvedResolution(
  reason: string,
  costs: PaperEventSequenceCostAssumptions,
): PaperEventSequenceCostResolution {
  return {
    status: "unresolved",
    costModel: null,
    operatorLabel: PAPER_ES_COST_LABEL_UNRESOLVED,
    technicalId: null,
    code: PAPER_COST_MODEL_UNRESOLVED,
    reason,
    source: "none",
    costAssumptions: costs,
  };
}

function notApplicableResolution(
  costs: PaperEventSequenceCostAssumptions,
): PaperEventSequenceCostResolution {
  return {
    status: "not_applicable",
    costModel: null,
    operatorLabel: "",
    technicalId: null,
    code: null,
    reason: "SAFE / non-pattern Paper path — Event-Sequence resolver bypassed",
    source: "none",
    costAssumptions: costs,
  };
}

export function resolvePaperEventSequenceCostModel(input: {
  strategy?: StoredStrategyV1 | null;
  session?: PaperSession | null;
  storeOptions?: StrategySearchStoreOptions;
}): PaperEventSequenceCostResolution {
  const costsFromSession = input.session?.eventSequenceCostAssumptions;
  const jobId = readJobId(input);
  const profile = readJobProfileEvidence(jobId, input.storeOptions);
  const costs = mergeCostAssumptions(
    profile.costs,
    costsFromStructuredProvenance(input.strategy),
    costsFromSession,
  );

  if (isSafeStrategy(input.strategy) || !isEventSequenceStrategy(input.strategy)) {
    return notApplicableResolution(costs);
  }

  const sessionState = readSessionPersistedModel(input.session);
  if (sessionState.present) {
    if (sessionState.unresolved) {
      return unresolvedResolution(
        "Paper session Event-Sequence cost model is unresolved",
        costs,
      );
    }
    if (sessionState.model) {
      return resolutionFromModel(
        sessionState.model,
        "session",
        "Paper session persisted Event-Sequence cost model",
        costs,
      );
    }
  }

  const structured = readStructuredEventSequenceCostModel(input.strategy);
  if (structured.present) {
    if (structured.invalid || !structured.model) {
      return unresolvedResolution(
        "Pattern strategy structured execution provenance is invalid",
        costs,
      );
    }
    return resolutionFromModel(
      structured.model,
      "strategy_structured",
      "structured StoredStrategy executionProvenance",
      costs,
    );
  }

  const explicit = readExplicitModelFromStrategy(input.strategy);
  if (explicit) {
    return resolutionFromModel(
      explicit,
      "strategy_explicit",
      "promoted strategy description/metadata engineCostModel",
      costs,
    );
  }

  if (profile.model) {
    return resolutionFromModel(
      profile.model,
      "job_profile",
      "source Research job execution profile Event-Sequence cost model",
      costs,
    );
  }

  const provenLegacy =
    descriptionHasResearchProvenance(input.strategy?.description) ||
    (jobId != null && profile.missingFieldLegacy) ||
    (jobId != null && !profile.model);

  if (provenLegacy) {
    return resolutionFromModel(
      EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
      "strategy_legacy_provenance",
      "historical Pattern provenance without explicit Event-Sequence cost model",
      costs,
    );
  }

  return unresolvedResolution(
    "Pattern strategy Event-Sequence cost model cannot be established",
    costs,
  );
}

export function paperEventSequenceSnapshotFromResolution(
  resolution: PaperEventSequenceCostResolution,
): {
  eventSequenceCostModel: EventSequenceCostModel | null;
  eventSequenceCostModelStatus: PaperEventSequenceCostModelStatus;
  eventSequenceCostAssumptions: PaperEventSequenceCostAssumptions;
} {
  return {
    eventSequenceCostModel: resolution.costModel,
    eventSequenceCostModelStatus: resolution.status,
    eventSequenceCostAssumptions: resolution.costAssumptions,
  };
}

/**
 * Snapshot only when the session has not already frozen a model/status.
 * Never infers canonical_v1 from today's source default.
 */
export function snapshotPaperEventSequenceCostIfMissing(input: {
  session: PaperSession;
  strategy?: StoredStrategyV1 | null;
  storeOptions?: StrategySearchStoreOptions;
}): PaperSession {
  const already =
    parseExplicitEventSequenceCostModel(input.session.eventSequenceCostModel) ||
    input.session.eventSequenceCostModelStatus === "unresolved" ||
    input.session.eventSequenceCostModelStatus === "not_applicable" ||
    input.session.eventSequenceCostModelStatus === "canonical" ||
    input.session.eventSequenceCostModelStatus === "legacy";
  if (already) {
    return input.session;
  }
  const resolution = resolvePaperEventSequenceCostModel({
    strategy: input.strategy,
    session: input.session,
    storeOptions: input.storeOptions,
  });
  const snap = paperEventSequenceSnapshotFromResolution(resolution);
  return {
    ...input.session,
    ...snap,
  };
}
