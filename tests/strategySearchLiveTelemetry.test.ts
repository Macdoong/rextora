import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SEARCH_ACTIVITY_BUFFER_SIZE,
  appendPersistedSearchActivityEvents,
  appendSearchActivityEvent,
  buildPersistedCheckpoint,
  createInitialRunnerPayload,
  createSearchJob,
  createSeededRandom,
  familyHandoffActivityEvents,
  formatActivityEventLineKo,
  formatCustomerFailureReasonKo,
  getSearchJob,
  getSearchTrial,
  getStrategySearchJobApi,
  mapCustomerFailureReasonCodes,
  runSearchJob,
  sanitizeCustomerActivityEvent,
  sanitizeRecentActivityEvents,
  type EvaluateCompleteCandidateInput,
  type StrategySearchActivityEvent,
  type StrategySearchCompleteCandidateEvaluation,
  type StrategySearchConfig,
} from "../src/lib/rextora/strategySearch";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-search-tel-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function sampleConfig(
  overrides: Partial<StrategySearchConfig> = {},
): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 42,
    generatorType: "random",
    maxIterations: 1,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" },
      { key: "ema_mid", min: 20, max: 60, step: 1, valueType: "integer" },
    ],
    evaluationWindows: [
      {
        id: "w1",
        label: "recent",
        fromOpenTime: 1_700_000_000_000,
        toOpenTime: 1_700_100_000_000,
      },
    ],
    passCriteria: { minTradeCount: 1, requireAllWindowsPass: true },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
    ...overrides,
  };
}

function evalFixtures() {
  return {
    windows: [
      {
        id: "w1",
        label: "recent",
        requestedFrom: 1_700_000_000_000,
        requestedTo: 1_700_100_000_000,
        requiredForPass: true,
      },
    ],
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
    },
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
    costStressScenarios: [] as const,
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.1,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        { key: "ema_fast", min: 10, max: 40, step: 1, valueType: "integer" as const },
      ],
    },
  };
}

function mockEval(input: {
  passed: boolean;
  score: number;
  issues?: Array<{ code: string }>;
}): (
  evalInput: EvaluateCompleteCandidateInput,
) => Promise<StrategySearchCompleteCandidateEvaluation> {
  return async (evalInput) => {
    const metrics = {
      startingBalance: 10_000,
      endingBalance: 11_200,
      totalReturn: 0.12,
      mdd: -0.08,
      trades: 14,
      winRate: 0.55,
      profitFactor: 1.4,
      monthlyReturns: [],
    };
    return {
      candidateId: evalInput.candidate.candidateId,
      paramsHash: evalInput.candidate.paramsHash,
      baseEvaluation: {
        candidateId: evalInput.candidate.candidateId,
        paramsHash: evalInput.candidate.paramsHash,
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        windows: [
          {
            symbol: "BTCUSDT",
            timeframe: "15m",
            candidateId: evalInput.candidate.candidateId,
            paramsHash: evalInput.candidate.paramsHash,
            window: {
              id: "w1",
              label: "recent",
              requestedFrom: 1,
              requestedTo: 2,
              requiredForPass: true,
            },
            metrics,
            tradeCount: metrics.trades,
            processedCandleCount: 100,
            firstProcessedOpenTime: 1,
            lastProcessedOpenTime: 2,
            durationMs: 1,
          },
        ],
        costConfig: {
          feeRate: 0,
          slippageRate: 0,
          fundingRate: 0,
          applyFunding: false,
          applySpread: false,
          spreadRate: 0,
        },
        startedAt: "2024-01-01T00:00:00.000Z",
        completedAt: "2024-01-01T00:00:01.000Z",
        durationMs: 1,
      },
      basePass: {
        passed: input.passed,
        requiredWindowCount: 1,
        passedRequiredWindowCount: input.passed ? 1 : 0,
        failedRequiredWindowCount: input.passed ? 0 : 1,
        issues: (input.issues ?? []).map((issue) => ({
          code: issue.code,
          symbol: "BTCUSDT",
          windowId: "w1",
          metric: "mdd",
          actual: -0.08,
          expected: -0.05,
          message: "internal dump must not leak",
        })),
      },
      baseScore: {
        finalScore: input.score,
        breakdown: {
          returnReward: input.score,
          mddPenalty: 0,
          profitFactorReward: 0,
          winRateReward: 0,
          tradeAdequacy: 0,
          negativeMonthPenalty: 0,
          consistency: 0,
          weightedReturn: input.score,
          weightedMdd: 0,
          weightedProfitFactor: 0,
          weightedWinRate: 0,
          weightedTradeAdequacy: 0,
          weightedNegativeMonth: 0,
          weightedConsistency: 0,
        },
        weights: evalFixtures().scoreWeights,
        requiredWindowCount: 1,
      },
      costStressResults: [],
      costStressPassed: true,
      jitterResult: {
        enabled: false,
        jitterPassed: true,
        sampleCount: 0,
        passedSampleCount: 0,
        failedSampleCount: 0,
        passRate: 1,
        averageScore: null,
        minimumScore: null,
        maximumScore: null,
        averageScoreDropRatio: null,
        maximumObservedScoreDropRatio: null,
        baseScore: input.score,
        samples: [],
      },
      finalPassed: input.passed,
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      durationMs: 1,
    };
  };
}

describe("strategy search live telemetry", () => {
  it("A: ring buffer stores max 12 events and does not mutate input", () => {
    const first: StrategySearchActivityEvent = {
      type: "top10_refreshed",
      at: "2024-01-01T00:00:00.000Z",
    };
    const seed = [first];
    let events: StrategySearchActivityEvent[] = seed;
    for (let i = 1; i <= 15; i += 1) {
      events = appendSearchActivityEvent(events, {
        type: "candidate_evaluated",
        at: `2024-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        evaluatedCount: i,
      });
    }
    expect(seed).toHaveLength(1);
    expect(events).toHaveLength(SEARCH_ACTIVITY_BUFFER_SIZE);
    expect(events[0]?.type).toBe("candidate_evaluated");
    expect(events[events.length - 1]?.type).toBe("candidate_evaluated");
    if (events[events.length - 1]?.type === "candidate_evaluated") {
      expect(events[events.length - 1].evaluatedCount).toBe(15);
    }
  });

  it("B: old checkpoint without events parses to empty activity", () => {
    const prng = createSeededRandom(1).getState();
    const checkpoint = buildPersistedCheckpoint({
      completedIterations: 0,
      nextIteration: 0,
      payload: createInitialRunnerPayload({ prng, jobStatus: "queued" }),
      bestCandidate: null,
      bestPassedCandidate: null,
    });
    expect(checkpoint.recentActivityEvents).toEqual([]);
    expect(sanitizeRecentActivityEvents(undefined)).toEqual([]);
  });

  it("C/D/E/G/I: evaluation emits evaluated + rejected/gate-passed with source metrics", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const rejectedJob = createSearchJob(sampleConfig({ maxIterations: 1 }), opts);
    await runSearchJob({
      jobId: rejectedJob.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: mockEval({
        passed: false,
        score: 0.2,
        issues: [{ code: "MAX_MDD" }, { code: "INTERNAL_STACK" }],
      }),
    });
    const rejected = getSearchJob(rejectedJob.id, opts);
    const rejectedEvents = rejected?.checkpoint.recentActivityEvents ?? [];
    expect(rejectedEvents.some((e) => e.type === "candidate_evaluated")).toBe(
      true,
    );
    const rejectEvent = rejectedEvents.find((e) => e.type === "candidate_rejected");
    expect(rejectEvent?.type).toBe("candidate_rejected");
    if (rejectEvent?.type === "candidate_rejected") {
      expect(rejectEvent.reasonCodes).toEqual(["MAX_MDD"]);
      expect(rejectEvent.metrics?.netReturn).toBe(0.12);
      expect(rejectEvent.metrics?.mdd).toBe(-0.08);
      expect(rejectEvent.metrics?.tradeCount).toBe(14);
      expect(rejectEvent.metrics?.winRate).toBe(0.55);
      expect(rejectEvent.metrics?.score).toBe(0.2);
      expect(JSON.stringify(rejectEvent)).not.toContain("INTERNAL_STACK");
      expect(JSON.stringify(rejectEvent)).not.toContain("internal dump");
    }
    const trial = getSearchTrial(rejectedJob.id, 0, opts);
    expect(trial?.customerFailureReasonCodes).toEqual(["MAX_MDD"]);
    expect(trial?.failureReasons.some((f) => f.code === "EVALUATION_FAILED_GATES")).toBe(
      true,
    );

    const passedJob = createSearchJob(sampleConfig({ maxIterations: 1, seed: 99 }), opts);
    await runSearchJob({
      jobId: passedJob.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: mockEval({ passed: true, score: 1.4 }),
    });
    const passedEvents =
      getSearchJob(passedJob.id, opts)?.checkpoint.recentActivityEvents ?? [];
    expect(passedEvents.some((e) => e.type === "candidate_gate_passed")).toBe(
      true,
    );
    expect(passedEvents.some((e) => e.type === "campaign_qualified")).toBe(false);
  });

  it("F: campaign qualified is distinct from gate pass", () => {
    const events = appendSearchActivityEvent(
      [
        {
          type: "candidate_gate_passed",
          at: "2024-01-01T00:00:00.000Z",
          evaluatedCount: 4,
        },
      ],
      {
        type: "campaign_qualified",
        at: "2024-01-01T00:00:01.000Z",
        qualifiedCount: 2,
      },
    );
    expect(events.map((e) => e.type)).toEqual([
      "candidate_gate_passed",
      "campaign_qualified",
    ]);
    expect(formatActivityEventLineKo(events[0]!)).toBe("평가 통과 후보 추가");
    expect(formatActivityEventLineKo(events[1]!)).toBe("최종 적격 후보 2개");
  });

  it("H: unsupported/internal reason codes are not exposed", () => {
    expect(
      mapCustomerFailureReasonCodes([
        { code: "MAX_MDD" },
        { code: "EVALUATION_FAILED_GATES" },
        { code: "PROTECTED_HASH_COLLISION" },
      ]),
    ).toEqual(["MAX_MDD"]);
    expect(
      sanitizeCustomerActivityEvent({
        type: "candidate_rejected",
        at: "2024-01-01T00:00:00.000Z",
        evaluatedCount: 3,
        reasonCodes: ["MAX_MDD", "paramsHash"],
        paramsHash: "abc",
        candidateId: "cand_1",
      }),
    ).toEqual({
      type: "candidate_rejected",
      at: "2024-01-01T00:00:00.000Z",
      evaluatedCount: 3,
      reasonCodes: ["MAX_MDD"],
    });
  });

  it("J/K: family start/complete events are built at real handoff labels", () => {
    const events = familyHandoffActivityEvents({
      leavingLabel: "오더블럭",
      nextLabel: "FVG",
      completedAt: "2024-01-01T00:00:10.000Z",
      startedAt: "2024-01-01T00:00:11.000Z",
    });
    expect(events).toEqual([
      {
        type: "family_completed",
        at: "2024-01-01T00:00:10.000Z",
        familyLabel: "오더블럭",
      },
      {
        type: "family_started",
        at: "2024-01-01T00:00:11.000Z",
        familyLabel: "FVG",
      },
    ]);
    expect(formatActivityEventLineKo(events[0]!)).toBe(
      "오더블럭 전략군 분석 완료",
    );
    expect(formatActivityEventLineKo(events[1]!)).toBe("FVG 전략군 분석 시작");
    const orch = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/searchOrchestrator.ts"),
      "utf8",
    );
    expect(orch).toContain('type: "family_started"');
    expect(orch).toContain("familyHandoffActivityEvents");
    expect(orch).toContain("campaignStartedAtMs == null");
  });

  it("L: top10_refreshed is only appended after the real Top-10 refresh", () => {
    const runner = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobRunner.ts"),
      "utf8",
    );
    const refreshIdx = runner.indexOf("refreshLiveResearchTop10(job.id, store)");
    const eventIdx = runner.indexOf('type: "top10_refreshed"');
    expect(refreshIdx).toBeGreaterThan(-1);
    expect(eventIdx).toBeGreaterThan(refreshIdx);
    expect(eventIdx - refreshIdx).toBeLessThan(400);
  });

  it("M/N/O/P/Q/R: job detail returns sanitized activity and live statistic counters", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig({ maxIterations: 1 }), opts);
    await runSearchJob({
      jobId: job.id,
      storeOptions: opts,
      ...evalFixtures(),
      evaluate: mockEval({ passed: true, score: 1.1 }),
    });
    appendPersistedSearchActivityEvents(
      job.id,
      [
        {
          type: "campaign_qualified",
          at: "2024-01-01T00:00:09.000Z",
          qualifiedCount: 1,
        },
      ],
      opts,
    );
    const detail = getStrategySearchJobApi(job.id, opts);
    expect(Array.isArray(detail.recentActivityEvents)).toBe(true);
    expect(detail.evaluatedCount).toBe(detail.statistics?.evaluated);
    expect(detail.gatePassedCount).toBe(detail.statistics?.passed);
    expect(detail.rejectedCount).toBe(detail.statistics?.failed);
    expect(detail.qualifiedCount).toBe(0);
    const blob = JSON.stringify(detail.recentActivityEvents);
    expect(blob).not.toContain("paramsHash");
    expect(blob).not.toContain("candidateId");
    expect(blob).not.toContain("strategyHash");
    expect(blob).not.toMatch(/"params":/);
    expect(
      detail.recentActivityEvents?.some((e) => e.type === "candidate_evaluated"),
    ).toBe(true);
    expect(
      detail.recentActivityEvents?.some((e) => e.type === "campaign_qualified"),
    ).toBe(true);
  });

  it("customer copy never shows internal reason codes", () => {
    expect(formatCustomerFailureReasonKo("MIN_TRADE_COUNT")).toBe(
      "최소 거래 수 조건 미통과",
    );
    expect(formatCustomerFailureReasonKo("MAX_MDD")).toBe(
      "최대낙폭 조건 미통과",
    );
  });
});
