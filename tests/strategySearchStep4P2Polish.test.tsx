/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
  type StrategySearchOperatorFormState,
} from "@/components/rextora/strategySearch/formDefaults";
import { JobCreateForm } from "@/components/rextora/strategySearch/JobCreateForm";
import {
  STEP4_JITTER_RECHECK_BRIEF_KO,
} from "@/components/rextora/strategySearch/guided/step4ValidationPresentation";

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

describe("Strategy Search Step 4 P2 polish", () => {
  afterEach(() => cleanup());

  it("parameter re-check brief copy and jitter state toggle", () => {
    const form = createDefaultOperatorFormState();
    form.autoSearchObjective = "qualified_target";
    form.jitterEnabled = false;
    render(<Step4Harness form={form} />);
    goToStep4();
    expect(screen.getByTestId("ss-jitter-recheck-brief").textContent).toBe(
      STEP4_JITTER_RECHECK_BRIEF_KO,
    );
    fireEvent.click(screen.getByTestId("ss-jitter-enabled"));
    expect(
      (screen.getByTestId("ss-jitter-enabled") as HTMLInputElement).checked,
    ).toBe(true);
    const body = operatorFormToCreateBody({
      ...form,
      jitterEnabled: true,
    });
    expect(body.jitterConfig.enabled).toBe(true);
  });

  it("leverage min/max share mobile row and visual stays read-only", () => {
    const form = createDefaultOperatorFormState();
    form.leverageMode = "range";
    render(<Step4Harness form={form} />);
    goToStep4();
    expect(screen.getByTestId("ss-step4-leverage-minmax-row")).toBeTruthy();
    expect(screen.getByTestId("ss-leverage-min")).toBeTruthy();
    expect(screen.getByTestId("ss-leverage-max")).toBeTruthy();
    expect(screen.getByTestId("ss-step4-leverage-visual")).toBeTruthy();
    expect(screen.getByTestId("ss-leverage-warning")).toBeTruthy();
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.leverageMin).toBe(Number(form.leverageMin));
    expect(body.operatorPlan?.leverageMax).toBe(Number(form.leverageMax));
    expect(document.querySelector(".ss-step4-leverage-visual input")).toBeNull();
    const scale = screen.getByTestId("ss-step4-leverage-visual-scale");
    expect(scale.textContent).toContain("1x");
    expect(scale.textContent).toContain("20x");
    const css = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toContain(".ss-step4-leverage-visual__scale");
    expect(css).not.toMatch(/ss-step4-leverage-visual__tick[\s\S]*top:\s*12px/);
  });

  it("leverage DOM order is mode, minmax row, visual stack", () => {
    const form = createDefaultOperatorFormState();
    form.leverageMode = "automatic";
    render(<Step4Harness form={form} />);
    goToStep4();
    const risk = document.getElementById("ss-section-risk");
    expect(risk).toBeTruthy();
    const html = risk!.innerHTML;
    const modeIdx = html.indexOf("ss-leverage-mode");
    const rowIdx = html.indexOf("ss-step4-leverage-minmax-row");
    const visualIdx = html.indexOf("ss-step4-leverage-visual");
    const warnIdx = html.indexOf("ss-leverage-warning");
    expect(modeIdx).toBeGreaterThan(-1);
    expect(rowIdx).toBeGreaterThan(modeIdx);
    expect(visualIdx).toBeGreaterThan(rowIdx);
    expect(warnIdx).toBeGreaterThan(visualIdx);
  });

  it("CSS keeps minmax row grid and reduced-motion for step4", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toContain(".ss-step4-leverage-minmax-row");
    expect(css).toMatch(
      /\.ss-step4-leverage-minmax-row[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(css).toMatch(
      /prefers-reduced-motion[\s\S]*\.ss-step4-enter[\s\S]*animation:\s*none/,
    );
  });
});
