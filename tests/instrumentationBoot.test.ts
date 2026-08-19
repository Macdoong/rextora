import { describe, expect, it } from "vitest";
import { register } from "../instrumentation";
import { recoverOrphanSearchJobs } from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import { resolveOrphanJobRecoveryForTests } from "../src/lib/rextora/strategySearch/orphanJobRecoveryLoader";

describe("instrumentation orphan recovery boot", () => {
  it("register completes without module-not-found", async () => {
    await expect(register()).resolves.toBeUndefined();
  });

  it("orphan recovery module resolves through the direct source import path", async () => {
    const mod = await resolveOrphanJobRecoveryForTests();
    expect(typeof mod.recoverOrphanSearchJobs).toBe("function");
  });

  it("orphan recovery function remains available to internal route", () => {
    expect(typeof recoverOrphanSearchJobs).toBe("function");
  });
});
