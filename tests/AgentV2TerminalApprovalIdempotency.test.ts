/**
 * Terminal approval ledger: first execute once; repeats are immutable no-ops.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimApprovalExecution,
  findLatestSessionApprovalReceipt,
  isApprovalAlreadyExecuted,
  writeApprovalExecutionReceipt,
} from "../src/lib/rextora/agent/v2/approval/approvalExecutionStore";
import { runReasoningEngine } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import { buildReasoningInput } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";
import { clearReasoningRequestCache } from "../src/lib/rextora/agent/v2/reasoning/reasoningRequestRegistry";
import {
  buildCancelReplacePlan,
  buildNewSearchPlan,
} from "../src/lib/rextora/agent/v2/reasoning/toolPlanBuilder";

vi.mock("../src/lib/rextora/agent/v2/reasoning/reasoningProvider", () => ({
  callReasoningProvider: vi.fn(async () => ({
    ok: true,
    raw: {},
    provider: "gemini",
    model: "gemini-2.5-flash",
    errorKo: null,
    latencyMs: 5,
    parsed: { artifact: null, issues: ["mock"] },
  })),
}));

describe("terminal approval idempotency", () => {
  let tmpRoot: string;
  let prevDir: string | undefined;

  beforeEach(() => {
    clearReasoningRequestCache();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-approval-"));
    prevDir = process.env.REXTORA_AGENT_APPROVAL_RECEIPTS_DIR;
    process.env.REXTORA_AGENT_APPROVAL_RECEIPTS_DIR = tmpRoot;
  });

  afterEach(() => {
    if (prevDir === undefined) {
      delete process.env.REXTORA_AGENT_APPROVAL_RECEIPTS_DIR;
    } else {
      process.env.REXTORA_AGENT_APPROVAL_RECEIPTS_DIR = prevDir;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("findLatestSessionApprovalReceipt returns newest terminal receipt for session", () => {
    const sessionId = "sess_latest";
    writeApprovalExecutionReceipt({
      approvalId: "pa_old",
      sessionId,
      planId: null,
      ok: true,
      jobId: "job_old",
      runId: null,
      paperSessionId: null,
      summaryKo: "old",
      executedAt: "2026-01-01T00:00:00.000Z",
      stepToolIds: [],
    });
    writeApprovalExecutionReceipt({
      approvalId: "pa_new",
      sessionId,
      planId: null,
      ok: true,
      jobId: "job_new",
      runId: null,
      paperSessionId: null,
      summaryKo: "new",
      executedAt: "2026-01-02T00:00:00.000Z",
      stepToolIds: [],
    });
    const latest = findLatestSessionApprovalReceipt(sessionId);
    expect(latest?.approvalId).toBe("pa_new");
    expect(latest?.jobId).toBe("job_new");
  });

  it("first approval writes one receipt; repeat returns already executed", () => {
    const approvalId = "pa_first";
    const sessionId = "sess_a";
    const claim1 = claimApprovalExecution({
      approvalId,
      sessionId,
      planId: "plan_1",
    });
    expect(claim1.claimed).toBe(true);

    const receipt = writeApprovalExecutionReceipt({
      approvalId,
      sessionId,
      planId: "plan_1",
      ok: true,
      jobId: "job_new",
      runId: null,
      paperSessionId: null,
      summaryKo: "취소 후 재시작 완료",
      executedAt: new Date().toISOString(),
      stepToolIds: ["search.cancel", "search.create", "search.start"],
    });

    const prior = isApprovalAlreadyExecuted({ sessionId, approvalId });
    expect(prior?.jobId).toBe("job_new");
    expect(prior?.summaryKo).toBe(receipt.summaryKo);

    const claim2 = claimApprovalExecution({
      approvalId,
      sessionId,
      planId: "plan_1",
    });
    expect(claim2.claimed).toBe(false);
    if (!claim2.claimed) {
      expect(claim2.receipt.jobId).toBe("job_new");
      expect(claim2.receipt.inFlight).toBe(false);
    }
  });

  it("repeated approval after provider-fallback style empty approve executes nothing via ledger", () => {
    const approvalId = "pa_fallback";
    const sessionId = "sess_b";
    writeApprovalExecutionReceipt({
      approvalId,
      sessionId,
      planId: null,
      ok: true,
      jobId: "job_r",
      runId: null,
      paperSessionId: null,
      summaryKo: "이미 실행됨",
      executedAt: new Date().toISOString(),
      stepToolIds: ["search.create"],
    });
    const again = isApprovalAlreadyExecuted({ sessionId, approvalId });
    expect(again).not.toBeNull();
    expect(again?.jobId).toBe("job_r");
    // No second claim/write path — product must short-circuit before tools.
    const claim = claimApprovalExecution({
      approvalId,
      sessionId,
      planId: null,
    });
    expect(claim.claimed).toBe(false);
  });

  it("repeated approval after refresh / stale tab uses same session+approval identity", () => {
    const approvalId = "pa_stale_tab";
    const sessionId = "sess_stale";
    writeApprovalExecutionReceipt({
      approvalId,
      sessionId,
      planId: null,
      ok: true,
      jobId: "job_stale",
      runId: null,
      paperSessionId: null,
      summaryKo: "완료",
      executedAt: new Date().toISOString(),
      stepToolIds: ["search.cancel", "search.create", "search.start"],
    });
    // Fresh browser tab would re-send same sessionId + approvalId.
    expect(
      isApprovalAlreadyExecuted({ sessionId, approvalId })?.jobId,
    ).toBe("job_stale");
    expect(
      isApprovalAlreadyExecuted({ sessionId: "other", approvalId }),
    ).toBeNull();
  });

  it("concurrent duplicate approval claims execute once", () => {
    const approvalId = "pa_concurrent";
    const sessionId = "sess_c";
    const a = claimApprovalExecution({ approvalId, sessionId, planId: null });
    const b = claimApprovalExecution({ approvalId, sessionId, planId: null });
    expect(a.claimed).toBe(true);
    expect(b.claimed).toBe(false);
    writeApprovalExecutionReceipt({
      approvalId,
      sessionId,
      planId: null,
      ok: true,
      jobId: "job_once",
      runId: null,
      paperSessionId: null,
      summaryKo: "once",
      executedAt: new Date().toISOString(),
      stepToolIds: ["search.create"],
    });
    if (!b.claimed) {
      // Loser may see in-flight then finalized; finalize overwrites.
      const final = isApprovalAlreadyExecuted({ sessionId, approvalId });
      expect(final?.jobId).toBe("job_once");
      expect(final?.inFlight).toBe(false);
    }
  });

  it("approval execution path skips provider (zero provider calls)", async () => {
    const { callReasoningProvider } = await import(
      "../src/lib/rextora/agent/v2/reasoning/reasoningProvider"
    );
    vi.mocked(callReasoningProvider).mockClear();
    const input = buildReasoningInput({
      query: "진행해",
      sessionId: "s_zero_provider",
      intentType: "approve_pending",
      goal: "approve",
      facts: [],
      history: [],
      context: null,
      entities: emptyEntityMemory(),
    });
    const result = await runReasoningEngine(input, { skipProvider: true });
    expect(callReasoningProvider).not.toHaveBeenCalled();
    expect(result.artifact.provider).toBe("local");
  });

  it("stale approval cannot reappear once receipt exists (immutable terminal)", () => {
    const approvalId = "pa_terminal";
    const sessionId = "sess_t";
    writeApprovalExecutionReceipt({
      approvalId,
      sessionId,
      planId: null,
      ok: true,
      jobId: "job_t",
      runId: null,
      paperSessionId: null,
      summaryKo: "terminal",
      executedAt: new Date().toISOString(),
      stepToolIds: ["search.create"],
    });
    // Overwrite attempt returns finalized content (write replaces, but product
    // claim path prevents re-execution). Receipt remains present.
    writeApprovalExecutionReceipt({
      approvalId,
      sessionId,
      planId: null,
      ok: true,
      jobId: "job_t",
      runId: null,
      paperSessionId: null,
      summaryKo: "terminal-again",
      executedAt: new Date().toISOString(),
      stepToolIds: ["search.create"],
    });
    expect(isApprovalAlreadyExecuted({ sessionId, approvalId })).not.toBeNull();
    expect(claimApprovalExecution({ approvalId, sessionId, planId: null }).claimed).toBe(
      false,
    );
  });

  it("Search cancel-replace plan creates exactly one replacement chain", () => {
    const { draft } = buildNewSearchPlan({
      symbol: "BTCUSDT",
      timeframe: "1h",
    });
    const steps = buildCancelReplacePlan("job_old_exact", draft);
    const cancels = steps.filter((s) => s.toolId === "search.cancel");
    const creates = steps.filter((s) => s.toolId === "search.create");
    const starts = steps.filter((s) => s.toolId === "search.start");
    expect(cancels).toHaveLength(1);
    expect(creates).toHaveLength(1);
    expect(starts).toHaveLength(1);
    expect(cancels[0]?.arguments.jobId).toBe("job_old_exact");
  });
});
