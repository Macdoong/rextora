import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";
import type { AgentResponse } from "../src/lib/rextora/agent/types";

vi.mock("../src/lib/rextora/agent/v2/reasoning/reasoningProvider", () => ({
  callReasoningProvider: vi.fn(async () => ({
    ok: false,
    raw: null,
    provider: "gemini",
    model: "forced-timeout",
    errorKo: "Reasoning 요청 시간 초과",
    latencyMs: 20_000,
    parsed: { artifact: null, issues: ["forced_timeout"] },
  })),
}));

describe("conversation provider failure preserves route mode", () => {
  let root: string;
  let POST: typeof import("../app/api/rextora/agent/route").POST;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-conversation-fallback-"));
    process.env.REXTORA_DATA_DIR = root;
    process.env.AGENT_V2_REASONING_ENABLED = "1";
    process.env.REXTORA_AGENT_TOOL_AUDIT_DIR = path.join(root, "tool-audit");
    ({ POST } = await import("../app/api/rextora/agent/route"));
  });

  afterAll(() => {
    delete process.env.REXTORA_DATA_DIR;
    delete process.env.AGENT_V2_REASONING_ENABLED;
    delete process.env.REXTORA_AGENT_TOOL_AUDIT_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const { callReasoningProvider } = await import(
      "../src/lib/rextora/agent/v2/reasoning/reasoningProvider"
    );
    vi.mocked(callReasoningProvider).mockClear();
  });

  async function ask(query: string): Promise<AgentResponse> {
    const response = await POST(
      new Request("http://localhost/api/rextora/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sessionId: `agent_fallback_${Math.random().toString(36).slice(2, 10)}`,
          turnId: `turn_${Math.random().toString(36).slice(2, 10)}`,
          history: [],
          entityMemory: emptyEntityMemory(),
          pendingApprovals: [],
        }),
      }),
    );
    expect(response.status).toBe(200);
    return (await response.json()) as AgentResponse;
  }

  it.each([
    ["렉스토라는 뭐 하는 앱이야?", "rextora_product"],
    ["MDD가 왜 중요해?", "concept_mdd"],
  ])(
    "falls back to grounded local answer when provider fails: %s",
    async (query, topic) => {
      const { callReasoningProvider } = await import(
        "../src/lib/rextora/agent/v2/reasoning/reasoningProvider"
      );
      const response = await ask(query);
      expect(response.conversationRoute?.mode).toBe("DIRECT_ANSWER");
      expect(response.conversationRoute?.topic).toBe(topic);
      expect(response.conversationRoute?.providerExpected).toBe(true);
      expect(response.proposedAction).toBeNull();
      expect(callReasoningProvider).toHaveBeenCalledTimes(1);
      expect(response.interpretationSource).toBe("local");
      expect(response.conclusionKo?.trim().length).toBeGreaterThan(0);
    },
  );

  it("keeps state question READ_AND_ANSWER after provider timeout", async () => {
    const { callReasoningProvider } = await import(
      "../src/lib/rextora/agent/v2/reasoning/reasoningProvider"
    );
    const response = await ask("현재 진행 상황 알려줘.");
    expect(response.conversationRoute?.mode).toBe("READ_AND_ANSWER");
    expect(response.conversationRoute?.requestedWriteTools).toEqual([]);
    expect(response.proposedAction).toBeNull();
    expect(response.reasoningMeta?.fallbackUsed).toBe(true);
    expect(callReasoningProvider).toHaveBeenCalledTimes(1);
  });

  it("keeps action PLAN_AND_APPROVE and performs no write after timeout", async () => {
    const { callReasoningProvider } = await import(
      "../src/lib/rextora/agent/v2/reasoning/reasoningProvider"
    );
    const response = await ask("새 전략을 탐색해줘.");
    expect(response.conversationRoute?.mode).toBe("PLAN_AND_APPROVE");
    expect(response.conversationRoute?.requiresApproval).toBe(true);
    expect(response.proposedAction?.requiresApproval).toBe(true);
    expect(response.executionResult).toBeUndefined();
    expect(callReasoningProvider).toHaveBeenCalledTimes(1);

    const auditRoot = path.join(root, "tool-audit");
    const auditText = fs.existsSync(auditRoot)
      ? fs
          .readdirSync(auditRoot)
          .filter((name) => name.endsWith(".jsonl"))
          .map((name) => fs.readFileSync(path.join(auditRoot, name), "utf8"))
          .join("\n")
      : "";
    expect(auditText).not.toMatch(
      /"toolId":"(?:search\.create|search\.start|backtest\.run|paper\.prepare)"/,
    );
  });
});

