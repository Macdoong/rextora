import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clearDryRunEmergencyStop,
  emergencyStopDryRun,
  getDryRunOrderByKey,
  reconcileDryRun,
  submitDryRunOrder,
} from "../src/lib/rextora/live/liveDryRunEngine";

describe("liveDryRunEngine", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-live-dry-"));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("is idempotent on executionKey and never calls exchange", () => {
    const opts = { rootDir };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch must not be called in dry-run");
    });

    const first = submitDryRunOrder(
      {
        executionKey: "exec_key_1",
        strategyId: "custom_abc",
        strategyHash: "hash_abc",
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.01,
      },
      opts,
    );
    expect(first.state).toBe("DRY_RUN_SUBMITTED");
    expect(first.exchangeCalled).toBe(false);
    expect(first.adapter).toBe("dry-run");

    const second = submitDryRunOrder(
      {
        executionKey: "exec_key_1",
        strategyId: "custom_abc",
        strategyHash: "hash_abc",
        symbol: "BTCUSDT",
        side: "SELL",
        quantity: 99,
      },
      opts,
    );
    expect(second.id).toBe(first.id);
    expect(second.side).toBe("BUY");
    expect(second.quantity).toBe(0.01);
    expect(fetchSpy).not.toHaveBeenCalled();

    const onDisk = getDryRunOrderByKey("exec_key_1", opts);
    expect(onDisk?.id).toBe(first.id);
  });

  it("emergency stop blocks new entries and reconcile matches local/adapter", () => {
    const opts = { rootDir };
    const session = emergencyStopDryRun({ reason: "test halt" }, opts);
    expect(session.emergencyStopped).toBe(true);

    const blocked = submitDryRunOrder(
      {
        executionKey: "exec_after_stop",
        strategyId: "custom_abc",
        strategyHash: "hash_abc",
        symbol: "ETHUSDT",
        side: "BUY",
        quantity: 0.1,
      },
      opts,
    );
    expect(blocked.state).toBe("EMERGENCY_STOPPED");
    expect(blocked.exchangeCalled).toBe(false);
    expect(blocked.blockedReason).toContain("test halt");

    const recon = reconcileDryRun(opts);
    expect(recon.matched).toBe(true);
    expect(recon.local.emergencyStopped).toBe(true);
    expect(recon.adapter.emergencyStopped).toBe(true);
    expect(recon.adapter.kind).toBe("dry-run");

    const cleared = clearDryRunEmergencyStop(opts);
    expect(cleared.emergencyStopped).toBe(false);
    const resumed = submitDryRunOrder(
      {
        executionKey: "exec_after_clear",
        strategyId: "custom_abc",
        strategyHash: "hash_abc",
        symbol: "ETHUSDT",
        side: "BUY",
        quantity: 0.1,
      },
      opts,
    );
    expect(resumed.state).toBe("DRY_RUN_SUBMITTED");
    expect(resumed.exchangeCalled).toBe(false);
  });
});
