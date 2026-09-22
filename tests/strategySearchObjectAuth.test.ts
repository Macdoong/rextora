import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listJobs, POST as createJob } from "../app/api/rextora/strategy-search/route";
import {
  GET as getJob,
  DELETE as deleteJob,
} from "../app/api/rextora/strategy-search/[jobId]/route";
import { GET as getResultsSummary } from "../app/api/rextora/strategy-search/[jobId]/results-summary/route";
import { GET as getTrials } from "../app/api/rextora/strategy-search/[jobId]/trials/route";
import { GET as getBest } from "../app/api/rextora/strategy-search/[jobId]/best/route";
import { POST as promoteJob } from "../app/api/rextora/strategy-search/[jobId]/promote/route";
import {
  GET as listConfigs,
  POST as saveConfig,
} from "../app/api/rextora/strategy-search/configs/route";
import {
  GET as loadConfig,
  DELETE as deleteConfig,
} from "../app/api/rextora/strategy-search/configs/[name]/route";
import {
  GET as listStrategies,
  POST as mutateStrategy,
} from "../app/api/rextora/strategies/route";
import { GET as getBacktest } from "../app/api/rextora/backtest/run/route";
import { AUTH_SESSION_COOKIE } from "../src/lib/rextora/auth/authTypes";
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
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import { getStrategyById } from "../src/lib/rextora/strategy/strategyStore";
import {
  canReadStrategySearchResource,
  canWriteStrategySearchResource,
  classifyOwnedResourceAccess,
} from "../src/lib/rextora/auth/searchResourceAccess";
import { validateCreateSearchJobBody } from "../src/lib/rextora/strategySearch/jobApiValidation";

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
    maxIterations: 3,
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
    costStressScenarios: [
      {
        id: "s1",
        label: "s1",
        requiredForPass: true,
        feeMultiplier: 1,
        slippageMultiplier: 1,
        fundingMultiplier: 1,
        spreadMultiplier: 1,
        costGuardKMultiplier: 1,
      },
    ],
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

type Authed = { userId: string; headers: HeadersInit };

function request(
  input: string,
  init: RequestInit,
  actor: Authed,
): Request {
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

const jobCtx = (jobId: string) => ({
  params: Promise.resolve({ jobId }),
});
const nameCtx = (name: string) => ({
  params: Promise.resolve({ name }),
});

describe("strategy search object authorization", () => {
  let tmp: string;
  let prevData: string | undefined;
  let prevSearch: string | undefined;
  let prevStrategies: string | undefined;
  let userA: Authed;
  let userB: Authed;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-object-auth-"));
    prevData = process.env.REXTORA_DATA_DIR;
    prevSearch = process.env.REXTORA_STRATEGY_SEARCH_DIR;
    prevStrategies = process.env.REXTORA_STRATEGIES_DIR;
    process.env.REXTORA_DATA_DIR = tmp;
    process.env.REXTORA_STRATEGY_SEARCH_DIR = path.join(tmp, "strategy-search");
    process.env.REXTORA_STRATEGIES_DIR = path.join(tmp, "strategies");
    invalidateJsonStoreCache();
    setStrategySearchApiStoreOptionsForTests({
      rootDir: path.join(tmp, "strategy-search"),
    });

    const a = await createUser({
      username: "object_auth_a",
      displayName: "User A",
      role: "operator",
      password: "object-auth-a-pass-9f3a",
    });
    const b = await createUser({
      username: "object_auth_b",
      displayName: "User B",
      role: "operator",
      password: "object-auth-b-pass-9f3a",
    });
    const sessionA = createSession(a.userId);
    const sessionB = createSession(b.userId);
    userA = {
      userId: a.userId,
      headers: {
        Cookie: `${AUTH_SESSION_COOKIE}=${sessionA.token}`,
        Origin: "http://localhost",
      },
    };
    userB = {
      userId: b.userId,
      headers: {
        Cookie: `${AUTH_SESSION_COOKIE}=${sessionB.token}`,
        Origin: "http://localhost",
      },
    };
  });

  afterEach(() => {
    setStrategySearchApiStoreOptionsForTests(null);
    if (prevData === undefined) delete process.env.REXTORA_DATA_DIR;
    else process.env.REXTORA_DATA_DIR = prevData;
    if (prevSearch === undefined) delete process.env.REXTORA_STRATEGY_SEARCH_DIR;
    else process.env.REXTORA_STRATEGY_SEARCH_DIR = prevSearch;
    if (prevStrategies === undefined) delete process.env.REXTORA_STRATEGIES_DIR;
    else process.env.REXTORA_STRATEGIES_DIR = prevStrategies;
    invalidateJsonStoreCache();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function createOwnedJob(actor: Authed) {
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
    const body = await jsonOf(res);
    const data = body.data as { id: string; ownerUserId?: string | null };
    return data;
  }

  it("A-C. owner stamp + own read allowed + cross-user job read denied", async () => {
    const job = await createOwnedJob(userA);
    expect(job.ownerUserId).toBe(userA.userId);

    const own = await getJob(
      request(`http://localhost/api/rextora/strategy-search/${job.id}`, {}, userA),
      jobCtx(job.id),
    );
    expect(own.status).toBe(200);

    const cross = await getJob(
      request(`http://localhost/api/rextora/strategy-search/${job.id}`, {}, userB),
      jobCtx(job.id),
    );
    expect(cross.status).toBe(404);
    const denied = await jsonOf(cross);
    expect(denied.code).toBe("JOB_NOT_FOUND");

    const listed = await listJobs(
      request("http://localhost/api/rextora/strategy-search", {}, userB),
    );
    expect(listed.status).toBe(200);
    const listBody = await jsonOf(listed);
    const jobs = Array.isArray(listBody.data)
      ? (listBody.data as Array<{ id: string }>)
      : [];
    expect(jobs.some((row) => row.id === job.id)).toBe(false);
  });

  it("D-G. userB cannot read results, trials, best, report/export/compare sources", async () => {
    const job = await createOwnedJob(userA);
    const paths = [
      getResultsSummary,
      getTrials,
      getBest,
    ] as const;
    for (const handler of paths) {
      const res = await handler(
        request(
          `http://localhost/api/rextora/strategy-search/${job.id}/x`,
          {},
          userB,
        ),
        jobCtx(job.id),
      );
      expect(res.status).toBe(404);
    }
  });

  it("H-I. userB cannot delete or promote userA job", async () => {
    const job = await createOwnedJob(userA);
    const del = await deleteJob(
      request(
        `http://localhost/api/rextora/strategy-search/${job.id}`,
        { method: "DELETE" },
        userB,
      ),
      jobCtx(job.id),
    );
    expect(del.status).toBe(404);

    const promote = await promoteJob(
      request(
        `http://localhost/api/rextora/strategy-search/${job.id}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ iteration: 0 }),
        },
        userB,
      ),
      jobCtx(job.id),
    );
    expect(promote.status).toBe(404);
  });

  it("J-L. saved configs are owner-scoped and same names do not collide", async () => {
    const form = createDefaultOperatorFormState();
    const saveA = await saveConfig(
      request(
        "http://localhost/api/rextora/strategy-search/configs",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "shared-name",
            form,
            ownerUserId: userB.userId,
          }),
        },
        userA,
      ),
    );
    expect(saveA.status).toBe(201);
    const savedA = (await jsonOf(saveA)).data as { ownerUserId?: string };
    expect(savedA.ownerUserId).toBe(userA.userId);

    const saveB = await saveConfig(
      request(
        "http://localhost/api/rextora/strategy-search/configs",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "shared-name", form }),
        },
        userB,
      ),
    );
    expect(saveB.status).toBe(201);
    const savedB = (await jsonOf(saveB)).data as { ownerUserId?: string };
    expect(savedB.ownerUserId).toBe(userB.userId);

    const listA = await jsonOf(
      await listConfigs(
        request("http://localhost/api/rextora/strategy-search/configs", {}, userA),
      ),
    );
    const namesA = (listA.data as Array<{ name: string; ownerUserId?: string | null }>)
      .filter((row) => row.ownerUserId === userA.userId)
      .map((row) => row.name);
    expect(namesA).toContain("shared-name");
    expect(
      (listA.data as Array<{ ownerUserId?: string | null }>).some(
        (row) => row.ownerUserId === userB.userId,
      ),
    ).toBe(false);

    const loadBofA = await loadConfig(
      request(
        "http://localhost/api/rextora/strategy-search/configs/shared-name",
        {},
        userB,
      ),
      nameCtx("shared-name"),
    );
    expect(loadBofA.status).toBe(200);
    const loadedB = (await jsonOf(loadBofA)).data as { ownerUserId?: string };
    expect(loadedB.ownerUserId).toBe(userB.userId);

    const delBofA = await deleteConfig(
      request(
        "http://localhost/api/rextora/strategy-search/configs/shared-name",
        { method: "DELETE" },
        userB,
      ),
      nameCtx("shared-name"),
    );
    expect(delBofA.status).toBe(200);

    const missingA = await loadConfig(
      request(
        "http://localhost/api/rextora/strategy-search/configs/shared-name",
        {},
        userB,
      ),
      nameCtx("shared-name"),
    );
    expect(missingA.status).toBe(404);

    const stillA = await loadConfig(
      request(
        "http://localhost/api/rextora/strategy-search/configs/shared-name",
        {},
        userA,
      ),
      nameCtx("shared-name"),
    );
    expect(stillA.status).toBe(200);
    const stillABody = (await jsonOf(stillA)).data as { ownerUserId?: string };
    expect(stillABody.ownerUserId).toBe(userA.userId);
  });

  it("M-O. promoted strategy inherits owner; userB cannot mutate or pick it", async () => {
    const job = await createOwnedJob(userA);
    const params = { ...CONTEXT_FALLBACK_PARAMS, ema_fast: 14 };
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
        dataRef: {
          availableFrom: FROM,
          availableTo: TO,
          source: "preloaded",
        },
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
        score: 1.5,
        passed: true,
        failureReasons: [],
        windowResults: [
          {
            windowId: "full",
            symbol: "BTCUSDT",
            totalReturn: 0.12,
            mdd: -0.04,
            trades: 15,
            winRate: 0.6,
            profitFactor: 1.5,
          },
        ],
        costStressResults: [],
        jitterResults: [],
        durationMs: 5,
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
          body: JSON.stringify({ iteration: 0 }),
        },
        userA,
      ),
      jobCtx(job.id),
    );
    expect(promoted.status).toBe(200);
    const promo = await jsonOf(promoted);
    const strategyId = (promo.data as { strategyId?: string }).strategyId;
    expect(strategyId).toBeTruthy();
    const stored = getStrategyById(strategyId!);
    expect(stored?.ownerUserId).toBe(userA.userId);

    const mutate = await mutateStrategy(
      request(
        "http://localhost/api/rextora/strategies",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete", id: strategyId }),
        },
        userB,
      ),
    );
    expect(mutate.status).toBe(404);

    const picker = await jsonOf(
      await listStrategies(
        request("http://localhost/api/rextora/strategies", {}, userB),
      ),
    );
    const pickerIds = (picker.data as Array<{ id: string }>).map((row) => row.id);
    expect(pickerIds).not.toContain(strategyId);

    const backtest = await getBacktest(
      request(
        `http://localhost/api/rextora/backtest/run?strategyId=${encodeURIComponent(strategyId!)}`,
        {},
        userB,
      ),
    );
    expect(backtest.status).toBe(404);
  });

  it("P. client cannot forge ownerUserId on job create", async () => {
    try {
      validateCreateSearchJobBody({
        ...validCreateBody(),
        ownerUserId: userB.userId,
      });
      throw new Error("expected ownerUserId to be rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(String((err as { details?: string[] }).details ?? [])).toMatch(
        /ownerUserId/,
      );
    }

    const res = await createJob(
      request(
        "http://localhost/api/rextora/strategy-search",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...validCreateBody(),
            ownerUserId: userB.userId,
          }),
        },
        userA,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("Q. jobExecutionOwnership PID lease is unchanged", () => {
    const job = createStrategySearchJobApi(validCreateBody(), {
      ownerUserId: userA.userId,
    });
    const store = { rootDir: path.join(tmp, "strategy-search") };
    const processOwner = getProcessExecutionOwnerId();
    const acquired = acquireJobExecutionOwnership(job.id, processOwner, store);
    expect(acquired.outcome === "acquired" || acquired.outcome === "idempotent_same_owner").toBe(
      true,
    );
    const record = getJobExecutionOwnership(job.id, store);
    expect(record?.ownerId).toBe(processOwner);
    expect(record?.ownerId).not.toBe(userA.userId);
    releaseJobExecutionOwnership(job.id, processOwner, "test", store);
  });

  it("legacy unowned jobs are quarantined from ordinary users", () => {
    const job = createStrategySearchJobApi(validCreateBody());
    expect(job.ownerUserId == null || job.ownerUserId === "").toBe(true);
    expect(
      canReadStrategySearchResource(
        { userId: userA.userId, role: "operator" },
        { ownerUserId: null },
      ),
    ).toBe(false);
    expect(
      canWriteStrategySearchResource(
        { userId: userB.userId, role: "operator" },
        { ownerUserId: null },
      ),
    ).toBe(false);
    expect(
      canReadStrategySearchResource(
        { userId: userA.userId, role: "ceo" },
        { ownerUserId: null },
      ),
    ).toBe(true);
    expect(
      canWriteStrategySearchResource(
        { userId: userA.userId, role: "ceo" },
        { ownerUserId: null },
      ),
    ).toBe(false);
    expect(classifyOwnedResourceAccess(userA.userId, { ownerUserId: null })).toBe(
      "legacy_unresolved",
    );
    expect(
      classifyOwnedResourceAccess(userB.userId, { ownerUserId: userA.userId }),
    ).toBe("denied");
  });
});
