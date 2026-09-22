import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUALIFIED_REGISTER_LABEL,
  RECOMMENDED_REGISTER_LABEL,
  RESULTS_REVIEW_GUIDANCE,
  RESULTS_REVIEW_LABEL,
  canShowQualifiedRegister,
  canShowRecommendedRegister,
  isStrategySearchDeveloperDiagnosticsVisible,
  resolveAuthoritativeQualifiedCount,
  resultsReviewAvailable,
} from "../components/rextora/strategySearch/completionCustomerView";
import { applyGroupChampA } from "../src/lib/rextora/strategySearch/researchEvaluationIdentity";

const ROOT = process.cwd();
const UI_DIR = path.join(ROOT, "components", "rextora", "strategySearch");

function readUi(file: string): string {
  return fs.readFileSync(path.join(UI_DIR, file), "utf8");
}

describe("Strategy Search customer completed-result audit", () => {
  it("A/B/C: developer diagnostics are isolated off the customer workbench", () => {
    const completion = readUi("ResearchCompletionPanel.tsx");
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(completion).not.toContain("개발자 정보");
    expect(workbench).not.toContain("실행 파이프라인 · 런타임 세부");
    expect(isStrategySearchDeveloperDiagnosticsVisible()).toBe(false);
  });

  it("D/E: completed headings and guidance use strong/neutral classes", () => {
    const completion = readUi("ResearchCompletionPanel.tsx");
    expect(completion).toContain("ss-completion-subhead");
    expect(completion).toContain("그룹별 최종 추천");
    expect(completion).not.toContain('text-emerald-100/80">그룹별 최종 추천');
    expect(completion).toContain("ss-completion-guidance");
    expect(completion).toContain(RESULTS_REVIEW_GUIDANCE);
    expect(completion).not.toContain("자동 이동하지 않습니다.");
    expect(completion).not.toContain("text-emerald-100/80");
    const css = fs.readFileSync(
      path.join(ROOT, "components", "rextora", "v3", "strategy-search.css"),
      "utf8",
    );
    expect(css).toContain(".ss-completion-subhead");
    expect(css).toContain("color: var(--v3-text-primary)");
    expect(css).toContain(".ss-completion-guidance");
    expect(css).toContain("color: var(--v3-text-secondary)");
  });

  it("F: enabled primary actions use high-contrast customer styles", () => {
    const completion = readUi("ResearchCompletionPanel.tsx");
    expect(completion).toContain("ss-btn-primary");
    expect(completion).toContain("completedActionClass");
    expect(completion).toContain("ss-btn-secondary");
    expect(completion).not.toContain("bg-emerald-500/30 text-emerald-50");
    const css = fs.readFileSync(
      path.join(ROOT, "components", "rextora", "v3", "strategy-search.css"),
      "utf8",
    );
    expect(css).toContain("color: #fff !important");
    expect(css).toContain(".ss-btn-primary:focus-visible");
    expect(css).toContain(".ss-btn-secondary:focus-visible");
  });

  it("G/H: next-step heading and cards replace lifecycle jargon", () => {
    const panel = readUi("LifecycleNextActionsPanel.tsx");
    expect(panel).toContain("다음 단계");
    expect(panel).not.toContain("라이프사이클 진행");
    expect(panel).not.toContain("다음 단계 (라이프사이클)");
    expect(panel).toContain("ss-next-step-card");
    expect(panel).toContain("통과 후보");
    expect(panel).not.toContain("합격 trial");
    const css = fs.readFileSync(
      path.join(ROOT, "components", "rextora", "v3", "strategy-search.css"),
      "utf8",
    );
    expect(css).toContain(".ss-next-step-card");
    expect(css).toContain("border: 1px solid var(--v3-border)");
    expect(css).toContain("background: var(--v3-surface)");
  });

  it("I: completion metrics keep their proven source contracts", () => {
    const completion = readUi("ResearchCompletionPanel.tsx");
    expect(completion).toContain("resolveAuthoritativeQualifiedCount");
    expect(completion).toContain("counts?.qualifiedStrategies");
    expect(completion).toContain("job.qualifiedCount");
    expect(completion).toContain("counts?.stageFinalRecommendable");
    expect(completion).toContain("counts?.recommendationEligibleStrategies");
    expect(completion).toContain("counts?.top10Saved");
    expect(completion).toContain("summary?.counts.evaluatedStrategies");
    expect(
      resolveAuthoritativeQualifiedCount({
        summaryQualified: 1141,
        jobQualifiedCount: 1141,
        trialPageCount: 200,
      }),
    ).toBe(1141);
    expect(
      resolveAuthoritativeQualifiedCount({
        summaryQualified: null,
        jobQualifiedCount: 1141,
        trialPageCount: 200,
      }),
    ).toBe(1141);
  });

  it("J: results review button tracks actual /results job target", () => {
    const completion = readUi("ResearchCompletionPanel.tsx");
    expect(completion).toContain(RESULTS_REVIEW_LABEL);
    expect(completion).toContain("/results?jobId=");
    expect(completion).toContain("resultsReviewAvailable");
    expect(completion).toContain("ss-btn-primary is-disabled");
    expect(
      resultsReviewAvailable({ usable: false, usableForHandoff: false }),
    ).toBe(false);
    expect(
      resultsReviewAvailable({ usable: true, usableForHandoff: false }),
    ).toBe(true);
  });

  it("K/L: registration buttons target proven passed candidates only", () => {
    const completion = readUi("ResearchCompletionPanel.tsx");
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(completion).toContain(RECOMMENDED_REGISTER_LABEL);
    expect(completion).toContain(QUALIFIED_REGISTER_LABEL);
    expect(completion).not.toContain("최고 전략 등록");
    expect(completion).toContain("자격 미통과");
    expect(workbench).toContain("qualifiedFromTrials");
    expect(workbench).toContain('mode: "top"');
    expect(
      canShowRecommendedRegister({
        recommendable: 0,
        finalEligible: 0,
        hasPromoteHandler: true,
      }),
    ).toBe(false);
    expect(
      canShowQualifiedRegister({
        qualifiedCount: 1141,
        hasRegisterHandler: true,
      }),
    ).toBe(true);
    const promote = fs.readFileSync(
      path.join(ROOT, "src/lib/rextora/strategySearch/promoteFromSearch.ts"),
      "utf8",
    );
    expect(promote).toContain("only Final PASS candidates can be promoted");
  });

  it("M: customer-facing trial/runtime/pipeline/lifecycle jargon is gated or renamed", () => {
    const completion = readUi("ResearchCompletionPanel.tsx");
    const steps = readUi("LifecycleNextActionsPanel.tsx");
    expect(completion).not.toContain("합격 trial");
    expect(completion).not.toContain("라이프사이클 진행");
    expect(steps).not.toContain("합격 trial");
    expect(steps).not.toContain("라이프사이클");
    expect(readUi("StrategySearchWorkbench.tsx")).not.toContain(
      "실행 파이프라인 · 런타임 세부",
    );
  });

  it("N: ranking/recommendation semantics stay unchanged", () => {
    expect(typeof applyGroupChampA).toBe("function");
    const identity = fs.readFileSync(
      path.join(
        ROOT,
        "src/lib/rextora/strategySearch/researchEvaluationIdentity.ts",
      ),
      "utf8",
    );
    expect(identity).toContain("export function applyGroupChampA");
    const authority = fs.readFileSync(
      path.join(
        ROOT,
        "src/lib/rextora/strategySearch/researchRankingAuthorityContract.ts",
      ),
      "utf8",
    );
    expect(authority).toContain("bestPassedCandidate");
  });

  it("O: mobile action area wraps without horizontal overflow", () => {
    const css = fs.readFileSync(
      path.join(ROOT, "components", "rextora", "v3", "strategy-search.css"),
      "utf8",
    );
    expect(css).toContain(".ss-completion-actions");
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(
      ".v3-strategy-search .ss-completion-actions .ss-btn-primary",
    );
  });
});
