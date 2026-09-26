import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { visibleJobLifecycleActions } from "../components/rextora/strategySearch/jobActionVisibility";
import {
  composedJobMarketTitle,
  displayJobSearchTitle,
} from "../components/rextora/strategySearch/jobDisplayName";
import {
  BEGINNER_PRESET_MAP,
  createDefaultOperatorFormState,
} from "../components/rextora/strategySearch/formDefaults";
import { advancedConditionsStateLabel } from "../components/rextora/strategySearch/advancedConditionsState";
import {
  autoPresetEngineValues,
  autoPresetVisualDims,
} from "../components/rextora/strategySearch/visual/autoPresetVisual";
import {
  AUTO_PIPELINE_STEPS,
  DIRECT_LAYER_IDS,
  DIRECT_SUPPLEMENTAL_SPACE_IDS,
  mergeDirectVisualSpaceIds,
} from "../components/rextora/strategySearch/visual/searchVisualCopy";
import type { StrategySearchJobStatus } from "../components/rextora/strategySearch/types";

const UI_DIR = path.join(
  process.cwd(),
  "components",
  "rextora",
  "strategySearch",
);

function readUi(file: string): string {
  return fs.readFileSync(path.join(UI_DIR, file), "utf8");
}

describe("Strategy Search UX refinement", () => {
  it("maps lifecycle buttons to the current job state only", () => {
    const mapping: Array<{
      status: StrategySearchJobStatus;
      retryable?: boolean;
      expected: string[];
    }> = [
      { status: "queued", expected: ["start"] },
      { status: "running", expected: ["pause", "cancel"] },
      { status: "paused", expected: ["resume", "cancel"] },
      { status: "interrupted", expected: ["recover"] },
      { status: "cancel_requested", expected: ["cancel"] },
      { status: "cancelling", expected: ["cancel"] },
      { status: "failed", retryable: true, expected: ["retry"] },
      { status: "failed", retryable: false, expected: [] },
      { status: "completed", expected: ["results"] },
      { status: "cancelled", retryable: true, expected: ["retry"] },
      { status: "cancelled", retryable: false, expected: [] },
    ];
    for (const row of mapping) {
      expect(
        visibleJobLifecycleActions({
          status: row.status,
          hasSelection: true,
          retryable: row.retryable,
        }),
      ).toEqual(row.expected);
    }
    expect(
      visibleJobLifecycleActions({
        status: "running",
        hasSelection: false,
      }),
    ).toEqual([]);
    const controls = readUi("ExecutionControls.tsx");
    expect(controls).toContain("visibleJobLifecycleActions");
    expect(controls).toContain("showStart ?");
    expect(controls).toContain("showPause ?");
    expect(controls).toContain("{showCancel ?");
    expect(controls).not.toContain("disabled={!showStart");
  });

  it("hides recovery CTA when recoverable count is zero", () => {
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("recoveryJobs.length > 0 || recoveryLoading");
    expect(workbench).toContain("ss-recovery-probe");
    expect(workbench).toContain("ss-recovery-count");
    const probeIdx = workbench.indexOf('data-testid="ss-recovery-probe"');
    const probeBlock = workbench.slice(Math.max(0, probeIdx - 360), probeIdx);
    expect(probeBlock).toContain("recoveryJobs.length > 0");
  });

  it("differentiates library vs job-scoped result CTAs", () => {
    const workbench = readUi("StrategySearchWorkbench.tsx");
    const controls = readUi("ExecutionControls.tsx");
    expect(workbench).toContain("전체 결과");
    expect(workbench).toContain("이 탐색 결과");
    expect(workbench).toContain('href="/results"');
    expect(workbench).toContain("/results?jobId=");
    expect(workbench).not.toContain("탐색 결과 열기");
    expect(workbench).not.toContain("이 연구 결과 보기");
    expect(workbench).toContain("detail?.id ?");
    expect(controls).toContain("ss-action-results");
    expect(controls).toContain("status !== \"completed\"");
  });

  it("uses a single normalized primary launch CTA label", () => {
    const form = readUi("JobCreateForm.tsx");
    expect(form).toContain("탐색 시작");
    expect(form).not.toContain("자동 탐색 시작");
    expect(form).not.toContain("선택 범위로 탐색 시작");
    expect(form).toContain("resolvedSelectionMode === \"automatic\"");
    expect(form).not.toContain("연구 시작");
    expect(form).not.toContain("직접 전략 탐색 시작");
    expect(form).toContain("✓ 설정 확인 완료");
    expect(form).toContain("ss-config-status-chip");
  });

  it("uses Korean-first chart presentation copy", () => {
    const preview = readUi("visual/StrategyVisualPreview.tsx");
    const copy = readUi("visual/searchVisualCopy.ts");
    expect(preview).toContain("저항");
    expect(preview).toContain("지지");
    expect(preview).toContain("공급");
    expect(preview).toContain("수요");
    expect(preview).toContain("오더블럭 (OB)");
    expect(preview).toContain("추세선");
    expect(copy).toContain('title: "오더블럭 (OB)"');
    expect(copy).toContain("Order Block");
    expect(copy).toContain("Fair Value Gap");
    expect(AUTO_PIPELINE_STEPS.map((step) => step.title)).toEqual([
      "시장 조건 확인",
      "진입 후보 생성",
      "롱·숏 비교",
      "손절·익절 검증",
      "비용 스트레스",
    ]);
    const builder = readUi("visual/StrategySearchVisualBuilder.tsx");
    expect(builder).not.toContain("ss-strategy-preview");
  });

  it("does not invent automatic profile scores", () => {
    const dims = autoPresetVisualDims("balanced");
    expect(dims.map((d) => d.key)).toEqual([
      "candidateBudget",
      "stageBatchSize",
      "maxMddAbs",
    ]);
    expect(BEGINNER_PRESET_MAP.safe.labelKo).toBe("안전형");
    expect(BEGINNER_PRESET_MAP.balanced.labelKo).toBe("균형형");
    expect(BEGINNER_PRESET_MAP.aggressive.labelKo).toBe("공격형");
    const visual = readUi("visual/autoPresetVisual.ts");
    expect(visual).not.toMatch(/위험 점수|기회 점수|별점|1\/5|risk score/i);
    const panel = readUi("visual/StrategyAutoPresetPanel.tsx");
    expect(panel).toContain("ss-preset-card__name");
    expect(panel).toContain("criteriaChips");
    const map = readUi("visual/searchScopeVisual.ts");
    expect(map).toContain("시장 범위");
    expect(map).toContain("전략군");
  });

  it("prefers stored market metadata over developer search names", () => {
    const developer = {
      id: "job_1",
      searchName: "FINAL_RELEASE_CFG_EXPERT",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
    };
    expect(displayJobSearchTitle(developer)).toBe("BTCUSDT · 15m");
    expect(composedJobMarketTitle(developer)).toBe("BTCUSDT · 15m");
    const named = {
      id: "job_2",
      searchName: "아침 변동성 점검",
      symbols: ["ETHUSDT"],
      timeframe: "5m",
    };
    expect(displayJobSearchTitle(named)).toBe("아침 변동성 점검");
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("displayJobSearchTitle");
    expect(workbench).not.toMatch(
      /job\.searchName \|\| job\.id/,
    );
  });

  it("keeps Direct risk_exits merge and does not leak automatic ids", () => {
    expect([...DIRECT_LAYER_IDS]).toEqual([
      "order_block",
      "fvg",
      "ema_core",
      "support_resistance",
      "trendline",
      "supply_demand",
    ]);
    expect([...DIRECT_SUPPLEMENTAL_SPACE_IDS]).toEqual(["risk_exits"]);
    const merged = mergeDirectVisualSpaceIds(
      ["order_block", "risk_exits", "rsi_pullback"],
      ["order_block", "ema_core"],
    );
    expect(merged).toEqual(["order_block", "ema_core", "risk_exits"]);
    expect(merged).not.toContain("rsi_pullback");
  });

  it("A: core select fields receive outlined field-shell treatment", () => {
    const builder = readUi("visual/StrategySearchVisualBuilder.tsx");
    expect(builder).toContain("ss-field-select");
    expect(builder).toContain('data-testid="ss-symbols"');
    expect(builder).toContain('data-testid="ss-timeframe"');
    expect(builder).toContain('data-testid="ss-period"');
    const css = fs.readFileSync(
      path.join(process.cwd(), "components", "rextora", "v3", "strategy-search.css"),
      "utf8",
    );
    expect(css).toContain(".ss-field-select");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("border: 1px solid var(--v3-border)");
    expect(css).toContain(":focus-visible");
  });

  it("B: advanced disclosure has an explicit button, aria-expanded, and state label", () => {
    const form = readUi("JobCreateForm.tsx");
    const guidedDisclosure = readUi("guided/GuidedDisclosure.tsx");
    expect(form).toContain("추가 탐색 설정");
    expect(form).toContain('data-testid="ss-advanced-trigger"');
    expect(form).toContain("aria-expanded={detailsOpen}");
    expect(form).toContain('data-testid="ss-validation-advanced-trigger"');
    expect(form).toContain("aria-expanded={stepValidationAdvancedOpen}");
    expect(guidedDisclosure).toContain("<summary");
    expect(advancedConditionsStateLabel(createDefaultOperatorFormState()).label).toBe(
      "기본값 사용 중",
    );
  });

  it("C: advanced expanded content uses light surfaces", () => {
    const form = readUi("JobCreateForm.tsx");
    expect(form).toContain("ss-adv-group");
    expect(form).toContain("ss-readonly-summary");
    expect(form).not.toContain("bg-slate-950/45 p-3");
    const css = fs.readFileSync(
      path.join(process.cwd(), "components", "rextora", "v3", "strategy-search.css"),
      "utf8",
    );
    expect(css).toContain(".ss-adv-group");
    expect(css).toContain("background: var(--v3-surface)");
  });

  it("D/E: profile cards keep real config values and selection handlers", () => {
    expect(autoPresetEngineValues("stable").minTradeCount).toBe(20);
    expect(autoPresetEngineValues("balanced").minTradeCount).toBe(10);
    expect(autoPresetEngineValues("scalping").minTradeCount).toBe(5);
    expect(BEGINNER_PRESET_MAP.safe.labelKo).toBe("안전형");
    const panel = readUi("visual/StrategyAutoPresetPanel.tsx");
    expect(panel).toContain("onSelect(style)");
    expect(panel).toContain("aria-pressed={active}");
    expect(panel).toContain("autoPresetEngineValues(style)");
  });

  it("F/G/H: ranking principle banner uses the real group contract", () => {
    const groups = readUi("ResearchRankingGroups.tsx");
    expect(groups).toContain("ss-ranking-champ-rule");
    expect(groups).toContain("전략군끼리 점수를 직접 비교하지 않습니다");
    expect(groups).toContain("각 전략군은 독립적으로 평가되며");
    expect(groups).toContain("research-no-global-champion");
    const card = readUi("ResearchRankingGroupCard.tsx");
    expect(card).toContain("group.bestPassedCandidate");
    expect(card).toContain("group.bestCandidate");
    expect(card).toContain('data-score-scope="intra-group"');
    expect(card).not.toMatch(/global best|cross-group score/);
  });

  it("I/J: completion summary uses actual job/summary metrics and strong labels", () => {
    const panel = readUi("ResearchCompletionPanel.tsx");
    expect(panel).toContain("job.config.symbols");
    expect(panel).toContain("job.config.timeframe");
    expect(panel).toContain("summary?.counts.evaluatedStrategies");
    expect(panel).toContain("ss-completion-metric__label");
    expect(panel).toContain("ss-completion-tested");
    expect(panel).not.toContain("Math.random");
  });

  it("K: prefers-reduced-motion covers the new UX motion", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "components", "rextora", "v3", "strategy-search.css"),
      "utf8",
    );
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".ss-advanced-body");
    expect(css).toContain(".ss-preset-bar__fill");
    expect(css).toContain(".ss-completion-metric");
  });

  it("L: mobile stays one-column for ranking and profile cards", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "components", "rextora", "v3", "strategy-search.css"),
      "utf8",
    );
    expect(css).toContain(".ss-ranking-group-grid");
    expect(css).toContain("grid-template-columns: 1fr");
    expect(css).toContain(".ss-preset-grid");
  });

  it("M: no engine or ranking-authority contract files are rewritten by this UX pass", () => {
    const generator = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/candidateGenerator.ts"),
      "utf8",
    );
    expect(generator).toContain("export function");
    const identity = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/researchEvaluationIdentity.ts"),
      "utf8",
    );
    expect(identity).toContain("export function applyGroupChampA");
  });
});
