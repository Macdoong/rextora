import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  clearReasoningRequestCache,
  dedupeReasoningRun,
} from "../src/lib/rextora/agent/v2/reasoning/reasoningRequestRegistry";

describe("reasoningRequestRegistry", () => {
  beforeEach(() => {
    clearReasoningRequestCache();
  });

  it("reuses in-flight result for the same turnId", async () => {
    const run = vi.fn(async () => ({
      artifact: { reasoningId: "r1" },
      validation: { ok: true, artifact: null, issues: [], blocked: false, blockedReason: null },
      usedFallback: false,
      providerErrorKo: null,
      providerLatencyMs: 10,
    }));

    const p1 = dedupeReasoningRun({ turnId: "turn-1", run });
    const p2 = dedupeReasoningRun({ turnId: "turn-1", run });
    const [a, b] = await Promise.all([p1, p2]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("runs separately for different turnIds", async () => {
    let n = 0;
    const run = vi.fn(async () => {
      n += 1;
      return {
        artifact: { reasoningId: `r${n}` },
        validation: { ok: true, artifact: null, issues: [], blocked: false, blockedReason: null },
        usedFallback: false,
        providerErrorKo: null,
        providerLatencyMs: 10,
      };
    });

    await dedupeReasoningRun({ turnId: "turn-a", run });
    await dedupeReasoningRun({ turnId: "turn-b", run });
    expect(run).toHaveBeenCalledTimes(2);
  });
});
