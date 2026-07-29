/**
 * First-run status classification unit tests (isolated dirs).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyFirstRunStatus } from "../src/lib/rextora/firstRun/firstRunStatus";
import {
  initializeDemoWorkspace,
  markFirstRunSetupComplete,
  resetDemoWorkspace,
} from "../src/lib/rextora/firstRun/demoFixture";
import { createStrategy } from "../src/lib/rextora/strategy/strategyStore";
import { listSavedBacktests } from "../src/lib/rextora/backtest/backtestStore";
import { isDemoBacktestRecord } from "../src/lib/rextora/firstRun/demoIdentity";

describe("firstRunStatus classification", () => {
  let tmpRoot = "";
  let prior: Record<string, string | undefined> = {};

  beforeEach(() => {
    prior = {
      REXTORA_DATA_DIR: process.env.REXTORA_DATA_DIR,
      REXTORA_STRATEGIES_DIR: process.env.REXTORA_STRATEGIES_DIR,
      REXTORA_PAPER_SESSIONS_DIR: process.env.REXTORA_PAPER_SESSIONS_DIR,
      REXTORA_STRATEGY_SEARCH_DIR: process.env.REXTORA_STRATEGY_SEARCH_DIR,
      REXTORA_BACKTESTS_DIR: process.env.REXTORA_BACKTESTS_DIR,
    };
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-status-"));
    process.env.REXTORA_DATA_DIR = tmpRoot;
    process.env.REXTORA_STRATEGIES_DIR = path.join(tmpRoot, "strategies");
    process.env.REXTORA_PAPER_SESSIONS_DIR = path.join(tmpRoot, "paper-sessions");
    process.env.REXTORA_STRATEGY_SEARCH_DIR = path.join(tmpRoot, "strategy-search");
    process.env.REXTORA_BACKTESTS_DIR = path.join(tmpRoot, "backtests");
    fs.mkdirSync(process.env.REXTORA_STRATEGIES_DIR, { recursive: true });
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("EMPTY when no data and not dismissed", () => {
    expect(classifyFirstRunStatus().mode).toBe("EMPTY");
  });

  it("DEMO_ACTIVE after init", () => {
    initializeDemoWorkspace();
    expect(classifyFirstRunStatus().mode).toBe("DEMO_ACTIVE");
  });

  it("REAL_DATA_PRESENT for real strategy only", () => {
    createStrategy({ name: "Operator Strat", description: "real" });
    expect(classifyFirstRunStatus().mode).toBe("REAL_DATA_PRESENT");
  });

  it("MIXED for demo + real", () => {
    initializeDemoWorkspace();
    createStrategy({ name: "Operator Strat", description: "real" });
    expect(classifyFirstRunStatus().mode).toBe("MIXED");
  });

  it("SETUP_COMPLETE when completed with real-only", () => {
    createStrategy({ name: "Operator Strat", description: "real" });
    markFirstRunSetupComplete();
    expect(classifyFirstRunStatus().mode).toBe("SETUP_COMPLETE");
  });

  it("demo fixture schema produces marked backtest and reset clears it", () => {
    const init = initializeDemoWorkspace();
    const demoRuns = listSavedBacktests(20).filter(isDemoBacktestRecord);
    expect(demoRuns.length).toBe(1);
    expect(demoRuns[0]!.id).toBe(init.runId);
    resetDemoWorkspace();
    expect(listSavedBacktests(20).filter(isDemoBacktestRecord)).toHaveLength(0);
  });
});
