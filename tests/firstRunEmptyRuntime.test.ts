/**
 * First-run / demo fixture lifecycle — isolated empty runtime.
 * Never touches the operator's real data/rextora directory.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_JOB_ID,
  DEMO_JOB_NAME,
  DEMO_STRATEGY_ID,
  DEMO_STRATEGY_NAME,
  isDemoBacktestRecord,
  isDemoStrategyRecord,
} from "../src/lib/rextora/firstRun/demoIdentity";
import {
  initializeDemoWorkspace,
  resetDemoWorkspace,
  dismissFirstRunSetup,
} from "../src/lib/rextora/firstRun/demoFixture";
import { classifyFirstRunStatus } from "../src/lib/rextora/firstRun/firstRunStatus";
import { listSearchJobs, getSearchJob } from "../src/lib/rextora/strategySearch/jobStore";
import {
  createStrategy,
  ensureStrategyStore,
  getStrategyById,
  listStrategies,
  setLiveActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";
import { listSavedBacktests } from "../src/lib/rextora/backtest/backtestStore";
import { listPaperSessions } from "../src/lib/rextora/paper/paperSessionStore";

import { parseIntent } from "../src/lib/rextora/agent/intentParser";
import { fetchFactsForIntent } from "../src/lib/rextora/agent/agentDataFetcher";
import {
  buildAgentResponse,
  buildLocalInterpretation,
} from "../src/lib/rextora/agent/agentResponseBuilder";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const REAL_DATA_DIR = path.join(process.cwd(), "data", "rextora");
const REAL_SAFE = path.join(process.cwd(), "data", "strategies", "SAFE_v44_i4060.json");

function snapshotSafeAbsent(): boolean {
  return !fs.existsSync(REAL_SAFE);
}

describe("first-run empty-runtime lifecycle", () => {
  let tmpRoot = "";
  let prior: {
    DATA?: string;
    STRAT?: string;
    PAPER?: string;
    SEARCH?: string;
    BT?: string;
  } = {};
  let safeAbsentBefore = true;
  let realDataListingBefore: string[] = [];

  beforeEach(() => {
    prior = {
      DATA: process.env.REXTORA_DATA_DIR,
      STRAT: process.env.REXTORA_STRATEGIES_DIR,
      PAPER: process.env.REXTORA_PAPER_SESSIONS_DIR,
      SEARCH: process.env.REXTORA_STRATEGY_SEARCH_DIR,
      BT: process.env.REXTORA_BACKTESTS_DIR,
    };
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-firstrun-"));
    process.env.REXTORA_DATA_DIR = tmpRoot;
    process.env.REXTORA_STRATEGIES_DIR = path.join(tmpRoot, "strategies");
    process.env.REXTORA_PAPER_SESSIONS_DIR = path.join(tmpRoot, "paper-sessions");
    process.env.REXTORA_STRATEGY_SEARCH_DIR = path.join(tmpRoot, "strategy-search");
    process.env.REXTORA_BACKTESTS_DIR = path.join(tmpRoot, "backtests");
    fs.mkdirSync(process.env.REXTORA_STRATEGIES_DIR, { recursive: true });
    safeAbsentBefore = snapshotSafeAbsent();
    realDataListingBefore = fs.existsSync(REAL_DATA_DIR)
      ? fs.readdirSync(REAL_DATA_DIR).sort()
      : [];
  });

  afterEach(() => {
    const restore = (key: keyof typeof prior, envKey: string) => {
      if (prior[key] === undefined) delete process.env[envKey];
      else process.env[envKey] = prior[key];
    };
    restore("DATA", "REXTORA_DATA_DIR");
    restore("STRAT", "REXTORA_STRATEGIES_DIR");
    restore("PAPER", "REXTORA_PAPER_SESSIONS_DIR");
    restore("SEARCH", "REXTORA_STRATEGY_SEARCH_DIR");
    restore("BT", "REXTORA_BACKTESTS_DIR");
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("detects EMPTY on isolated runtime and shows onboarding action", () => {
    const status = classifyFirstRunStatus();
    expect(status.mode).toBe("EMPTY");
    expect(status.recommendedAction).toBe("show_onboarding");
    expect(status.hasRealSearchJobs).toBe(false);
    expect(status.hasDemoSearchJobs).toBe(false);
    expect(status.counts.searchJobs).toBe(0);
    expect(listSearchJobs()).toEqual([]);
    expect(listSavedBacktests(10)).toEqual([]);
    expect(listPaperSessions()).toEqual([]);
  });

  it("does not invent strategies on empty runtime", () => {
    ensureStrategyStore();
    const nonSafe = listStrategies().filter((s) => s.id !== RETIRED_SAFE_STRATEGY_ID);
    expect(nonSafe).toHaveLength(0);
  });

  it("requires explicit confirmation path for demo — init is idempotent", () => {
    const first = initializeDemoWorkspace();
    expect(first.created).toBe(true);
    expect(first.jobId).toBe(DEMO_JOB_ID);
    expect(first.strategyId).toBe(DEMO_STRATEGY_ID);
    expect(first.paperDeepLink).toContain("demo=1");
    expect(first.paperDeepLink).toContain(DEMO_STRATEGY_ID);

    const second = initializeDemoWorkspace();
    expect(second.alreadyPresent).toBe(true);
    expect(second.created).toBe(false);
    expect(second.strategyId).toBe(first.strategyId);
    expect(second.runId).toBe(first.runId);

    const jobs = listSearchJobs();
    expect(jobs.filter((j) => j.id === DEMO_JOB_ID)).toHaveLength(1);
    expect(listStrategies().filter((s) => isDemoStrategyRecord(s))).toHaveLength(1);
    expect(listSavedBacktests(50).filter((r) => isDemoBacktestRecord(r))).toHaveLength(1);
    expect(listPaperSessions()).toHaveLength(0);

    const status = classifyFirstRunStatus();
    expect(status.mode).toBe("DEMO_ACTIVE");
    expect(status.hasDemoSearchJobs).toBe(true);
  });

  it("marks demo records and blocks live eligibility", () => {
    initializeDemoWorkspace();
    const strat = getStrategyById(DEMO_STRATEGY_ID);
    expect(strat).toBeTruthy();
    expect(strat!.name).toBe(DEMO_STRATEGY_NAME);
    expect(strat!.liveEligible).toBe(false);
    expect(isDemoStrategyRecord(strat!)).toBe(true);
    expect(() => setLiveActiveStrategy(DEMO_STRATEGY_ID)).toThrow(/데모/);

    const job = getSearchJob(DEMO_JOB_ID);
    expect(job).toBeTruthy();
    expect(job!.config.strategyTemplateId).toBe(DEMO_JOB_NAME);

    const run = listSavedBacktests(10).find((r) => isDemoBacktestRecord(r));
    expect(run).toBeTruthy();
    expect(run!.report.strategyName).toBe(DEMO_STRATEGY_NAME);
  });

  it("classifies MIXED when real + demo coexist and reset removes only demo", () => {
    initializeDemoWorkspace();
    const real = createStrategy({
      name: "Real User Strategy",
      description: "operator real research",
      timeframe: "15m",
    });
    expect(isDemoStrategyRecord(real)).toBe(false);

    const mixed = classifyFirstRunStatus();
    expect(mixed.mode).toBe("MIXED");
    expect(mixed.hasRealStrategies).toBe(true);
    expect(mixed.hasDemoStrategies).toBe(true);

    const removed = resetDemoWorkspace();
    expect(removed.removedJob).toBe(true);
    expect(removed.removedStrategies).toBeGreaterThanOrEqual(1);

    expect(getSearchJob(DEMO_JOB_ID)).toBeNull();
    expect(getStrategyById(DEMO_STRATEGY_ID)).toBeFalsy();
    expect(getStrategyById(real.id)?.name).toBe("Real User Strategy");
    expect(listSavedBacktests(50).every((r) => !isDemoBacktestRecord(r))).toBe(true);

    const after = classifyFirstRunStatus();
    expect(after.hasDemoSearchJobs).toBe(false);
    expect(after.hasRealStrategies).toBe(true);
  });

  it("does not recreate retired SAFE during isolated first-run lifecycle", () => {
    initializeDemoWorkspace();
    resetDemoWorkspace();
    initializeDemoWorkspace();

    expect(safeAbsentBefore).toBe(true);
    expect(snapshotSafeAbsent()).toBe(true);

    const listingAfter = fs.existsSync(REAL_DATA_DIR)
      ? fs.readdirSync(REAL_DATA_DIR).sort()
      : [];
    expect(listingAfter).toEqual(realDataListingBefore);

    // Isolated paths used by this test
    expect(tmpRoot.includes("rextora-firstrun-")).toBe(true);
    expect(path.resolve(process.env.REXTORA_DATA_DIR!)).toBe(path.resolve(tmpRoot));
  });

  it("dismiss moves EMPTY toward DEMO_AVAILABLE without inventing data", () => {
    dismissFirstRunSetup();
    const status = classifyFirstRunStatus();
    expect(status.mode).toBe("DEMO_AVAILABLE");
    expect(status.setupDismissed).toBe(true);
    expect(listSearchJobs()).toHaveLength(0);
  });

  it("agent first-run prompts return facts + one recommended action without creating demo", async () => {
    const prompts = [
      "지금 뭘 해야 해?",
      "결과가 왜 없어?",
      "처음에는 어떻게 시작해?",
      "데모 보여줘",
    ];
    for (const q of prompts) {
      const intent = parseIntent(q);
      // Working-session phrasing maps to recommend_next; empty runtime still
      // surfaces first-run facts via lifecycle-aware recommend path.
      expect(["first_run_help", "demo_overview", "recommend_next"]).toContain(
        intent.type,
      );
      const facts = await fetchFactsForIntent(intent.type, intent.params);
      expect(facts.some((f) => f.labelKo === "최초 실행 모드")).toBe(true);
      expect(facts.some((f) => f.labelKo === "데모 자동 생성")).toBe(true);
      const auto = facts.find((f) => f.labelKo === "데모 자동 생성")?.value ?? "";
      expect(auto).toMatch(/아니오/);
      const response = buildAgentResponse(intent, facts);
      expect(response.recommendedActionKo).toBeTruthy();
      expect(response.actions.length).toBeGreaterThanOrEqual(1);
      expect(response.actions.length).toBeLessThanOrEqual(2);
      expect(response.safetyBlocked).toBe(false);
      expect(
        `${response.conclusionKo} ${response.explanationKo} ${buildLocalInterpretation(intent, facts)}`,
      ).toMatch(/데모|최초|예시|데이터|탐색/);
    }
    expect(listSearchJobs()).toHaveLength(0);
    expect(listStrategies().filter((s) => isDemoStrategyRecord(s))).toHaveLength(0);
  });

  it("restart classification preserves DEMO_ACTIVE after init", () => {
    initializeDemoWorkspace();
    const a = classifyFirstRunStatus();
    expect(a.mode).toBe("DEMO_ACTIVE");
    const b = classifyFirstRunStatus();
    expect(b.mode).toBe("DEMO_ACTIVE");
    expect(b.demoJobId).toBe(DEMO_JOB_ID);
    expect(b.demoStrategyId).toBe(DEMO_STRATEGY_ID);
  });
});
