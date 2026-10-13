import { describe, expect, it, vi } from "vitest";
import { executeBacktestPrimaryAction } from "@/src/lib/rextora/backtest/backtestPrimaryAction";

describe("Backtest primary action", () => {
  it("returns from a saved result to Ready without posting a new run", () => {
    const returnToReady = vi.fn();
    const postBacktest = vi.fn();

    executeBacktestPrimaryAction(true, {
      returnToReady,
      runExplicitly: postBacktest,
    });

    expect(returnToReady).toHaveBeenCalledTimes(1);
    expect(postBacktest).not.toHaveBeenCalled();
  });

  it("runs exactly once only when the user explicitly starts from Ready", () => {
    const returnToReady = vi.fn();
    const postBacktest = vi.fn();

    executeBacktestPrimaryAction(false, {
      returnToReady,
      runExplicitly: postBacktest,
    });

    expect(returnToReady).not.toHaveBeenCalled();
    expect(postBacktest).toHaveBeenCalledTimes(1);
  });
});
