import fs from "node:fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildCompletedBacktestHref,
  isValidCompletedBacktestHref,
  resolveCompletedBacktestHandoffCandidate,
} from "../components/rextora/strategySearch/completionCustomerView";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const passedRec = {
  iteration: 4,
  paramsHash: "hash_passed",
  recommendable: true,
  finalRecommendable: true,
  registeredStrategyId: "strat_rec_1",
  registrationState: "등록됨" as const,
  symbol: "BTCUSDT",
  timeframe: "15m",
  clusterId: "cluster_a",
};

describe("Strategy Search completed Backtest handoff", () => {
  it("A: already-registered recommendation uses existing strategyId", () => {
    const candidate = resolveCompletedBacktestHandoffCandidate({
      rankingGroups: [
        {
          bestPassedCandidate: {
            iteration: 4,
            paramsHash: "hash_passed",
            passed: true,
          },
          bestCandidate: {
            iteration: 9,
            paramsHash: "hash_raw",
            passed: false,
          },
        },
      ],
      topRecommend: passedRec,
      backtestRecommendations: [passedRec],
      representatives: [passedRec],
      symbol: "BTCUSDT",
      timeframe: "15m",
    });
    expect(candidate?.registeredStrategyId).toBe("strat_rec_1");
    expect(candidate?.alreadyRegistered).toBe(true);
    expect(candidate?.iteration).toBe(4);
    expect(candidate?.source).toBe("bestPassedCandidate");
    const href = buildCompletedBacktestHref({
      strategyId: candidate!.registeredStrategyId!,
      sourceParamsHash: candidate!.paramsHash,
      symbol: candidate!.symbol,
      timeframe: candidate!.timeframe,
      sourceResearchJobId: "job_1",
      sourceTrialIteration: candidate!.iteration,
    });
    expect(href).toContain("strategyId=strat_rec_1");
    const completion = read(
      "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
    );
    expect(completion).toContain("handoffCandidate?.registeredStrategyId");
    expect(completion).not.toContain(
      "/backtest?sourceResearchJobId=${encodeURIComponent(job.id)}",
    );
  });

  it("B: unregistered recommendation uses register_for_backtest", () => {
    const unregistered = {
      ...passedRec,
      registeredStrategyId: null,
      registrationState: "미등록" as const,
    };
    const candidate = resolveCompletedBacktestHandoffCandidate({
      topRecommend: unregistered,
      backtestRecommendations: [unregistered],
      representatives: [unregistered],
      symbol: "ETHUSDT",
      timeframe: "1h",
    });
    expect(candidate?.alreadyRegistered).toBe(false);
    expect(candidate?.registeredStrategyId).toBeNull();
    expect(candidate?.iteration).toBe(4);
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(workbench).toContain('mode: "register_for_backtest"');
    expect(workbench).toContain("handleRegisterForBacktest");
    expect(workbench).toContain("window.location.assign(href)");
    const completion = read(
      "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
    );
    expect(completion).toContain("onRegisterForBacktest");
    expect(completion).toContain("이 추천 후보를 전략 라이브러리에 등록한 뒤");
  });

  it("C: alreadyExists / duplicate reuses the existing strategyId contract", () => {
    const promote = read("src/lib/rextora/strategySearch/promoteFromSearch.ts");
    expect(promote).toContain("alreadyExists: true");
    expect(promote).toContain('registrationState: "duplicate"');
    const register = read(
      "src/lib/rextora/strategySearch/researchResultsSummary.ts",
    );
    expect(register).toContain(
      "Reuses existing registry identity when paramsHash already registered",
    );
    const route = read(
      "app/api/rextora/strategy-search/[jobId]/promote/route.ts",
    );
    expect(route).toContain('mode === "register_for_backtest"');
    expect(route).toContain("reused: data.result.alreadyExists === true");
  });

  it("D: failed raw bestCandidate is never selected for Backtest", () => {
    const failedRaw = {
      iteration: 9,
      paramsHash: "hash_raw",
      recommendable: false,
      finalRecommendable: false,
      registeredStrategyId: "strat_raw",
      registrationState: "미등록" as const,
      symbol: "BTCUSDT",
      timeframe: "15m",
      clusterId: null,
    };
    const candidate = resolveCompletedBacktestHandoffCandidate({
      rankingGroups: [
        {
          bestCandidate: {
            iteration: 9,
            paramsHash: "hash_raw",
            passed: false,
          },
          bestPassedCandidate: null,
        },
      ],
      topRecommend: null,
      backtestRecommendations: [],
      representatives: [failedRaw],
      symbol: "BTCUSDT",
      timeframe: "15m",
    });
    expect(candidate).toBeNull();
    const promote = read("src/lib/rextora/strategySearch/promoteFromSearch.ts");
    expect(promote).toContain("only Final PASS candidates can be promoted");
  });

  it("E/F: successful href includes strategyId and sourceResearchJobId", () => {
    const href = buildCompletedBacktestHref({
      strategyId: "strat_abc",
      strategyHash: "sh_abc",
      sourceParamsHash: "ph_abc",
      symbol: "BTCUSDT",
      timeframe: "15m",
      sourceResearchJobId: "job_xyz",
      sourceTrialIteration: 4,
      sourceClusterId: "cluster_a",
    });
    expect(href).toBeTruthy();
    expect(isValidCompletedBacktestHref(href)).toBe(true);
    const url = new URL(href!, "https://rextora.local");
    expect(url.pathname).toBe("/backtest");
    expect(url.searchParams.get("strategyId")).toBe("strat_abc");
    expect(url.searchParams.get("strategyHash")).toBe("sh_abc");
    expect(url.searchParams.get("sourceParamsHash")).toBe("ph_abc");
    expect(url.searchParams.get("symbol")).toBe("BTCUSDT");
    expect(url.searchParams.get("timeframe")).toBe("15m");
    expect(url.searchParams.get("sourceResearchJobId")).toBe("job_xyz");
    expect(url.searchParams.get("sourceTrialIteration")).toBe("4");
    expect(url.searchParams.get("sourceClusterId")).toBe("cluster_a");
    expect(isValidCompletedBacktestHref("/backtest?sourceResearchJobId=job_xyz")).toBe(
      false,
    );
    expect(isValidCompletedBacktestHref("/backtest")).toBe(false);
    expect(buildCompletedBacktestHref({
      strategyId: "  ",
      sourceResearchJobId: "job_xyz",
      sourceTrialIteration: 1,
    })).toBeNull();
  });

  it("G/H: Backtest boots and restores from strategyId URL/session/localStorage", () => {
    const backtest = read(
      "components/rextora/backtest/BacktestReviewWorkbench.tsx",
    );
    expect(backtest).toContain('const urlStrategyId = searchParams.get("strategyId")');
    expect(backtest).toContain(
      "const initialStrategyId = urlStrategyId || sessionBoot?.strategyId || null",
    );
    expect(backtest).toContain("Priority: URL → React state → localStorage → fallback");
    expect(backtest).toContain("rextora.lastBacktestStrategyId");
    expect(backtest).toContain("syncBacktestStrategyUrl");
    expect(backtest).not.toContain('searchParams.get("sourceResearchJobId")');
  });

  it("I: handoff failure does not navigate", () => {
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    expect(workbench).toContain("백테스트로 이동하지 못했습니다.");
    expect(workbench).toContain("setFeedback({ ...mapped, tone: \"error\" })");
    const failBlock = workbench.slice(
      workbench.indexOf("async function handleRegisterForBacktest"),
      workbench.indexOf("async function handleStartSearch"),
    );
    expect(failBlock).toContain("return;");
    expect(failBlock).toContain("window.location.assign(href)");
    const assignIndex = failBlock.indexOf("window.location.assign(href)");
    const failReturnIndex = failBlock.indexOf("백테스트로 이동하지 못했습니다.");
    expect(failReturnIndex).toBeGreaterThan(-1);
    expect(assignIndex).toBeGreaterThan(failReturnIndex);
  });

  it("J: no eligible recommendation produces no Backtest handoff", () => {
    expect(
      resolveCompletedBacktestHandoffCandidate({
        rankingGroups: [],
        topRecommend: null,
        backtestRecommendations: [],
        representatives: [],
        symbol: "BTCUSDT",
        timeframe: "15m",
      }),
    ).toBeNull();
    const completion = read(
      "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
    );
    expect(completion).toContain("handoffCandidate != null");
    expect(completion).toContain("ss-completion-backtest-recommended");
  });

  it("K: search ranking/recommendation/promotion contracts are unchanged", () => {
    const identity = read(
      "src/lib/rextora/strategySearch/researchEvaluationIdentity.ts",
    );
    expect(identity).toContain("export function applyGroupChampA");
    expect(identity).toContain("bestPassedCandidate");
    const summary = read(
      "src/lib/rextora/strategySearch/researchResultsSummary.ts",
    );
    expect(summary).toContain("export function registerTrialForBacktest");
    expect(summary).toContain("strategyId: result.strategyId");
    const promote = read("src/lib/rextora/strategySearch/promoteFromSearch.ts");
    expect(promote).toContain("only Final PASS candidates can be promoted");
  });
});
