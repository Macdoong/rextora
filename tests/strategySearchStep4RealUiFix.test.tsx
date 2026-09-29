/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  type StrategySearchOperatorFormState,
} from "@/components/rextora/strategySearch/formDefaults";
import { JobCreateForm } from "@/components/rextora/strategySearch/JobCreateForm";
import { GuidedSetupCompactContinuations } from "@/components/rextora/strategySearch/guided/GuidedSetupCompactContinuations";
import type { StrategySearchJobSummary } from "@/components/rextora/strategySearch/types";

const ROOT = process.cwd();
const globalsCss = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const strategySearchCss = fs.readFileSync(
  path.join(ROOT, "components/rextora/v3/strategy-search.css"),
  "utf8",
);

function automaticConfigHideBlock(css: string): string {
  const start = css.indexOf(
    '[data-testid="strategy-search-create"][data-config-level="automatic"]',
  );
  expect(start).toBeGreaterThan(-1);
  const slice = css.slice(start, start + 600);
  const open = slice.indexOf(":is(");
  const close = slice.indexOf(") {");
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);
  return slice.slice(open + 4, close);
}

function Step4Harness(props: { form: StrategySearchOperatorFormState }) {
  const [form, setForm] = useState(props.form);
  return (
    <JobCreateForm
      form={form}
      errors={[]}
      submitting={false}
      onChange={setForm}
      onSubmit={() => {}}
    />
  );
}

function goToStep4() {
  for (let i = 0; i < 3; i += 1) {
    fireEvent.click(screen.getByTestId("ss-guided-next"));
  }
}

describe("Strategy Search Step 4 real UI fix", () => {
  afterEach(() => cleanup());

  it("automatic config hide rule no longer targets Step 4 validation or risk sections", () => {
    const block = automaticConfigHideBlock(globalsCss);
    expect(block).not.toContain("#ss-section-validation");
    expect(block).not.toContain("#ss-section-risk");
    expect(block).toContain("#ss-section-patterns");
    expect(block).toContain("#ss-section-strategy-scope");
  });

  it("Step 3 automatic pattern sections remain in the automatic hide rule", () => {
    const block = automaticConfigHideBlock(globalsCss);
    expect(block).toContain("#ss-section-patterns");
    expect(block).toContain("#ss-section-data");
  });

  it("recent-work continuations reserve FAB end gutter without changing global FAB CSS", () => {
    expect(strategySearchCss).toMatch(
      /\.v3-strategy-search \.ss-guided-compact-continuations[\s\S]*padding-inline-end:\s*max\(14px,\s*var\(--rextora-fab-end-gutter\)\)/,
    );
    const fabStart = globalsCss.indexOf(".rextora-agent-fab {");
    const fabBlock = globalsCss.slice(fabStart, fabStart + 700);
    expect(fabBlock).toContain("position: fixed");
    expect(globalsCss).toMatch(/\.rextora-agent-fab[\s\S]*?right:\s*1rem/);
    expect(globalsCss).toMatch(/\.rextora-agent-fab[\s\S]*?bottom:\s*1\.25rem/);
  });

  it("automatic time-budget Step 4 renders evaluation and risk controls in DOM", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.patternConfigLevel = "automatic";
    form.autoSearchObjective = "time_budget";
    render(<Step4Harness form={form} />);
    goToStep4();
    expect(document.getElementById("ss-section-validation")).toBeTruthy();
    expect(document.getElementById("ss-section-risk")).toBeTruthy();
    expect(document.getElementById("ss-qualification")).toBeTruthy();
    expect(screen.getByTestId("ss-min-trades")).toBeTruthy();
    expect(screen.getByTestId("ss-target-return")).toBeTruthy();
    expect(screen.getByTestId("ss-jitter-enabled")).toBeTruthy();
    expect(screen.getByTestId("ss-leverage-mode")).toBeTruthy();
    expect(screen.getByTestId("ss-max-mdd")).toBeTruthy();
    expect(screen.getByTestId("ss-fee")).toBeTruthy();
  });

  it("automatic qualified-target Step 4 renders comparison profile and leverage without min-trade fields", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.patternConfigLevel = "automatic";
    form.autoSearchObjective = "qualified_target";
    render(<Step4Harness form={form} />);
    goToStep4();
    expect(screen.getByTestId("ss-comparison-profile")).toBeTruthy();
    expect(screen.getByTestId("ss-jitter-enabled")).toBeTruthy();
    expect(screen.getByTestId("ss-leverage-mode")).toBeTruthy();
    expect(screen.queryByTestId("ss-min-trades")).toBeNull();
    expect(screen.queryByTestId("ss-max-mdd")).toBeNull();
    expect(screen.getByTestId("ss-qualification-target-managed")).toBeTruthy();
  });

  it("direct manual Step 4 still renders qualification and risk controls", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = false;
    form.patternConfigLevel = "basic";
    form.autoSearchObjective = "time_budget";
    render(<Step4Harness form={form} />);
    goToStep4();
    expect(document.getElementById("ss-qualification")).toBeTruthy();
    expect(screen.getByTestId("ss-min-trades")).toBeTruthy();
    expect(screen.getByTestId("ss-leverage-mode")).toBeTruthy();
    expect(screen.getByTestId("ss-max-mdd")).toBeTruthy();
  });

  it("recent-work actions render inside continuations card", () => {
    const job = {
      id: "job_x",
      status: "completed",
      searchName: "TEST",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
    } as StrategySearchJobSummary;
    render(
      <div className="v3-strategy-search">
        <GuidedSetupCompactContinuations
          recentCompletedJob={job}
          resumableCount={2}
          onViewRecentResult={() => {}}
          onViewResumableList={() => {}}
        />
      </div>,
    );
    expect(screen.getByTestId("ss-guided-compact-view-recent-result")).toBeTruthy();
    expect(screen.getByTestId("ss-guided-compact-view-resumable-list")).toBeTruthy();
    expect(screen.getByTestId("ss-guided-compact-continuations")).toBeTruthy();
  });
});
