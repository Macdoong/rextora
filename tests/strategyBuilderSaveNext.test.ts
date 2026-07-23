import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  runSaveAndNext,
  shouldConfirmUnsavedNext,
  canShowSaveActions,
  getNavButtonMode,
  getStepChipState,
  SKIP_SAVE_CONFIRM_MESSAGE,
} from "../components/rextora/strategy/builder/saveAndNext";

describe("saveAndNext workflow", () => {
  it("1-2. persists then advances exactly once", async () => {
    let step = 2;
    const persist = vi.fn(async () => true);
    const advance = vi.fn(() => {
      step += 1;
    });
    const result = await runSaveAndNext({
      isLocked: false,
      saving: false,
      validate: () => null,
      persist,
      advance,
    });
    expect(result.result).toBe("advanced");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledTimes(1);
    expect(step).toBe(3);
  });

  it("3. does not advance before persist resolves", async () => {
    const order: string[] = [];
    let resolvePersist!: (v: boolean) => void;
    const persist = () =>
      new Promise<boolean>((resolve) => {
        order.push("persist_started");
        resolvePersist = (v) => {
          order.push("persist_done");
          resolve(v);
        };
      });
    const advance = () => {
      order.push("advance");
    };
    const pending = runSaveAndNext({
      isLocked: false,
      saving: false,
      validate: () => null,
      persist,
      advance,
    });
    expect(order).toEqual(["persist_started"]);
    resolvePersist(true);
    await pending;
    expect(order).toEqual(["persist_started", "persist_done", "advance"]);
  });

  it("4. does not advance on validation failure", async () => {
    const persist = vi.fn(async () => true);
    const advance = vi.fn();
    const result = await runSaveAndNext({
      isLocked: false,
      saving: false,
      validate: () => "전략 이름을 입력하세요.",
      persist,
      advance,
    });
    expect(result.result).toBe("validation");
    expect(persist).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });

  it("5-6. does not advance on API failure", async () => {
    const persist = vi.fn(async () => false);
    const advance = vi.fn();
    const result = await runSaveAndNext({
      isLocked: false,
      saving: false,
      validate: () => null,
      persist,
      advance,
    });
    expect(result.result).toBe("persist_failed");
    expect(advance).not.toHaveBeenCalled();
  });

  it("7-8. busy/locked guards", async () => {
    const persist = vi.fn(async () => true);
    const advance = vi.fn();
    expect(
      (
        await runSaveAndNext({
          isLocked: true,
          saving: false,
          validate: () => null,
          persist,
          advance,
        })
      ).result,
    ).toBe("locked");
    expect(
      (
        await runSaveAndNext({
          isLocked: false,
          saving: true,
          validate: () => null,
          persist,
          advance,
        })
      ).result,
    ).toBe("busy");
    expect(persist).not.toHaveBeenCalled();
  });

  it("unsaved banner + nav mode: dirty shows save and skip", () => {
    expect(getNavButtonMode(true)).toBe("dirty");
    expect(getNavButtonMode(false)).toBe("clean");
    expect(shouldConfirmUnsavedNext(true)).toBe(true);
    expect(shouldConfirmUnsavedNext(false)).toBe(false);
  });

  it("save actions visible on step 0 when unlocked (name/timeframe edits)", () => {
    expect(canShowSaveActions(0, false)).toBe(true);
    expect(canShowSaveActions(5, false)).toBe(true);
    expect(canShowSaveActions(6, false)).toBe(false);
    expect(canShowSaveActions(0, true)).toBe(false);
  });

  it("step chip states: completed / current / unsaved / upcoming", () => {
    const completed = new Set([0]);
    expect(
      getStepChipState({
        index: 0,
        currentStep: 1,
        dirty: false,
        completedSteps: completed,
      }),
    ).toBe("completed");
    expect(
      getStepChipState({
        index: 1,
        currentStep: 1,
        dirty: false,
        completedSteps: completed,
      }),
    ).toBe("current");
    expect(
      getStepChipState({
        index: 1,
        currentStep: 1,
        dirty: true,
        completedSteps: completed,
      }),
    ).toBe("unsaved");
    expect(
      getStepChipState({
        index: 2,
        currentStep: 1,
        dirty: false,
        completedSteps: completed,
      }),
    ).toBe("upcoming");
  });

  it("confirm copy and builder wiring for step-0 save", () => {
    expect(SKIP_SAVE_CONFIRM_MESSAGE).toContain("저장되지 않습니다");
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategy/builder/StrategyBuilderPanel.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("strategy-unsaved-banner");
    expect(src).toContain("strategy-save");
    expect(src).toContain("strategy-next-skip");
    expect(src).toContain("strategy-skip-confirm");
    expect(src).toContain("strategy-skip-cancel");
    expect(src).toContain("strategy-skip-continue");
    expect(src).toContain("showSaveActions && navMode === \"dirty\"");
    expect(src).toContain("canShowSaveActions");
    expect(src).toContain("tone=\"success\"");
    expect(src).toContain("tone=\"muted\"");
    expect(src).toContain("data-state={state}");
  });
});
