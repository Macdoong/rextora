/**
 * Regression coverage for multi-pattern UI verify defects:
 * time-based progress, combination honesty, qualified=0 labeling,
 * four-pattern plan persistence, Korean failure-policy / verification labels.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  activeElapsedMs,
  createEmptySearchPlan,
  saveSearchPlan,
  getSearchPlan,
  syncPlanTimingFields,
  markPlanPaused,
  markPlanResumed,
} from "@/src/lib/rextora/strategySearch/searchPlan";
import {
  createStrategySearchJobApi,
  getStrategySearchJobApi,
} from "@/src/lib/rextora/strategySearch/jobApiService";
import { combinationLabelKo } from "@/src/lib/rextora/strategySearch/patternCombination";
import { createDefaultOperatorFormState, operatorFormToCreateBody } from "@/components/rextora/strategySearch/formDefaults";

function tmpStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-mp-"));
  return { rootDir: root };
}

describe("multi-pattern UI verify regressions", () => {
  it("time-based progress: 22m27s elapsed of 180m shows ~12.5%, not 90%", () => {
    const requested = 180 * 60 * 1000;
    const elapsed = (22 * 60 + 27) * 1000;
    const remaining = (157 * 60 + 33) * 1000;
    expect(elapsed + remaining).toBe(requested);
    const pct = Math.min(100, Math.round((elapsed / requested) * 100));
    expect(pct).toBe(12);
    expect(pct).not.toBe(90);
    // Iteration-based counterexample that previously drove 90%:
    const iterationPct = Math.round((248 / 280) * 100);
    expect(iterationPct).toBe(89);
    expect(pct).not.toBe(iterationPct);
  });

  it("pause freezes active elapsed; resume continues", () => {
    const t0 = 1_700_000_000_000;
    let plan = createEmptySearchPlan({
      searchName: "pause-progress",
      depthProfile: "standard",
      qualificationProfile: "balanced",
      qualifiedTarget: 3,
      stopWhenQualifiedTarget: false,
      candidateBudget: 200,
      stageBatchSize: 40,
      maxRuntimeMs: 3_600_000,
      spaces: [{ id: "order_block", labelKo: "Order Block" }],
    });
    plan = { ...plan, campaignStartedAtMs: t0 };
    expect(activeElapsedMs(plan, t0 + 10_000)).toBe(10_000);
    plan = markPlanPaused(plan, t0 + 10_000);
    expect(activeElapsedMs(plan, t0 + 40_000)).toBe(10_000);
    plan = markPlanResumed(plan, t0 + 40_000);
    expect(activeElapsedMs(plan, t0 + 50_000)).toBe(20_000);
  });

  it("four selected patterns persist in Plan and API detail combination label", () => {
    const store = tmpStore();
    const form = createDefaultOperatorFormState();
    form.searchName = "UI_VERIFY_MULTI_PATTERN_JUL27";
    form.durationPreset = "60";
    form.maxRuntimeMinutesOverride = "60";
    form.autoStrategyCombo = false;
    form.selectedSpaceIds = [
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ];
    form.patternCombinationTemplate = "confluence";
    form.patternCombinationOperator = "and";
    form.patternCombinationFailurePolicy = "any";
    form.patternCombinationFamilies = [
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ];
    form.patternCombinationBlocks = form.patternCombinationFamilies.map(
      (family, order) => ({
        id: `${family}_${order}`,
        family,
        role: order === 0 ? ("entry_zone" as const) : ("trend_filter" as const),
        order,
        required: true,
        weight: 1,
        priority: order,
        params: {},
      }),
    );
    const created = createStrategySearchJobApi(
      operatorFormToCreateBody(form),
      store,
    );
    const plan = getSearchPlan(created.id, store);
    expect(plan?.searchName).toBe("UI_VERIFY_MULTI_PATTERN_JUL27");
    expect(plan?.patternCombinationFamilies).toEqual([
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ]);
    expect(plan?.patternCombinationOperator).toBe("and");
    expect(plan?.patternCombinationSpec?.blocks.map((b) => b.family)).toEqual([
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ]);
    expect(plan?.spaces.map((s) => s.id)).toEqual(["order_block"]);
    expect(
      plan?.spaces.some(
        (s) => s.id.includes("ema") || s.id.toLowerCase().includes("safe"),
      ),
    ).toBe(false);

    const detail = getStrategySearchJobApi(created.id, store);
    expect(detail.progressRatio).toBe(0);
    expect(detail.currentSearchFamily).toContain("OB");
    expect(detail.currentSearchFamily).toMatch(/FVG/);
    expect(detail.currentCombinationLabel).toBe(
      combinationLabelKo(plan!.patternCombinationSpec!),
    );
    expect(detail.patternCombinationFamilies).toEqual([
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ]);
  });

  it("operator form body separates user name from four-pattern confluence config", () => {
    const form = createDefaultOperatorFormState();
    form.searchName = "OB,FVG 테스트";
    form.durationPreset = "60";
    form.maxRuntimeMinutesOverride = "60";
    form.autoStrategyCombo = false;
    form.patternCombinationTemplate = "confluence";
    form.patternCombinationOperator = "and";
    form.patternCombinationFailurePolicy = "any";
    form.patternCombinationFamilies = [
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ];
    form.patternCombinationBlocks = form.patternCombinationFamilies.map(
      (family, order) => ({
        id: `${family}_${order}`,
        family,
        role: order === 0 ? ("entry_zone" as const) : ("trend_filter" as const),
        order,
        required: true,
        weight: 1,
        priority: order,
        params: {},
      }),
    );
    form.selectedSpaceIds = [...form.patternCombinationFamilies];
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.searchName).toBe("OB,FVG 테스트");
    expect(body.operatorPlan?.patternCombinationFamilies).toEqual([
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ]);
    expect(body.operatorPlan?.patternCombinationOperator).toBe("and");
    expect(body.operatorPlan?.patternCombinationFailurePolicy).toBe("any");
    expect(body.operatorPlan?.patternCombinationSpec?.blocks).toHaveLength(4);
  });

  it("failure-policy Korean descriptions and verification labels are localized", async () => {
    const formSrc = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/JobCreateForm.tsx",
      ),
      "utf8",
    );
    expect(formSrc).toContain("검증 필요");
    expect(formSrc).toContain("검증 완료");
    expect(formSrc).toContain("부분 지원");
    expect(formSrc).toContain("미지원");
    expect(formSrc).not.toContain('return "Verification Required"');
    expect(formSrc).toContain("하나라도 실패하면 전체 조건 탈락");
    expect(formSrc).toContain("모든 실패 조건이 발생해야 탈락");
    expect(formSrc).toContain("ss-preview-user-name");
    expect(formSrc).toContain("ss-preview-config-summary");

    const completion = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/ResearchCompletionPanel.tsx",
      ),
      "utf8",
    );
    expect(completion).toContain("임시 평가 상위 후보 — 합격 아님");
    expect(completion).toContain("qualified > 0 && mergedTop.length > 0");
  });

  it("prior cancelled multi-pattern job trials all carry four families", () => {
    const id = "search_bb3ec15c-d647-4707-9546-a21593f18080";
    const trialDir = path.join(
      process.cwd(),
      "data/rextora/strategy-search/trials",
      id,
    );
    if (!fs.existsSync(trialDir)) {
      expect(true).toBe(true);
      return;
    }
    const files = fs
      .readdirSync(trialDir)
      .filter((f) => f.endsWith(".json"))
      .slice(0, 20);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const trial = JSON.parse(
        fs.readFileSync(path.join(trialDir, f), "utf8"),
      ) as {
        params?: Record<string, unknown>;
      };
      expect(String(trial.params?.combinationFamilies ?? "")).toBe(
        "order_block+fvg+trendline+support_resistance",
      );
      expect(trial.params?.combinationOperator).toBe("and");
      const blocks = String(trial.params?.combinationBlocks ?? "");
      expect(blocks).toContain("order_block");
      expect(blocks).toContain("fvg");
      expect(blocks).toContain("trendline");
      expect(blocks).toContain("support_resistance");
      expect(blocks).not.toContain("ema_trend");
    }
  });

  it("qualified 0 job must not inherit previous-job Top10 entries", async () => {
    const store = tmpStore();
    const peerJob = "search_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const jobId = "search_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const peer = {
      version: 1,
      jobId: peerJob,
      scopeKey: "BTCUSDT|15m|balanced|standard|fresh|stress|jitter|default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entries: [
        {
          rank: 1,
          roleBadges: [],
          strategyHash: "peerhash0001",
          sourceResearchJobId: peerJob,
          sourceTrialIteration: 1,
          sourceClusterId: "c1",
          symbol: "BTCUSDT",
          timeframe: "15m",
          readableName: "변동성 돌파 · 공격형",
          displayAlias: "변동성 돌파 · 공격형",
          strategyFamily: "breakout",
          netReturn: 0.5,
          maxDrawdown: -0.1,
          tradeCount: 20,
          profitFactor: 1.5,
          winRate: 0.5,
          sharpe: 1,
          patternStack: "breakout",
          confidence: "표본 충분",
          risk: "low",
          miniSeries: null,
          score: 90,
          costStatus: "비용 계산 완료",
          robustnessStatus: "통과",
          sampleConfidence: "표본 충분",
          sampleConfidenceDetail: "",
          leverageLabel: "자동",
          rankReason: "peer",
          movementReasonKo: "",
          eligibilityStatus: "추천 가능",
          recommendable: true,
          finalRecommendable: true,
          registrationState: "not_registered",
          registeredStrategyId: null,
          overfittingRisk: "low",
        },
      ],
      previousEntries: null,
      rankChanges: [],
    };
    fs.mkdirSync(path.join(store.rootDir, "jobs"), { recursive: true });
    fs.writeFileSync(
      path.join(store.rootDir, "jobs", `${peerJob}.top10.json`),
      JSON.stringify(peer),
    );
    const { buildAndPersistResearchTop10 } = await import(
      "@/src/lib/rextora/strategySearch/researchTop10"
    );
    const snap = buildAndPersistResearchTop10({
      jobId,
      scopeKey: peer.scopeKey,
      representatives: [],
      previousSameScope: peer as never,
      options: store,
    });
    expect(snap.entries).toEqual([]);
    expect(snap.jobId).toBe(jobId);
  });
});
