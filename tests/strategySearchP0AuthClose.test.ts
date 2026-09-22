import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listJobs, POST as createJob } from "../app/api/rextora/strategy-search/route";
import {
  GET as getJob,
  DELETE as deleteJob,
} from "../app/api/rextora/strategy-search/[jobId]/route";
import { POST as startJob } from "../app/api/rextora/strategy-search/[jobId]/start/route";
import { POST as promoteJob } from "../app/api/rextora/strategy-search/[jobId]/promote/route";
import {
  GET as recoverGet,
  POST as recoverPost,
} from "../app/api/rextora/strategy-search/recover/route";
import { GET as storageSummaryGet } from "../app/api/rextora/strategy-search/storage-summary/route";
import {
  GET as listConfigs,
  POST as saveConfig,
} from "../app/api/rextora/strategy-search/configs/route";
import { GET as getBacktest, DELETE as deleteBacktest } from "../app/api/rextora/backtest/run/route";
import { POST as mutateStrategy } from "../app/api/rextora/strategies/route";
import { AUTH_SESSION_COOKIE } from "../src/lib/rextora/auth/authTypes";
import type { RextoraRole } from "../src/lib/rextora/auth/authTypes";
import { createUser } from "../src/lib/rextora/auth/userStore";
import { createSession } from "../src/lib/rextora/auth/sessionStore";
import { invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";
import {
  createStrategySearchJobApi,
  setStrategySearchApiStoreOptionsForTests,
} from "../src/lib/rextora/strategySearch/jobApiService";
import { saveSearchTrial } from "../src/lib/rextora/strategySearch/jobStore";
import { saveJobExecutionProfile } from "../src/lib/rextora/strategySearch/jobExecutionProfile";
import {
  acquireJobExecutionOwnership,
  getJobExecutionOwnership,
  getProcessExecutionOwnerId,
  releaseJobExecutionOwnership,
} from "../src/lib/rextora/strategySearch/jobExecutionOwnership";
import { saveStrategySearchConfig } from "../src/lib/rextora/strategySearch/searchConfigStore";
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import { createStrategy, getStrategyById } from "../src/lib/rextora/strategy/strategyStore";
import {
  saveBacktestResult,
} from "../src/lib/rextora/backtest/backtestStore";
import type {
  BacktestConfig,
  BacktestReport,
} from "../src/lib/rextora/backtest/backtestTypes";
import {
  canMutateOwnedResource,
  canReadOwnedResource,
  isLegacyOwnerlessResource,
  LEGACY_UNSPECIFIED_OWNER_LABEL_KO,
} from "../src/lib/rextora/auth/searchResourceAccess";

const FROM = Date.UTC(2024, 0, 1);
const TO = Date.UTC(2024, 0, 10);

function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    searchVersion: "phase6",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "synthetic-v1",
    seed: 101,
    generatorType: "random",
    maxIterations: 2,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 30, step: 1, valueType: "integer" },
    ],
    evaluationWindows: [
      {
        id: "full",
        label: "full",
        fromOpenTime: FROM,
        toOpenTime: TO,
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
    costStressScenarios: [],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.2,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        { key: "ema_fast", min: 10, max: 30, step: 1, valueType: "integer" },
      ],
    },
    dataRef: {
      source: "binance_historical",
      availableFrom: FROM,
      availableTo: TO,
    },
    ...overrides,
  };
}

type Actor = { userId: string; role: RextoraRole; headers: HeadersInit };

function request(input: string, init: RequestInit, actor: Actor): Request {
  const url = new URL(input, "http://localhost");
  const headers = new Headers(init.headers);
  const auth = actor.headers as Record<string, string>;
  for (const [key, value] of Object.entries(auth)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Request(url, { ...init, headers });
}

async function jsonOf(res: Response) {
  return (await res.json()) as {
    ok?: boolean;
    code?: string;
    error?: string;
    data?: unknown;
  };
}

const jobCtx = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

function stubReport(strategyId: string, ret: number): BacktestReport {
  return {
    strategyId,
    strategyHash: "hash_p0_auth",
    strategyName: "p0",
    symbol: "BTCUSDT",
    timeframe: "15m",
    fromDate: "2026-01-01",
    toDate: "2026-02-01",
    totalReturn: ret,
    mdd: -0.04,
    tradeCount: 8,
    winRate: 0.5,
    profitFactor: 1.1,
    endingBalance: 10_400,
    processedCandleCount: 40,
    candleCount: 40,
    dataSource: "binance",
  } as BacktestReport;
}

function stubConfig(strategyId: string): BacktestConfig {
  return {
    strategyId,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    fromOpenTime: Date.parse("2026-01-01T00:00:00.000Z"),
    toOpenTime: Date.parse("2026-02-01T00:00:00.000Z"),
    balance: 10_000,
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0,
    applyFunding: false,
    applySpread: false,
    spreadRate: 0,
    costStressMultipliers: [1],
    costGuardK: 3,
  };
}

describe("P0 Strategy Search object-auth close", () => {
  let tmp: string;
  let prevData: string | undefined;
  let prevSearch: string | undefined;
  let prevStrategies: string | undefined;
  let prevBacktests: string | undefined;
  let ceoUser: Actor;
  let adminUser: Actor;
  let operatorA: Actor;
  let operatorB: Actor;
  let viewerUser: Actor;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-p0-auth-"));
    prevData = process.env.REXTORA_DATA_DIR;
    prevSearch = process.env.REXTORA_STRATEGY_SEARCH_DIR;
    prevStrategies = process.env.REXTORA_STRATEGIES_DIR;
    prevBacktests = process.env.REXTORA_BACKTESTS_DIR;
    process.env.REXTORA_DATA_DIR = tmp;
    process.env.REXTORA_STRATEGY_SEARCH_DIR = path.join(tmp, "strategy-search");
    process.env.REXTORA_STRATEGIES_DIR = path.join(tmp, "strategies");
    process.env.REXTORA_BACKTESTS_DIR = path.join(tmp, "backtests");
    invalidateJsonStoreCache();
    setStrategySearchApiStoreOptionsForTests({
      rootDir: path.join(tmp, "strategy-search"),
    });

    const make = async (username: string, role: RextoraRole): Promise<Actor> => {
      const user = await createUser({
        username,
        displayName: username,
        role,
        password: `${username}-pass-9f3a`,
      });
      const session = createSession(user.userId);
      return {
        userId: user.userId,
        role,
        headers: {
          Cookie: `${AUTH_SESSION_COOKIE}=${session.token}`,
          Origin: "http://localhost",
        },
      };
    };
    ceoUser = await make("p0_ceo", "ceo");
    adminUser = await make("p0_admin", "admin");
    operatorA = await make("p0_op_a", "operator");
    operatorB = await make("p0_op_b", "operator");
    viewerUser = await make("p0_viewer", "viewer");
  });

  afterEach(() => {
    setStrategySearchApiStoreOptionsForTests(null);
    if (prevData === undefined) delete process.env.REXTORA_DATA_DIR;
    else process.env.REXTORA_DATA_DIR = prevData;
    if (prevSearch === undefined) delete process.env.REXTORA_STRATEGY_SEARCH_DIR;
    else process.env.REXTORA_STRATEGY_SEARCH_DIR = prevSearch;
    if (prevStrategies === undefined) delete process.env.REXTORA_STRATEGIES_DIR;
    else process.env.REXTORA_STRATEGIES_DIR = prevStrategies;
    if (prevBacktests === undefined) delete process.env.REXTORA_BACKTESTS_DIR;
    else process.env.REXTORA_BACKTESTS_DIR = prevBacktests;
    invalidateJsonStoreCache();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function createOwnedJob(actor: Actor) {
    const res = await createJob(
      request(
        "http://localhost/api/rextora/strategy-search",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(validCreateBody()),
        },
        actor,
      ),
    );
    expect(res.status).toBe(201);
    return (await jsonOf(res)).data as {
      id: string;
      ownerUserId?: string | null;
    };
  }

  async function listedIds(actor: Actor) {
    const res = await listJobs(
      request("http://localhost/api/rextora/strategy-search?limit=100", {}, actor),
    );
    expect(res.status).toBe(200);
    const data = (await jsonOf(res)).data;
    return Array.isArray(data) ? (data as Array<{ id: string }>).map((row) => row.id) : [];
  }

  it("A-C. operators see own jobs only; ownerless jobs are hidden", async () => {
    const owned = await createOwnedJob(operatorA);
    const legacy = createStrategySearchJobApi(validCreateBody({ seed: 7 }));
    expect(isLegacyOwnerlessResource(legacy)).toBe(true);

    const idsA = await listedIds(operatorA);
    expect(idsA).toContain(owned.id);
    expect(idsA).not.toContain(legacy.id);

    const idsB = await listedIds(operatorB);
    expect(idsB).not.toContain(owned.id);
    expect(idsB).not.toContain(legacy.id);

    const idsViewer = await listedIds(viewerUser);
    expect(idsViewer).not.toContain(owned.id);
    expect(idsViewer).not.toContain(legacy.id);
  });

  it("D-F. ownerless mutation denied for operator and CEO/admin; CEO/admin may inspect", async () => {
    const legacy = createStrategySearchJobApi(validCreateBody({ seed: 8 }));
    const ceoRead = await getJob(
      request(`http://localhost/api/rextora/strategy-search/${legacy.id}`, {}, ceoUser),
      jobCtx(legacy.id),
    );
    expect(ceoRead.status).toBe(200);
    const ceoBody = await jsonOf(ceoRead);
    const detail = ceoBody.data as {
      legacyUnspecifiedOwner?: boolean;
      ownershipLabelKo?: string | null;
    };
    expect(detail.legacyUnspecifiedOwner).toBe(true);
    expect(detail.ownershipLabelKo).toBe(LEGACY_UNSPECIFIED_OWNER_LABEL_KO);

    const opRead = await getJob(
      request(`http://localhost/api/rextora/strategy-search/${legacy.id}`, {}, operatorA),
      jobCtx(legacy.id),
    );
    expect(opRead.status).toBe(404);

    for (const actor of [operatorA, ceoUser, adminUser]) {
      const del = await deleteJob(
        request(
          `http://localhost/api/rextora/strategy-search/${legacy.id}`,
          { method: "DELETE" },
          actor,
        ),
        jobCtx(legacy.id),
      );
      expect(del.status).toBe(404);
      const start = await startJob(
        request(
          `http://localhost/api/rextora/strategy-search/${legacy.id}/start`,
          { method: "POST" },
          actor,
        ),
        jobCtx(legacy.id),
      );
      expect(start.status).toBe(404);
      const promote = await promoteJob(
        request(
          `http://localhost/api/rextora/strategy-search/${legacy.id}/promote`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ iteration: 0 }),
          },
          actor,
        ),
        jobCtx(legacy.id),
      );
      expect(promote.status).toBe(404);
    }
  });

  it("G-H. recover is admin-only; operators cannot mutate any job through it", async () => {
    const owned = await createOwnedJob(operatorA);
    const legacy = createStrategySearchJobApi(validCreateBody({ seed: 9 }));
    const opPost = await recoverPost(
      request(
        "http://localhost/api/rextora/strategy-search/recover",
        { method: "POST" },
        operatorA,
      ),
    );
    expect(opPost.status).toBe(403);
    const opGet = await recoverGet(
      request("http://localhost/api/rextora/strategy-search/recover", {}, operatorA),
    );
    expect(opGet.status).toBe(403);

    const adminGet = await recoverGet(
      request("http://localhost/api/rextora/strategy-search/recover", {}, adminUser),
    );
    expect(adminGet.status).toBe(200);
    const inspect = (await jsonOf(adminGet)).data as { mutation?: boolean };
    expect(inspect.mutation).toBe(false);

    expect(
      canMutateOwnedResource(operatorA, { ownerUserId: owned.ownerUserId }),
    ).toBe(true);
    expect(canMutateOwnedResource(operatorB, { ownerUserId: owned.ownerUserId })).toBe(
      false,
    );
    expect(canMutateOwnedResource(ceoUser, { ownerUserId: null })).toBe(false);
    expect(canReadOwnedResource(ceoUser, { ownerUserId: null })).toBe(true);
    void legacy;
  });

  it("I. storage-summary is admin-only and has no resource identifiers", async () => {
    await createOwnedJob(operatorA);
    const op = await storageSummaryGet(
      request(
        "http://localhost/api/rextora/strategy-search/storage-summary",
        {},
        operatorA,
      ),
    );
    expect(op.status).toBe(403);
    const admin = await storageSummaryGet(
      request(
        "http://localhost/api/rextora/strategy-search/storage-summary",
        {},
        adminUser,
      ),
    );
    expect(admin.status).toBe(200);
    const payload = JSON.stringify(await jsonOf(admin));
    expect(payload).not.toMatch(/ssj_/);
    expect(payload).not.toMatch(/custom_/);
    expect(payload).not.toMatch(/ownerUserId/);
  });

  it("J-P. backtest run ownership, list isolation, and legacy policy", async () => {
    const strategy = createStrategy({
      ownerUserId: operatorA.userId,
      name: "owned-p0",
      description: "p0",
    });
    const runA = saveBacktestResult({
      config: stubConfig(strategy.id),
      report: stubReport(strategy.id, 0.12),
      trades: [],
      sourceType: "user_backtest_run",
      strategyId: strategy.id,
      ownerUserId: operatorA.userId,
    });
    expect(runA.ownerUserId).toBe(operatorA.userId);
    expect(runA.report.totalReturn).toBe(0.12);

    const forged = saveBacktestResult({
      config: stubConfig(strategy.id),
      report: stubReport(strategy.id, 0.13),
      trades: [],
      sourceType: "user_backtest_run",
      strategyId: strategy.id,
      ownerUserId: "usr_forged",
    });
    expect(forged.ownerUserId).toBe("usr_forged");

    const routeSrc = fs.readFileSync(
      path.join(process.cwd(), "app/api/rextora/backtest/run/route.ts"),
      "utf8",
    );
    expect(routeSrc).toContain("ownerUserId: auth.user.userId");
    expect(routeSrc).not.toContain("ownerUserId: body.ownerUserId");

    const listA = await jsonOf(
      await getBacktest(
        request("http://localhost/api/rextora/backtest/run", {}, operatorA),
      ),
    );
    const idsA = (listA.data as Array<{ id: string }>).map((row) => row.id);
    expect(idsA).toContain(runA.id);
    expect(idsA).not.toContain(forged.id);

    const listB = await jsonOf(
      await getBacktest(
        request("http://localhost/api/rextora/backtest/run", {}, operatorB),
      ),
    );
    const idsB = (listB.data as Array<{ id: string }>).map((row) => row.id);
    expect(idsB).not.toContain(runA.id);

    const readB = await getBacktest(
      request(
        `http://localhost/api/rextora/backtest/run?runId=${encodeURIComponent(runA.id)}`,
        {},
        operatorB,
      ),
    );
    expect(readB.status).toBe(404);

    const delB = await deleteBacktest(
      request(
        `http://localhost/api/rextora/backtest/run?runId=${encodeURIComponent(runA.id)}`,
        { method: "DELETE" },
        operatorB,
      ),
    );
    expect(delB.status).toBe(404);

    const stratB = await getBacktest(
      request(
        `http://localhost/api/rextora/backtest/run?strategyId=${encodeURIComponent(strategy.id)}`,
        {},
        operatorB,
      ),
    );
    expect(stratB.status).toBe(404);

    const ownerlessStrategy = createStrategy({ name: "legacy-strat", description: "legacy" });
    expect(isLegacyOwnerlessResource(ownerlessStrategy)).toBe(true);
    const legacyRun = saveBacktestResult({
      config: stubConfig(ownerlessStrategy.id),
      report: stubReport(ownerlessStrategy.id, 0.05),
      trades: [],
      sourceType: "user_backtest_run",
      strategyId: ownerlessStrategy.id,
    });
    expect(isLegacyOwnerlessResource(legacyRun)).toBe(true);
    const opLegacyList = await jsonOf(
      await getBacktest(
        request("http://localhost/api/rextora/backtest/run", {}, operatorA),
      ),
    );
    expect(
      (opLegacyList.data as Array<{ id: string }>).some((row) => row.id === legacyRun.id),
    ).toBe(false);
    const ceoLegacyRead = await getBacktest(
      request(
        `http://localhost/api/rextora/backtest/run?runId=${encodeURIComponent(legacyRun.id)}`,
        {},
        ceoUser,
      ),
    );
    expect(ceoLegacyRead.status).toBe(200);
    const ceoLegacyDelete = await deleteBacktest(
      request(
        `http://localhost/api/rextora/backtest/run?runId=${encodeURIComponent(legacyRun.id)}`,
        { method: "DELETE" },
        ceoUser,
      ),
    );
    expect(ceoLegacyDelete.status).toBe(404);
    const mutateLegacy = await mutateStrategy(
      request(
        "http://localhost/api/rextora/strategies",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete", id: ownerlessStrategy.id }),
        },
        operatorA,
      ),
    );
    expect(mutateLegacy.status).toBe(404);
  });

  it("Q-R. Strategy Search handoff preserves owner and sourceResearchJobId", async () => {
    const job = await createOwnedJob(operatorA);
    const params = { ...CONTEXT_FALLBACK_PARAMS, ema_fast: 16 };
    const paramsHash = computeParamsHash(params);
    const store = { rootDir: path.join(tmp, "strategy-search") };
    saveJobExecutionProfile(
      job.id,
      {
        version: 1,
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
        scoreWeights: validCreateBody().scoreWeights as never,
        costStressScenarios: [],
        jitterConfig: validCreateBody().jitterConfig as never,
        dataRef: { availableFrom: FROM, availableTo: TO, source: "preloaded" },
      },
      store,
    );
    saveSearchTrial(
      {
        jobId: job.id,
        iteration: 0,
        candidateId: "c0",
        params,
        paramsHash,
        generatorType: "random",
        parentCandidateIds: [],
        score: 1.4,
        passed: true,
        failureReasons: [],
        windowResults: [
          {
            windowId: "full",
            symbol: "BTCUSDT",
            totalReturn: 0.1,
            mdd: -0.03,
            trades: 10,
            winRate: 0.55,
            profitFactor: 1.4,
          },
        ],
        costStressResults: [],
        jitterResults: [],
        durationMs: 4,
        createdAt: new Date().toISOString(),
      },
      store,
    );
    const promoted = await promoteJob(
      request(
        `http://localhost/api/rextora/strategy-search/${job.id}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "register_for_backtest", iteration: 0 }),
        },
        operatorA,
      ),
      jobCtx(job.id),
    );
    expect(promoted.status).toBe(200);
    const promo = await jsonOf(promoted);
    const strategyId = (promo.data as { strategyId?: string }).strategyId;
    expect(strategyId).toBeTruthy();
    const stored = getStrategyById(strategyId!);
    expect(stored?.ownerUserId).toBe(operatorA.userId);
    expect(stored?.description ?? "").toContain(`sourceResearchJobId=${job.id}`);
    expect((promo.data as { backtestHref?: string }).backtestHref).toContain(
      `strategyId=${strategyId}`,
    );
  });

  it("S-T. backtest numbers and PID lease are unchanged", () => {
    const strategy = createStrategy({
      ownerUserId: operatorA.userId,
      name: "num-p0",
    });
    const saved = saveBacktestResult({
      config: stubConfig(strategy.id),
      report: stubReport(strategy.id, 0.222),
      trades: [],
      sourceType: "user_backtest_run",
      strategyId: strategy.id,
      ownerUserId: operatorA.userId,
    });
    expect(saved.report.totalReturn).toBe(0.222);
    expect(saved.report.mdd).toBe(-0.04);
    expect(saved.report.tradeCount).toBe(8);

    const job = createStrategySearchJobApi(validCreateBody(), {
      ownerUserId: operatorA.userId,
    });
    const store = { rootDir: path.join(tmp, "strategy-search") };
    const processOwner = getProcessExecutionOwnerId();
    acquireJobExecutionOwnership(job.id, processOwner, store);
    const record = getJobExecutionOwnership(job.id, store);
    expect(record?.ownerId).toBe(processOwner);
    expect(record?.ownerId).not.toBe(operatorA.userId);
    releaseJobExecutionOwnership(job.id, processOwner, "test", store);
  });

  it("ownerless saved configs are hidden from ordinary users", async () => {
    const form = createDefaultOperatorFormState();
    saveStrategySearchConfig("legacy-cfg", form, {
      rootDir: path.join(tmp, "strategy-search"),
    });
    const listOp = await jsonOf(
      await listConfigs(
        request("http://localhost/api/rextora/strategy-search/configs", {}, operatorA),
      ),
    );
    const namesOp = (listOp.data as Array<{ name: string }>).map((row) => row.name);
    expect(namesOp).not.toContain("legacy-cfg");

    const listAdmin = await jsonOf(
      await listConfigs(
        request("http://localhost/api/rextora/strategy-search/configs", {}, adminUser),
      ),
    );
    const namesAdmin = (listAdmin.data as Array<{ name: string; ownershipLabelKo?: string | null }>);
    expect(namesAdmin.some((row) => row.name === "legacy-cfg")).toBe(true);
    expect(
      namesAdmin.find((row) => row.name === "legacy-cfg")?.ownershipLabelKo,
    ).toBe(LEGACY_UNSPECIFIED_OWNER_LABEL_KO);

    const mutate = await saveConfig(
      request(
        "http://localhost/api/rextora/strategy-search/configs",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "rename", name: "legacy-cfg", newName: "stolen" }),
        },
        operatorA,
      ),
    );
    expect(mutate.status).not.toBe(200);
  });
});
