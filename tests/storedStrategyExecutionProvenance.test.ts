import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import {
  EXECUTION_PROVENANCE_LABEL_RECONSTRUCTED,
  EXECUTION_PROVENANCE_LABEL_STAMPED,
  EXECUTION_PROVENANCE_LABEL_UNRESOLVED,
} from "../src/lib/rextora/paper/paperEventSequenceCostLabels";
import { resolvePaperEventSequenceCostModel } from "../src/lib/rextora/paper/paperEventSequenceCostModel";
import {
  getPaperSession,
  preparePaperSession,
} from "../src/lib/rextora/paper/paperSessionStore";
import { buildPatternSearchDefinition } from "../src/lib/rextora/strategySearch/patternEventSequence";
import { ORDER_BLOCK_BASE_PARAMS } from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import {
  EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
  EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
} from "../src/lib/rextora/strategy/eventSequenceCostModel";
import type { StoredStrategyV1 } from "../src/lib/rextora/strategy/definition/bridge";
import {
  STRATEGY_EXECUTION_PROVENANCE_VERSION,
  buildStrategyExecutionProvenance,
  parseStrategyExecutionProvenance,
} from "../src/lib/rextora/strategy/strategyExecutionProvenance";
import {
  createStrategy,
  ensureStrategyStore,
  getStrategyById,
  updateStrategyDisplayMeta,
} from "../src/lib/rextora/strategy/strategyStore";

import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import { createSearchJob, saveSearchTrial } from "../src/lib/rextora/strategySearch/jobStore";
import { promoteSearchCandidateToStrategy } from "../src/lib/rextora/strategySearch/promoteFromSearch";
import {
  ENGINE_COST_MODEL_EVENT_SEQUENCE,
  ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
  ENGINE_COST_MODEL_SAFE,
  GROUP_PATTERN,
  GROUP_PATTERN_CANONICAL,
  GROUP_SAFE,
  stampResearchEvaluation,
} from "../src/lib/rextora/strategySearch/researchEvaluationIdentity";
import { orderBlockSearchRanges } from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const INTERVAL = 15 * 60 * 1000;
const START = Date.UTC(2024, 0, 1);
const COST = {
  feeRate: 0.0004,
  slippageRate: 0.0002,
  fundingRate: 0.0001,
  applyFunding: true,
  applySpread: true,
  spreadRate: 0.0001,
};
const PATTERN_PARAMS = { ...ORDER_BLOCK_BASE_PARAMS };

const hashesBefore = productionReadonlyHashes();
const strategyIndexBefore = fs.existsSync("data/rextora/strategies/index.json")
  ? createHash("sha256")
      .update(fs.readFileSync("data/rextora/strategies/index.json"))
      .digest("hex")
  : null;
const paperMtimesBefore = (() => {
  const dir = "data/rextora/paper-sessions";
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs.readdirSync(dir).map((name) => [
      name,
      fs.statSync(path.join(dir, name)).mtimeMs,
    ]),
  );
})();

const cleanups: Array<() => void> = [];
const tempDirs: string[] = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.REXTORA_PAPER_SESSIONS_DIR;
  delete process.env.REXTORA_STRATEGY_SEARCH_DIR;
});

function isolate(): { strategies: string; search: string; paper: string } {
  const iso = installIsolatedStrategyStore();
  cleanups.push(iso.cleanup);
  ensureStrategyStore();
  const search = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a831-search-"));
  const paper = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a831-paper-"));
  tempDirs.push(search, paper);
  process.env.REXTORA_STRATEGY_SEARCH_DIR = search;
  process.env.REXTORA_PAPER_SESSIONS_DIR = paper;
  return { strategies: iso.root, search, paper };
}

function sampleConfig(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "a831_pattern",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 7,
    generatorType: "random",
    maxIterations: 1,
    parameterRanges: orderBlockSearchRanges(),
    evaluationWindows: [
      {
        id: "w1",
        label: "w1",
        fromOpenTime: START,
        toOpenTime: START + 40 * INTERVAL,
      },
    ],
    passCriteria: { minTradeCount: 0, requireAllWindowsPass: true },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function executionProfile(canonical: boolean) {
  return {
    version: 1 as const,
    balance: 1000,
    baseCostConfig: COST,
    passPolicy: { thresholds: { minTradeCount: 0 } },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.1,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: orderBlockSearchRanges(),
    },
    dataRef: {
      availableFrom: START,
      availableTo: START + 40 * INTERVAL,
      source: "preloaded" as const,
    },
    ...(canonical
      ? { eventSequenceCostModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1 }
      : {}),
  };
}

function stamp(paramsHash: string, engine: typeof ENGINE_COST_MODEL_EVENT_SEQUENCE_V1 | typeof ENGINE_COST_MODEL_EVENT_SEQUENCE) {
  return stampResearchEvaluation({
    params: PATTERN_PARAMS,
    paramsHash,
    cost: COST,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    windows: [
      {
        id: "w1",
        fromOpenTime: START,
        toOpenTime: START + 40 * INTERVAL,
      },
    ],
    dataVersion: "v1",
    evaluationBalance: 1000,
    passPolicy: { thresholds: { minTradeCount: 0 } },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.1,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: orderBlockSearchRanges(),
    },
    engineCostModel: engine,
  });
}

function passedTrial(input: {
  jobId: string;
  iteration: number;
  paramsHash: string;
  complete?: boolean;
  reconstructed?: boolean;
  engine?: typeof ENGINE_COST_MODEL_EVENT_SEQUENCE_V1 | typeof ENGINE_COST_MODEL_EVENT_SEQUENCE;
}) {
  const engine = input.engine ?? ENGINE_COST_MODEL_EVENT_SEQUENCE_V1;
  const stamped = stamp(input.paramsHash, engine);
  return {
    jobId: input.jobId,
    iteration: input.iteration,
    candidateId: `c${input.iteration}`,
    params: PATTERN_PARAMS,
    paramsHash: input.paramsHash,
    generatorType: "random" as const,
    parentCandidateIds: [],
    score: 0.8,
    passed: true,
    failureReasons: [],
    windowResults: [
      {
        windowId: "w1",
        symbol: "BTCUSDT",
        totalReturn: 0.1,
        mdd: -0.02,
        trades: 2,
        winRate: 0.5,
        profitFactor: 1.2,
      },
    ],
    costStressResults: [],
    jitterResults: [],
    durationMs: 1,
    createdAt: new Date().toISOString(),
    ...(input.complete === false
      ? {
          researchEvaluationHash: "partial",
          engineCostModel: engine,
        }
      : input.reconstructed
        ? {}
        : {
            researchEvaluationIdentity: stamped.researchEvaluationIdentity,
            researchEvaluationHash: stamped.researchEvaluationHash,
            engineCostModel: engine,
            rankingCompatibilityGroup:
              engine === ENGINE_COST_MODEL_EVENT_SEQUENCE_V1
                ? GROUP_PATTERN_CANONICAL
                : GROUP_PATTERN,
            rankingEligible: true,
            promotionEligible: true,
          }),
  };
}

function patternDef() {
  return buildPatternSearchDefinition({
    candidateId: "pending",
    strategyName: "A8.3.1 pattern",
    timeframe: "15m",
    params: PATTERN_PARAMS,
    family: "order_block",
  })!;
}

function stubPattern(input: {
  description: string;
  executionProvenance?: StoredStrategyV1["executionProvenance"];
}): StoredStrategyV1 {
  return {
    id: "custom_a831",
    name: "stub",
    description: input.description,
    type: "custom",
    timeframe: "15m",
    paramsHash: "abcd1234abcd",
    params: {} as StoredStrategyV1["params"],
    locked: false,
    sourceFile: null,
    sourceStatus: "user_created",
    paperActive: false,
    liveActive: false,
    liveEligible: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    longConditionSummary: "",
    shortConditionSummary: "",
    stopLossSummary: "",
    takeProfitSummary: "",
    strategyType: "condition_builder",
    definition: patternDef(),
    executionProvenance: input.executionProvenance,
  };
}

function source(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("P3-A8.3.1 StoredStrategy structured execution provenance", () => {
  it("1. old StoredStrategy without structured field still parses", () => {
    const raw = {
      id: "custom_old",
      name: "old",
      description: "전략 탐색 · engineCostModel=event_sequence_ledger_v0",
      paramsHash: "oldhash",
    };
    const parsed = JSON.parse(JSON.stringify(raw)) as StoredStrategyV1;
    expect(parsed.executionProvenance).toBeUndefined();
    expect(parseStrategyExecutionProvenance(parsed.executionProvenance).kind).toBe(
      "absent",
    );
  });

  it("2-4. new canonical/legacy provenance parses and round-trips", () => {
    isolate();
    const canonical = buildStrategyExecutionProvenance({
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
      rankingCompatibilityGroup: GROUP_PATTERN_CANONICAL,
      researchEvaluationHash: "hash_c",
      sourceResearchJobId: "job_c",
      sourceIteration: 1,
      candidateParamsHash: "ph_c",
      reconstructed: false,
    })!;
    const legacy = buildStrategyExecutionProvenance({
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
      rankingCompatibilityGroup: GROUP_PATTERN,
      researchEvaluationHash: "hash_l",
      sourceResearchJobId: "job_l",
      sourceIteration: 2,
      candidateParamsHash: "ph_l",
      reconstructed: true,
    })!;
    expect(parseStrategyExecutionProvenance(canonical).kind).toBe("ok");
    expect(parseStrategyExecutionProvenance(legacy).kind).toBe("ok");
    const created = createStrategy({
      name: "structured canon",
      description: "display copy",
      strategyType: "condition_builder",
      definition: patternDef(),
      sourceParamsHash: "ph_c",
      executionProvenance: canonical,
    });
    const loaded = getStrategyById(created.id)!;
    expect(loaded.executionProvenance?.engineCostModel).toBe(
      ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
    );
    const disk = JSON.parse(
      fs.readFileSync(
        path.join(process.env.REXTORA_STRATEGIES_DIR!, `${created.id}.json`),
        "utf8",
      ),
    ) as StoredStrategyV1;
    expect(disk.executionProvenance?.version).toBe(
      STRATEGY_EXECUTION_PROVENANCE_VERSION,
    );
    expect(disk.executionProvenance?.researchEvaluationHash).toBe("hash_c");
  });

  it("5-14. canonical and legacy promotion stamps structured provenance", () => {
    const { search } = isolate();
    const store = { rootDir: search };
    const canonJob = createSearchJob(sampleConfig(), store);
    saveJobExecutionProfile(canonJob.id, executionProfile(true), store);
    const canonTrial = passedTrial({
      jobId: canonJob.id,
      iteration: 0,
      paramsHash: "canon_a831",
    });
    saveSearchTrial(canonTrial, store);
    const canon = promoteSearchCandidateToStrategy({
      jobId: canonJob.id,
      iteration: 0,
      storeOptions: store,
    });
    const canonStrategy = getStrategyById(canon.strategyId)!;
    expect(canonStrategy.executionProvenance?.engineCostModel).toBe(
      ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
    );
    expect(canonStrategy.executionProvenance?.rankingCompatibilityGroup).toBe(
      GROUP_PATTERN_CANONICAL,
    );
    expect(canonStrategy.executionProvenance?.researchEvaluationHash).toBe(
      canonTrial.researchEvaluationHash,
    );
    expect(canonStrategy.executionProvenance?.sourceResearchJobId).toBe(canonJob.id);
    expect(canonStrategy.executionProvenance?.sourceIteration).toBe(0);
    expect(canonStrategy.executionProvenance?.candidateParamsHash).toBe("canon_a831");
    expect(canonStrategy.executionProvenance?.provenanceStatus).toBe("stamped");
    expect(canonStrategy.description).toContain("event_sequence_execution_price_v1");

    const legacyJob = createSearchJob(sampleConfig(), store);
    saveJobExecutionProfile(legacyJob.id, executionProfile(false), store);
    saveSearchTrial(
      passedTrial({
        jobId: legacyJob.id,
        iteration: 0,
        paramsHash: "legacy_a831",
        reconstructed: true,
      }),
      store,
    );
    const legacy = promoteSearchCandidateToStrategy({
      jobId: legacyJob.id,
      iteration: 0,
      storeOptions: store,
    });
    const legacyStrategy = getStrategyById(legacy.strategyId)!;
    expect(legacyStrategy.executionProvenance?.engineCostModel).toBe(
      ENGINE_COST_MODEL_EVENT_SEQUENCE,
    );
    expect(legacyStrategy.executionProvenance?.costModelWarning).toBe(
      "legacy_event_sequence_ledger_v0",
    );
    expect(legacyStrategy.executionProvenance?.provenanceStatus).toBe(
      "reconstructed",
    );
  });

  it("15-17. incomplete canonical/legacy and UNKNOWN remain blocked", () => {
    const { search } = isolate();
    const store = { rootDir: search };
    const job = createSearchJob(sampleConfig(), store);
    saveJobExecutionProfile(job.id, executionProfile(true), store);
    saveSearchTrial(
      passedTrial({
        jobId: job.id,
        iteration: 0,
        paramsHash: "incomplete_a831",
        complete: false,
      }),
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: job.id,
        iteration: 0,
        storeOptions: store,
      }),
    ).toThrow(/complete research evaluation evidence/);

    const incompleteLegacy = createSearchJob(sampleConfig(), store);
    saveSearchTrial(
      {
        ...passedTrial({
          jobId: incompleteLegacy.id,
          iteration: 0,
          paramsHash: "legacy_incomplete",
          reconstructed: true,
        }),
      },
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: incompleteLegacy.id,
        iteration: 0,
        storeOptions: store,
      }),
    ).toThrow(/evaluation evidence cannot be reconstructed/);

    const unknownJob = createSearchJob(sampleConfig(), store);
    saveJobExecutionProfile(unknownJob.id, executionProfile(true), store);
    saveSearchTrial(
      {
        jobId: unknownJob.id,
        iteration: 0,
        candidateId: "u0",
        params: {},
        paramsHash: "unknown_a831",
        generatorType: "random",
        parentCandidateIds: [],
        score: 0.9,
        passed: true,
        failureReasons: [],
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
      },
      store,
    );
    expect(() =>
      promoteSearchCandidateToStrategy({
        jobId: unknownJob.id,
        iteration: 0,
        storeOptions: store,
      }),
    ).toThrow(/unknown_legacy/);
  });

  it("18. already-existing strategy is not silently rewritten", () => {
    const { search } = isolate();
    const store = { rootDir: search };
    const job = createSearchJob(sampleConfig(), store);
    saveJobExecutionProfile(job.id, executionProfile(true), store);
    saveSearchTrial(
      passedTrial({ jobId: job.id, iteration: 0, paramsHash: "dup_a831" }),
      store,
    );
    const first = promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 0,
      storeOptions: store,
    });
    const before = JSON.stringify(getStrategyById(first.strategyId));
    const second = promoteSearchCandidateToStrategy({
      jobId: job.id,
      iteration: 0,
      storeOptions: store,
    });
    expect(second.alreadyExists).toBe(true);
    expect(second.registrationState).toBe("duplicate");
    expect(JSON.stringify(getStrategyById(first.strategyId))).toBe(before);
  });

  it("19-21. structured provenance beats conflicting or edited description", () => {
    const canonical = buildStrategyExecutionProvenance({
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
      rankingCompatibilityGroup: GROUP_PATTERN_CANONICAL,
      researchEvaluationHash: "h",
      sourceResearchJobId: "job",
      sourceIteration: 1,
      candidateParamsHash: "p",
      reconstructed: false,
    })!;
    const legacy = buildStrategyExecutionProvenance({
      engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
      rankingCompatibilityGroup: GROUP_PATTERN,
      researchEvaluationHash: "h",
      sourceResearchJobId: "job",
      sourceIteration: 1,
      candidateParamsHash: "p",
      reconstructed: true,
    })!;
    const canonWins = resolvePaperEventSequenceCostModel({
      strategy: stubPattern({
        description:
          "engineCostModel=event_sequence_ledger_v0 · rankingCompatibilityGroup=event_sequence_ledger_v0",
        executionProvenance: canonical,
      }),
    });
    expect(canonWins.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1);
    expect(canonWins.source).toBe("strategy_structured");
    const legacyWins = resolvePaperEventSequenceCostModel({
      strategy: stubPattern({
        description:
          "engineCostModel=event_sequence_execution_price_v1 · rankingCompatibilityGroup=event_sequence_execution_price_v1",
        executionProvenance: legacy,
      }),
    });
    expect(legacyWins.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    const edited = resolvePaperEventSequenceCostModel({
      strategy: stubPattern({
        description: "user renamed this strategy, no tokens",
        executionProvenance: canonical,
      }),
    });
    expect(edited.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1);
  });

  it("22-25. Paper prefers structured; historical fallback and unresolved remain", () => {
    const structured = resolvePaperEventSequenceCostModel({
      strategy: stubPattern({
        description: "",
        executionProvenance: buildStrategyExecutionProvenance({
          engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
          rankingCompatibilityGroup: GROUP_PATTERN_CANONICAL,
          researchEvaluationHash: "h",
          sourceResearchJobId: "job",
          sourceIteration: 1,
          candidateParamsHash: "p",
          reconstructed: false,
        })!,
      }),
    });
    expect(structured.source).toBe("strategy_structured");
    expect(structured.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1);
    const structuredLegacy = resolvePaperEventSequenceCostModel({
      strategy: stubPattern({
        description: "",
        executionProvenance: buildStrategyExecutionProvenance({
          engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE,
          rankingCompatibilityGroup: GROUP_PATTERN,
          researchEvaluationHash: "h",
          sourceResearchJobId: "job",
          sourceIteration: 1,
          candidateParamsHash: "p",
          reconstructed: true,
        })!,
      }),
    });
    expect(structuredLegacy.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    const historical = resolvePaperEventSequenceCostModel({
      strategy: stubPattern({
        description:
          "전략 탐색 · sourceResearchJobId=job_old · candidateParamsHash=ph_old",
      }),
    });
    expect(historical.costModel).toBe(EVENT_SEQUENCE_COST_MODEL_LEDGER_V0);
    expect(historical.source).not.toBe("strategy_structured");
    const unresolved = resolvePaperEventSequenceCostModel({
      strategy: stubPattern({ description: "no evidence" }),
    });
    expect(unresolved.status).toBe("unresolved");
  });

  it("26-28. Paper session snapshots structured model; reload and description edit do not switch it", () => {
    isolate();
    const created = createStrategy({
      name: "session structured",
      description: "engineCostModel=event_sequence_ledger_v0",
      strategyType: "condition_builder",
      definition: patternDef(),
      sourceParamsHash: "sess_a831",
      executionProvenance: buildStrategyExecutionProvenance({
        engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
        rankingCompatibilityGroup: GROUP_PATTERN_CANONICAL,
        researchEvaluationHash: "h",
        sourceResearchJobId: "job",
        sourceIteration: 3,
        candidateParamsHash: "sess_a831",
        reconstructed: false,
      })!,
    });
    const session = preparePaperSession(
      { strategyId: created.id, requireApproval: true },
      { rootDir: process.env.REXTORA_PAPER_SESSIONS_DIR },
    );
    expect(session.eventSequenceCostModel).toBe(
      EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    );
    expect(
      getPaperSession(session.id, {
        rootDir: process.env.REXTORA_PAPER_SESSIONS_DIR,
      })?.eventSequenceCostModel,
    ).toBe(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1);
    updateStrategyDisplayMeta(created.id, {
      description: "engineCostModel=event_sequence_ledger_v0 · edited",
    });
    expect(
      getPaperSession(session.id, {
        rootDir: process.env.REXTORA_PAPER_SESSIONS_DIR,
      })?.eventSequenceCostModel,
    ).toBe(EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1);
  });

  it("29-32. description remains compatibility copy; machine path does not require it; API round-trip", () => {
    isolate();
    const created = createStrategy({
      name: "api roundtrip",
      description: "전략 탐색 · display/audit copy · engineCostModel=event_sequence_execution_price_v1",
      strategyType: "condition_builder",
      definition: patternDef(),
      executionProvenance: buildStrategyExecutionProvenance({
        engineCostModel: ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
        rankingCompatibilityGroup: GROUP_PATTERN_CANONICAL,
        researchEvaluationHash: "h",
        sourceResearchJobId: "job",
        sourceIteration: 1,
        candidateParamsHash: "p",
        reconstructed: false,
      })!,
    });
    expect(created.description).toContain("전략 탐색");
    const fromDisk = JSON.parse(
      fs.readFileSync(
        path.join(process.env.REXTORA_STRATEGIES_DIR!, `${created.id}.json`),
        "utf8",
      ),
    ) as StoredStrategyV1;
    expect(fromDisk.executionProvenance?.engineCostModel).toBe(
      ENGINE_COST_MODEL_EVENT_SEQUENCE_V1,
    );
    const legacyRecord = JSON.parse(
      JSON.stringify({
        id: "custom_legacy",
        name: "legacy",
        description: "old",
        paramsHash: "x",
      }),
    ) as StoredStrategyV1;
    expect(legacyRecord.executionProvenance).toBeUndefined();
    const resolved = resolvePaperEventSequenceCostModel({
      strategy: stubPattern({
        description: "totally unrelated user text",
        executionProvenance: created.executionProvenance,
      }),
    });
    expect(resolved.source).toBe("strategy_structured");
  });

  it("33-34. retired SAFE is not loaded; ordinary safe_params Paper bypass unchanged", () => {
    isolate();
    expect(getStrategyById(RETIRED_SAFE_STRATEGY_ID)).toBeUndefined();
    const strategy = createStrategy({
      name: "safe-params-fixture",
      timeframe: "15m",
      strategyType: "safe_params",
    });
    const paper = resolvePaperEventSequenceCostModel({ strategy });
    expect(paper.status).toBe("not_applicable");
  });

  it("35-40. arithmetic, paramsHash, evaluation hash, ranking unchanged", () => {
    expect(source("src/lib/rextora/strategy/eventSequenceCostModel.ts")).toContain(
      "slipLedgerPct = canonical ? 0 : input.slippageRate * 2",
    );
    expect(source("src/lib/rextora/strategySearch/backtestAdapter.ts")).toContain(
      "costModel: eventSequenceCostModel",
    );
    expect(source("src/lib/rextora/backtest/backtestRunner.ts")).toContain(
      "EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1",
    );
    expect(source("src/lib/rextora/strategy/strategyHash.ts")).toContain(
      "export function computeParamsHash",
    );
    expect(
      source("src/lib/rextora/strategySearch/researchEvaluationIdentity.ts"),
    ).toContain('research_evaluation_identity_v1');
    expect(
      source("src/lib/rextora/strategySearch/researchEvaluationIdentity.ts"),
    ).toContain("COMPETITIVE_RANKING_GROUPS");
    expect(ENGINE_COST_MODEL_SAFE).toBe(GROUP_SAFE);
  });

  it("41-45. promotion remains explicit; no Paper auto-start; Live unchanged; no orders", () => {
    expect(source("src/lib/rextora/strategySearch/promoteFromSearch.ts")).toContain(
      "promoteSearchCandidateToStrategy",
    );
    expect(source("src/lib/rextora/strategySearch/searchOrchestrator.ts")).not.toMatch(
      /promoteSearchCandidateToStrategy\(/,
    );
    expect(source("src/lib/rextora/paper/paperSessionStore.ts")).not.toMatch(
      /autoStart|auto-start|autoResume/,
    );
    expect(source("src/lib/rextora/botRuntime.ts")).not.toContain(
      "evaluateEventSequencePaperSignal",
    );
    expect(source("src/lib/rextora/botRuntime.ts")).not.toContain(
      "executionProvenance",
    );
  });

  it("46-48. production records unchanged; retired SAFE file remains absent", () => {
    const after = productionReadonlyHashes();
    expect(after.safeSha256).toBeNull();
    expect(after.researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(after.backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
    expect(after.safeSha256).toBe(hashesBefore.safeSha256);
    if (strategyIndexBefore) {
      const now = createHash("sha256")
        .update(fs.readFileSync("data/rextora/strategies/index.json"))
        .digest("hex");
      expect(now).toBe(strategyIndexBefore);
    }
    const dir = "data/rextora/paper-sessions";
    if (fs.existsSync(dir)) {
      for (const [name, mtime] of Object.entries(paperMtimesBefore)) {
        expect(fs.statSync(path.join(dir, name)).mtimeMs).toBe(mtime);
      }
    }
    expect(fs.existsSync("data/strategies/SAFE_v44_i4060.json")).toBe(false);
  });

  it("UI status labels", () => {
    expect(EXECUTION_PROVENANCE_LABEL_STAMPED).toBe("실행 증빙 완료");
    expect(EXECUTION_PROVENANCE_LABEL_RECONSTRUCTED).toBe(
      "기존 기록 · 실행 증빙 복원",
    );
    expect(EXECUTION_PROVENANCE_LABEL_UNRESOLVED).toBe("실행 모델 확인 필요");
    expect(source("app/paper-trading/page.tsx")).toContain(
      "paper-execution-provenance-status",
    );
  });
});
