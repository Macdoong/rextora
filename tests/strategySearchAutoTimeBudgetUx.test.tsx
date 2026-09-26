/** @vitest-environment jsdom */
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { DurationPresetId } from "../components/rextora/strategySearch/formDefaults";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import {
  automaticAnalysisSummaryLine,
  GuidedAutomaticTimeBudget,
} from "../components/rextora/strategySearch/guided/GuidedAutomaticTimeBudget";
import { GuidedDisclosure } from "../components/rextora/strategySearch/guided/GuidedDisclosure";
import { GuidedApproachEssentials } from "../components/rextora/strategySearch/guided/GuidedApproachEssentials";
import { resolveVisualBuilderPanels } from "../components/rextora/strategySearch/visual/StrategySearchVisualBuilder";

describe("Strategy Search automatic time-budget UX", () => {
  afterEach(() => cleanup());

  it("renders one analysis-condition summary in default automatic Step 2", () => {
    const form = createDefaultOperatorFormState();
    render(
      <GuidedAutomaticTimeBudget
        symbol={form.symbol}
        timeframe={form.timeframe}
        periodPreset={form.periodPreset}
        durationPreset={form.durationPreset}
        maxRuntimeMinutesOverride={form.maxRuntimeMinutesOverride}
        onDurationPreset={() => {}}
        onMaxRuntime={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-guided-auto-time-budget")).toBeTruthy();
    expect(screen.getByText("분석 조건")).toBeTruthy();
    expect(screen.getAllByText(/BTCUSDT/).length).toBe(1);
    expect(screen.queryByTestId("ss-auto-time-budget-summary")).toBeNull();
    expect(screen.queryByText("자동 탐색 설정")).toBeNull();
  });

  it("shows Step 1 market values in the single analysis summary", () => {
    const form = createDefaultOperatorFormState();
    form.symbol = "ETHUSDT";
    form.timeframe = "5m";
    form.periodPreset = "long";
    const line = automaticAnalysisSummaryLine(form);
    render(
      <GuidedAutomaticTimeBudget
        symbol={form.symbol}
        timeframe={form.timeframe}
        periodPreset={form.periodPreset}
        durationPreset={form.durationPreset}
        maxRuntimeMinutesOverride={form.maxRuntimeMinutesOverride}
        onDurationPreset={() => {}}
        onMaxRuntime={() => {}}
      />,
    );
    const summary = screen.getByTestId("ss-auto-analysis-summary-compact");
    expect(summary.textContent).toContain(line);
    expect(summary.textContent).toContain("분석 조건");
  });

  it("shows duration selector and hides custom minutes for presets", () => {
    render(
      <GuidedAutomaticTimeBudget
        symbol="BTCUSDT"
        timeframe="15m"
        periodPreset="standard"
        durationPreset="180"
        maxRuntimeMinutesOverride="180"
        onDurationPreset={() => {}}
        onMaxRuntime={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-duration")).toBeTruthy();
    expect(screen.queryByTestId("ss-max-runtime-primary")).toBeNull();
    expect(screen.queryByTestId("ss-runtime-preset-note")).toBeNull();
  });

  it("shows custom minute input only when durationPreset is custom", () => {
    render(
      <GuidedAutomaticTimeBudget
        symbol="BTCUSDT"
        timeframe="15m"
        periodPreset="standard"
        durationPreset="custom"
        maxRuntimeMinutesOverride="20"
        onDurationPreset={() => {}}
        onMaxRuntime={() => {}}
      />,
    );
    expect(screen.getByTestId("ss-max-runtime-primary")).toBeTruthy();
  });

  it("updates duration preset through the existing control wiring", () => {
    function Harness() {
      const [preset, setPreset] = useState<DurationPresetId>("180");
      const [minutes, setMinutes] = useState("180");
      return (
        <GuidedAutomaticTimeBudget
          symbol="BTCUSDT"
          timeframe="15m"
          periodPreset="standard"
          durationPreset={preset}
          maxRuntimeMinutesOverride={minutes}
          onDurationPreset={(next) => {
            setPreset(next);
            if (next === "60") setMinutes("60");
          }}
          onMaxRuntime={setMinutes}
        />
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByTestId("ss-duration"), {
      target: { value: "60" },
    });
    expect(
      (screen.getByTestId("ss-duration") as HTMLSelectElement).value,
    ).toBe("60");
    expect(screen.queryByTestId("ss-max-runtime-primary")).toBeNull();
  });

  it("renders time-budget objective guidance copy", () => {
    render(
      <GuidedAutomaticTimeBudget
        symbol="BTCUSDT"
        timeframe="15m"
        periodPreset="standard"
        durationPreset="180"
        maxRuntimeMinutesOverride="180"
        onDurationPreset={() => {}}
        onMaxRuntime={() => {}}
      />,
    );
    expect(screen.getByText("시간 기준 자동 탐색")).toBeTruthy();
    expect(
      screen.getByText("정해진 시간 동안 여러 후보를 탐색하고 비교합니다."),
    ).toBeTruthy();
    expect(screen.getByTestId("ss-auto-time-guidance").textContent).toContain(
      "목표 조건을 충족한 후보가 생겨도 설정한 탐색 시간까지 탐색합니다.",
    );
  });

  it("renders compact Rextora automatic configuration notice", () => {
    render(
      <GuidedAutomaticTimeBudget
        symbol="BTCUSDT"
        timeframe="15m"
        periodPreset="standard"
        durationPreset="180"
        maxRuntimeMinutesOverride="180"
        onDurationPreset={() => {}}
        onMaxRuntime={() => {}}
      />,
    );
    const notice = screen.getByTestId("ss-auto-config-notice");
    expect(notice.textContent).toContain("Rextora 자동 설정");
    expect(notice.textContent).toContain("전략 조합 · 탐색 범위 · 파라미터");
  });

  it("keeps automatic create payload semantics", () => {
    const body = operatorFormToCreateBody(createDefaultOperatorFormState());
    expect(body.operatorPlan.patternSelectionMode).toBe("automatic");
    expect(body.operatorPlan.selectedSpaceIds).toBeNull();
    expect(body.operatorPlan.stopWhenQualifiedTarget).toBe(false);
  });

  it("keeps direct-mode essentials with depth and duration together", () => {
    const form = createDefaultOperatorFormState();
    render(
      <GuidedApproachEssentials
        layout="full"
        depthProfile={form.depthProfile}
        depthHint="hint"
        durationPreset={form.durationPreset}
        maxRuntimeMinutesOverride={form.maxRuntimeMinutesOverride}
        onDepth={() => {}}
        onDurationPreset={() => {}}
        onMaxRuntime={() => {}}
      />,
    );
    expect(screen.getByText("탐색 깊이 · 시간")).toBeTruthy();
    expect(screen.getByTestId("ss-depth")).toBeTruthy();
    expect(screen.getByTestId("ss-duration")).toBeTruthy();
    expect(screen.getByTestId("ss-runtime-preset-note")).toBeTruthy();
  });

  it("keeps advanced collapsed by default and preserves values on toggle", () => {
    function Harness() {
      const form = createDefaultOperatorFormState();
      return (
        <>
          <GuidedAutomaticTimeBudget
            symbol={form.symbol}
            timeframe={form.timeframe}
            periodPreset={form.periodPreset}
            durationPreset="360"
            maxRuntimeMinutesOverride="360"
            onDurationPreset={() => {}}
            onMaxRuntime={() => {}}
          />
          <GuidedDisclosure title="고급 설정" testId="ss-guided-step2-deep">
            <GuidedApproachEssentials
              layout="depthOnly"
              depthProfile={form.depthProfile}
              depthHint="hint"
              durationPreset="360"
              maxRuntimeMinutesOverride="360"
              onDepth={() => {}}
              onDurationPreset={() => {}}
              onMaxRuntime={() => {}}
            />
          </GuidedDisclosure>
        </>
      );
    }
    render(<Harness />);
    const details = screen.getByTestId("ss-guided-step2-deep");
    expect(details.hasAttribute("open")).toBe(false);
    fireEvent.click(details.querySelector("summary")!);
    expect(screen.getByTestId("ss-depth")).toBeTruthy();
    const advancedBody = details.querySelector(".ss-guided-disclosure__body");
    expect(
      within(advancedBody as HTMLElement).queryByTestId("ss-duration"),
    ).toBeNull();
    fireEvent.click(details.querySelector("summary")!);
    expect(
      (screen.getByTestId("ss-duration") as HTMLSelectElement).value,
    ).toBe("360");
  });

  it("hides mode outcome panel when automatic time-budget panels request it", () => {
    const panels = resolveVisualBuilderPanels({
      mode: true,
      modeOutcome: false,
    });
    expect(panels.modeOutcome).toBe(false);
  });
});
