import { describe, expect, it } from "vitest";
import {
  analyzeCandidateWeaknesses,
  snapshotFromTrial,
} from "../src/lib/rextora/strategySearch/weaknessAnalysis";
import { createEmptySearchPlan } from "../src/lib/rextora/strategySearch/searchPlan";
import { buildTradeEventTrace } from "../src/lib/rextora/backtest/tradeEventTrace";
import { buildPaperFeedback } from "../src/lib/rextora/strategySearch/paperFeedback";
import fs from "node:fs";
import path from "node:path";

describe("continuous research defaults", () => {
  it("new plans do not hard-stop on first qualified by default", () => {
    const plan = createEmptySearchPlan({
      searchName: "deadline-run",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 100,
      stageBatchSize: 10,
      maxRuntimeMs: 60_000,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
    });
    expect(plan.stopWhenQualifiedTarget).toBe(false);
    expect(plan.qualifiedTarget).toBe(1);
  });

  it("explicit stopWhenQualifiedTarget remains available as hard stop", () => {
    const plan = createEmptySearchPlan({
      searchName: "hard-stop",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 100,
      stageBatchSize: 10,
      maxRuntimeMs: null,
      spaces: [{ id: "ema_core", labelKo: "EMA" }],
      stopWhenQualifiedTarget: true,
    });
    expect(plan.stopWhenQualifiedTarget).toBe(true);
  });
});

describe("weakness analysis", () => {
  it("marks unavailable metrics without fabricating values", () => {
    const snap = snapshotFromTrial({
      paramsHash: "abc123abc123",
      passed: true,
      score: 1,
      windowResults: [{ totalReturn: 0.1, mdd: -0.4, trades: 2 }],
    });
    const analysis = analyzeCandidateWeaknesses(snap, { maxMddAbs: 0.2, minTrades: 5 });
    expect(analysis.findings.some((f) => f.category === "excessive_drawdown" && f.available)).toBe(
      true,
    );
    expect(analysis.findings.some((f) => f.category === "insufficient_trades")).toBe(true);
    expect(analysis.adjustment.actions.some((a) => a.type === "continue_runtime")).toBe(true);
    const pf = analysis.findings.find((f) => f.category === "low_profit_factor");
    expect(pf?.available).toBe(false);
  });
});

describe("trade event trace", () => {
  it("builds chronological entry/exit without inventing prices", () => {
    const trace = buildTradeEventTrace({
      id: "t1",
      side: "LONG",
      entryTime: "2024-01-01T00:00:00.000Z",
      exitTime: "2024-01-01T01:00:00.000Z",
      entryPrice: 100,
      exitPrice: 101,
      exitReason: "tp",
      feeUsdt: 0.1,
      slippageUsdt: 0.05,
      netPnlUsdt: 0.85,
      pnlPct: 0.01,
    } as never);
    expect(trace.events[0]?.kind).toBe("entry");
    expect(trace.exit.kind).toBe("target");
    expect(trace.fee).toBe(0.1);
    expect(trace.assumptionsKo.length).toBeGreaterThan(0);
  });
});

describe("paper feedback", () => {
  it("reports unavailable deviations honestly", () => {
    const fb = buildPaperFeedback({
      strategyId: "custom_x",
      strategyName: "테스트",
      paperRealizedPnl: -10,
      paperTradeCount: 3,
    });
    expect(fb.paperMetrics.available).toBe(true);
    expect(fb.deviations.every((d) => d.available === false || d.available === true)).toBe(true);
    expect(fb.identifiedWeaknessesKo.length).toBeGreaterThan(0);
  });
});

describe("UI workflow wiring", () => {
  it("sidebar prioritizes research lifecycle and expert-gates the wizard", () => {
    const sidebar = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/Sidebar.tsx"),
      "utf8",
    );
    expect(sidebar.indexOf("전략 탐색")).toBeLessThan(
      sidebar.indexOf("시스템 설정"),
    );
    expect(sidebar).toContain('"/results"');
    expect(sidebar).not.toContain("고급 전략 편집");
    const strategies = fs.readFileSync(
      path.join(process.cwd(), "app/strategies/page.tsx"),
      "utf8",
    );
    expect(strategies).toContain('expert === "1"');
    const search = fs.readFileSync(
      path.join(process.cwd(), "app/strategy-search/page.tsx"),
      "utf8",
    );
    expect(search).toContain("첫 합격에서 멈추지 않습니다");
  });
});
