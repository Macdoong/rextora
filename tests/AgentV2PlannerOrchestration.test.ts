import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approvePlanV2,
  comparePlans,
  createPlanV2,
  modifyPlanV2,
  supersedePlanV2,
} from "../src/lib/rextora/agent/v2/planner";
import {
  cancelReplaceSteps,
  createTaskFromPlan,
  exactEngineControlStep,
  reconcileTaskState,
} from "../src/lib/rextora/agent/v2/orchestration";
import { readTaskLedger } from "../src/lib/rextora/agent/v2/tasks";
import {
  approvalMatchesPlan,
  type PlanApproval,
} from "../src/lib/rextora/agent/v2/approval/approvalState";

const sessionId = "agent_plannerv2test";
let root = "";

function searchSteps(timeframe = "15m") {
  return [
    {
      stepId: "create",
      toolId: "search.create",
      arguments: { symbol: "BTCUSDT", timeframe },
      dependsOn: [],
      requiresApproval: true,
    },
    {
      stepId: "start",
      toolId: "search.start",
      arguments: { jobId: "$create.jobId" },
      dependsOn: ["create"],
      requiresApproval: true,
    },
  ];
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-planner-v2-"));
  process.env.REXTORA_AGENT_TASKS_DIR = root;
});

afterEach(() => {
  delete process.env.REXTORA_AGENT_TASKS_DIR;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Agent V2 Planner and orchestration", () => {
  it("creates, meaningfully modifies, diffs, and compares versioned plans", () => {
    const original = createPlanV2({
      sessionId,
      goal: "새 탐색",
      parameters: { timeframe: "15m", patterns: ["order_block", "fvg"] },
      steps: searchSteps(),
    });
    const { plan: modified, diff } = modifyPlanV2(original, {
      parameters: { timeframe: "1h", patterns: ["trendline", "support_resistance"] },
      steps: searchSteps("1h"),
    });
    expect(original.schemaVersion).toBe(2);
    expect(diff.meaningfulChanged).toBe(true);
    expect(modified.meaningfulHash).not.toBe(original.meaningfulHash);
    expect(comparePlans(original, modified).entries.length).toBeGreaterThan(0);
  });

  it("keeps the meaningful hash and approval for display-only changes", () => {
    const approved = approvePlanV2(createPlanV2({
      sessionId,
      goal: "새 탐색",
      parameters: { timeframe: "15m" },
      display: { title: "초안" },
      steps: searchSteps(),
    }), "approval_keep");
    const { plan, diff } = modifyPlanV2(approved, { display: { title: "새 제목" } });
    expect(plan.meaningfulHash).toBe(approved.meaningfulHash);
    expect(plan.approvalId).toBe("approval_keep");
    expect(diff.approvalInvalidated).toBe(false);
  });

  it("invalidates approval after a meaningful change and supersedes the old approval", () => {
    const approved = approvePlanV2(createPlanV2({
      sessionId,
      goal: "새 탐색",
      parameters: { timeframe: "15m" },
      steps: searchSteps(),
    }), "approval_old");
    const { plan: changed, diff } = modifyPlanV2(approved, {
      parameters: { timeframe: "1h" },
      steps: searchSteps("1h"),
    });
    expect(diff.approvalInvalidated).toBe(true);
    expect(changed.approvalId).toBeNull();
    const pair = supersedePlanV2(approved, changed);
    expect(pair.previous.status).toBe("superseded");
    expect(pair.previous.approvalId).toBeNull();
    expect(pair.replacement.supersedesPlanId).toBe(approved.planId);
  });

  it("matches approvals only to the exact plan hash", () => {
    const plan = createPlanV2({ sessionId, goal: "연구", steps: searchSteps() });
    const approval: PlanApproval = {
      approvalId: "approval_exact",
      planId: plan.planId,
      meaningfulHash: plan.meaningfulHash,
      status: "active",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    expect(approvalMatchesPlan(approval, plan)).toBe(true);
    expect(approvalMatchesPlan({ ...approval, meaningfulHash: "stale" }, plan)).toBe(false);
  });

  it("targets exact jobs and orders cancel before replacement creation and start", () => {
    expect(exactEngineControlStep({ action: "pause", jobId: "job_exact" }).arguments)
      .toEqual({ jobId: "job_exact" });
    const ordered = cancelReplaceSteps("job_old", searchSteps());
    expect(ordered.map((step) => step.toolId)).toEqual([
      "search.cancel",
      "search.create",
      "search.start",
    ]);
    expect(ordered[1].dependsOn).toContain("cancel_search");
    expect(ordered[2].dependsOn).toContain("cancel_search");
  });

  it("provides idempotent replay and blocks a second active write task", () => {
    const plan = approvePlanV2(createPlanV2({
      sessionId,
      goal: "새 탐색",
      steps: searchSteps(),
    }));
    const first = createTaskFromPlan(plan, "idem-1");
    const replay = createTaskFromPlan(plan, "idem-1", first.ledger);
    expect(replay.replayed).toBe(true);
    expect(replay.task.taskId).toBe(first.task.taskId);
    expect(() => createTaskFromPlan(plan, "idem-2", first.ledger))
      .toThrow("ACTIVE_WRITE_TASK_EXISTS");
  });

  it("rejects a stale multi-tab ledger revision", async () => {
    const plan = approvePlanV2(createPlanV2({
      sessionId,
      goal: "새 탐색",
      steps: searchSteps(),
    }));
    const tabA = readTaskLedger(sessionId);
    const tabB = readTaskLedger(sessionId);
    createTaskFromPlan(plan, "tab-a", tabA);
    expect(() => createTaskFromPlan(plan, "tab-b", tabB)).toThrow("STALE_TASK_LEDGER");
  });

  it("reconciles persisted engine state after restart without replacing it", () => {
    const plan = approvePlanV2(createPlanV2({
      sessionId,
      goal: "새 탐색",
      steps: searchSteps(),
    }));
    const created = createTaskFromPlan(plan, "restart");
    const reloaded = readTaskLedger(sessionId).tasks[0];
    expect(reloaded.taskId).toBe(created.task.taskId);
    expect(reconcileTaskState({ task: reloaded, searchStatus: "running" }).state)
      .toBe("monitoring");
    expect(reconcileTaskState({ task: reloaded, searchStatus: "completed" }).state)
      .toBe("analyzing");
  });
});

