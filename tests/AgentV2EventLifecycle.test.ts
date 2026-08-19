import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { approvePlanV2, createPlanV2 } from "../src/lib/rextora/agent/v2/planner";
import { createTaskFromPlan } from "../src/lib/rextora/agent/v2/orchestration";
import { readTaskLedger } from "../src/lib/rextora/agent/v2/tasks";
import { readAgentEvents } from "../src/lib/rextora/agent/v2/events";
import {
  applyAgentEvent,
  createAgentEvent,
  reconcileAuthoritativeLifecycle,
  recordToolResultLifecycle,
  recoverLifecycleFromEvents,
  startBoundedSearchLifecycleWatcher,
} from "../src/lib/rextora/agent/v2/lifecycle";
import { okResult } from "../src/lib/rextora/agent/v2/tools/toolResult";

const sessionId = "agent_eventlifecycletest";
let root = "";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-events-"));
  process.env.REXTORA_AGENT_TASKS_DIR = path.join(root, "tasks");
  process.env.REXTORA_AGENT_EVENTS_DIR = path.join(root, "events");
  process.env.REXTORA_AGENT_MEMORY_DIR = path.join(root, "memory");
});

afterEach(() => {
  delete process.env.REXTORA_AGENT_TASKS_DIR;
  delete process.env.REXTORA_AGENT_EVENTS_DIR;
  delete process.env.REXTORA_AGENT_MEMORY_DIR;
  fs.rmSync(root, { recursive: true, force: true });
});

function seedTask() {
  const plan = approvePlanV2(createPlanV2({
    sessionId,
    goal: "탐색",
    steps: [
      { stepId: "create", toolId: "search.create", arguments: {}, dependsOn: [], requiresApproval: true },
      { stepId: "start", toolId: "search.start", arguments: { jobId: "$create.jobId" }, dependsOn: ["create"], requiresApproval: true },
    ],
  }));
  return createTaskFromPlan(plan, "event-seed").task;
}

describe("Agent V2 persisted event lifecycle", () => {
  it("persists events and applies each event id only once", () => {
    const task = seedTask();
    const event = createAgentEvent({
      eventId: "event_exact_once",
      type: "search.started",
      sessionId,
      entityId: "search_real",
      taskId: task.taskId,
      source: "engine_store",
      payload: { status: "running" },
    });
    expect(applyAgentEvent(event).applied).toBe(true);
    expect(applyAgentEvent(event).applied).toBe(false);
    expect(readAgentEvents(sessionId)).toHaveLength(1);
    const stored = readTaskLedger(sessionId).tasks[0];
    expect(stored.state).toBe("monitoring");
    expect(stored.engineRefs.searchJobId).toBe("search_real");
  });

  it("moves completed Search from monitoring to analyzing", () => {
    const task = seedTask();
    applyAgentEvent(createAgentEvent({ type: "search.started", sessionId, entityId: "search_real", taskId: task.taskId, source: "engine_store", payload: {} }));
    applyAgentEvent(createAgentEvent({ type: "search.completed", sessionId, entityId: "search_real", taskId: task.taskId, source: "engine_store", payload: { status: "completed" } }));
    expect(readTaskLedger(sessionId).tasks[0].state).toBe("analyzing");
  });

  it("records semantic engine events from actual Tool Registry results", () => {
    seedTask();
    recordToolResultLifecycle({
      sessionId,
      stepId: "create",
      toolId: "search.create",
      result: okResult("search.create", { jobId: "search_tool" }, {
        durationMs: 1,
        approved: true,
        requiresApproval: true,
        category: "search",
        executionMode: "write",
        sessionId,
      }),
    });
    expect(readAgentEvents(sessionId).at(-1)).toMatchObject({
      type: "search.created",
      entityId: "search_tool",
      source: "tool",
    });
  });

  it("reconciles authoritative stores after restart idempotently", () => {
    seedTask();
    expect(reconcileAuthoritativeLifecycle({
      sessionId,
      search: [{ id: "search_recovered", status: "running", progress: 12 }],
    })).toBe(1);
    expect(reconcileAuthoritativeLifecycle({
      sessionId,
      search: [{ id: "search_recovered", status: "running", progress: 12 }],
    })).toBe(0);
    expect(readTaskLedger(sessionId).tasks[0]).toMatchObject({
      state: "monitoring",
      engineRefs: { searchJobId: "search_recovered" },
    });
  });

  it("replays persisted events without creating autonomous tasks", () => {
    const task = seedTask();
    applyAgentEvent(createAgentEvent({ type: "search.progress", sessionId, entityId: "search_real", taskId: task.taskId, source: "engine_store", payload: { progress: 10 } }));
    const beforeCount = readTaskLedger(sessionId).tasks.length;
    expect(recoverLifecycleFromEvents(sessionId)).toBe(1);
    expect(readTaskLedger(sessionId).tasks).toHaveLength(beforeCount);
  });

  it("uses bounded polling and moves terminal Search to analyzing without a message", async () => {
    const task = seedTask();
    let reads = 0;
    const watcher = startBoundedSearchLifecycleWatcher({
      sessionId,
      jobId: "search_watched",
      intervalMs: 1,
      maxPolls: 4,
      readStatus: () => {
        reads += 1;
        return reads < 2
          ? { status: "running", progress: 20 }
          : { status: "completed", progress: 40 };
      },
    });
    await watcher.done;
    const stored = readTaskLedger(sessionId).tasks.find((item) => item.taskId === task.taskId);
    expect(stored?.state).toBe("analyzing");
    expect(reads).toBe(2);
    expect(readAgentEvents(sessionId).map((event) => event.type)).toEqual([
      "search.progress",
      "search.completed",
    ]);
  });
});
