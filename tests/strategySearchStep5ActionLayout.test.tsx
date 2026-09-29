/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "@/components/rextora/strategySearch/formDefaults";
import { JobCreateForm } from "@/components/rextora/strategySearch/JobCreateForm";

function goToStep5() {
  for (let i = 0; i < 4; i += 1) {
    fireEvent.click(screen.getByTestId("ss-guided-next"));
  }
}

describe("Step 5 final action layout", () => {
  afterEach(() => cleanup());

  it("A/B/C: one previous and one submit, both inside launch panel actions", () => {
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
    goToStep5();
    expect(screen.queryByTestId("ss-guided-footer")).toBeNull();
    expect(screen.getAllByTestId("ss-guided-prev")).toHaveLength(1);
    expect(screen.getAllByTestId("ss-create-submit")).toHaveLength(1);
    const panel = screen.getByTestId("ss-launch-panel");
    const actions = within(panel).getByTestId("ss-launch-panel-actions");
    expect(within(actions).getByTestId("ss-guided-prev")).toBeTruthy();
    expect(within(actions).getByTestId("ss-create-submit")).toBeTruthy();
  });

  it("D/E: reuses goPrevious and submit handler", () => {
    const onSubmit = vi.fn();
    function Harness() {
      const [form, setForm] = useState(createDefaultOperatorFormState());
      return (
        <JobCreateForm
          form={form}
          errors={[]}
          submitting={false}
          onChange={setForm}
          onSubmit={onSubmit}
        />
      );
    }
    render(<Harness />);
    goToStep5();
    fireEvent.click(screen.getByTestId("ss-guided-prev"));
    expect(screen.getByTestId("ss-guided-step-heading").textContent).toMatch(
      /검증/,
    );
    fireEvent.click(screen.getByTestId("ss-guided-next"));
    fireEvent.click(screen.getByTestId("ss-create-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("F: Steps 1–4 keep guided footer with next (and previous when applicable)", () => {
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
    expect(screen.getByTestId("ss-guided-footer")).toBeTruthy();
    expect(screen.getByTestId("ss-guided-next")).toBeTruthy();
    expect(screen.queryByTestId("ss-guided-prev")).toBeNull();
    fireEvent.click(screen.getByTestId("ss-guided-next"));
    expect(screen.getByTestId("ss-guided-footer")).toBeTruthy();
    expect(screen.getAllByTestId("ss-guided-prev")).toHaveLength(1);
    expect(screen.getByTestId("ss-guided-next")).toBeTruthy();
    expect(screen.queryByTestId("ss-launch-panel-actions")).toBeNull();
  });

  it("I/J: request body unchanged; submit lock remains in workbench", () => {
    const form = createDefaultOperatorFormState();
    expect(operatorFormToCreateBody(form).timeframe).toBe("15m");
    const workbench = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(workbench).toContain("tryAcquireSubmitLock");
  });

  it("G: mobile launch actions use flex ratio without overflow class regression", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.ss-launch-panel-actions__back[\s\S]*flex:\s*3 1 0/,
    );
    expect(css).toMatch(
      /\.ss-launch-panel-actions__submit[\s\S]*flex:\s*7 1 0/,
    );
    expect(css).toMatch(/ss-launch-panel-actions[\s\S]*max-width:\s*100%/);
  });
});
