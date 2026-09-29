/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "@/components/rextora/strategySearch/formDefaults";
import { JobCreateForm } from "@/components/rextora/strategySearch/JobCreateForm";
import { Step5LaunchFlowMap } from "@/components/rextora/strategySearch/guided/Step5LaunchFlowMap";
import { buildStep5LaunchFlowNodes } from "@/components/rextora/strategySearch/guided/step5LaunchFlowModel";

describe("Step 5 launch flow map", () => {
  afterEach(() => cleanup());

  it("renders five nodes from actual form values without fabricated metrics", () => {
    const form = createDefaultOperatorFormState();
    form.symbol = "BTCUSDT";
    form.timeframe = "15m";
    render(
      <Step5LaunchFlowMap
        form={form}
        combinationSentence="추천 패턴을 자동으로 조합"
      />,
    );
    const flow = screen.getByTestId("ss-step5-launch-flow");
    expect(flow.querySelectorAll("[data-flow-node]")).toHaveLength(5);
    expect(flow.textContent).toContain("BTCUSDT");
    expect(flow.textContent).toContain("15분봉");
    expect(flow.textContent).not.toMatch(/승률\s*예측|성공\s*확률|PnL/i);
    expect(screen.getByTestId("ss-launch-method").textContent).toContain("시간 기준");
  });

  it("target mode labels match objective helper", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.autoSearchObjective = "qualified_target";
    const nodes = buildStep5LaunchFlowNodes(form, {
      combinationSentence: "자동 조합",
    });
    expect(nodes.find((n) => n.id === "search")?.primaryKo).toBe(
      "목표 기준 자동 탐색",
    );
    expect(nodes.find((n) => n.id === "validation")?.primaryKo).toContain(
      "목표 조건",
    );
  });

  it("merges ok validation chip into launch header; one submit", () => {
    function Harness() {
      const [form, setForm] = useState(createDefaultOperatorFormState());
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
    render(<Harness />);
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByTestId("ss-guided-next"));
    }
    expect(screen.getByTestId("ss-config-validation-summary").className).toContain(
      "sr-only",
    );
    expect(screen.getByTestId("ss-launch-ready-badge").textContent).toBe(
      "실행 가능",
    );
    expect(screen.getByTestId("ss-step5-launch-flow")).toBeTruthy();
    expect(screen.queryByText("✓ 설정 확인 완료", { selector: ":not(.sr-only)" })).toBeNull();
    expect(screen.getAllByTestId("ss-create-submit")).toHaveLength(1);
    expect(operatorFormToCreateBody(createDefaultOperatorFormState()).timeframe).toBe(
      "15m",
    );
  });

  it("CSS disables flow motion under prefers-reduced-motion", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toMatch(
      /prefers-reduced-motion[\s\S]*ss-step5-launch-flow--enter[\s\S]*animation:\s*none\s*!important/,
    );
  });
});
