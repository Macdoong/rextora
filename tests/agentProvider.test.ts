/**
 * Agent Provider Architecture — unit tests.
 * Tests provider config, schema validation, failure normalisation,
 * safety guard write-blocking, facts/interpretation separation.
 * No real API calls made.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Intent parser: write-blocked intents ─────────────────────────────────────
import { parseIntent } from "../src/lib/rextora/agent/intentParser";

describe("intentParser: write-blocked intents", () => {
  it("detects modify_safe intent", () => {
    expect(parseIntent("SAFE 수정해줘").type).toBe("modify_safe");
    expect(parseIntent("safe를 변경해줘").type).toBe("modify_safe");
    expect(parseIntent("SAFE 전략 수정 부탁해").type).toBe("modify_safe");
  });

  it("detects execute_trade intent", () => {
    expect(parseIntent("지금 BTC 매수해줘").type).toBe("execute_trade");
  });

  it("detects start_live intent", () => {
    expect(parseIntent("이 전략을 실전매매로 시작해줘").type).toBe("start_live");
  });

  it("write-blocked intents are detected BEFORE read intents", () => {
    expect(parseIntent("SAFE가 왜 차단했어").type).toBe("explain_rejection");
    expect(parseIntent("SAFE 전략 설명해줘").type).toBe("explain_strategy");
  });
});

// ─── Safety guard: write-blocking ────────────────────────────────────────────
import { checkIntentSafety } from "../src/lib/rextora/agent/safetyGuard";

describe("safetyGuard: write-blocking", () => {
  it("blocks modify_safe with specific Korean message", () => {
    const result = checkIntentSafety("modify_safe");
    expect(result.allowed).toBe(false);
    expect(result.reasonKo).toMatch(/폐기|사용할 수 없습니다/);
  });

  it("blocks execute_trade with approval message", () => {
    const result = checkIntentSafety("execute_trade");
    expect(result.allowed).toBe(false);
    expect(result.reasonKo).toContain("승인");
  });

  it("blocks start_live", () => {
    const result = checkIntentSafety("start_live");
    expect(result.allowed).toBe(false);
    expect(result.reasonKo).toMatch(/실전|승인/);
  });

  it("allows all read-only intents including paper_start and search_failure", () => {
    const readOnly = [
      "search_status",
      "explain_strategy",
      "backtest_summary",
      "explain_rejection",
      "compare_strategies",
      "market_status",
      "risk_summary",
      "recommend_next",
      "paper_start_request",
      "search_failure_explanation",
      "prepare_search_plan",
      "follow_up_why",
      "approve_pending",
      "unknown",
    ] as const;
    for (const intent of readOnly) {
      expect(checkIntentSafety(intent).allowed).toBe(true);
    }
  });
});

// ─── Provider config: no secret leakage ──────────────────────────────────────
import { getProviderConfig } from "../src/lib/rextora/agent/providerConfig";

describe("providerConfig", () => {
  it("returns configured/not-configured flags without exposing key values", () => {
    const config = getProviderConfig();
    // Values must be boolean flags, not the key strings
    expect(typeof config.openaiConfigured).toBe("boolean");
    expect(typeof config.geminiConfigured).toBe("boolean");
    // Model names are safe (not secrets)
    expect(typeof config.openaiModel).toBe("string");
    expect(typeof config.geminiModel).toBe("string");
    // Provider is a safe enum value
    expect(["openai", "gemini", "local"]).toContain(config.provider);
  });

  it("config object contains no API key values", () => {
    const config = getProviderConfig();
    const serialised = JSON.stringify(config);
    // Config must not contain actual key patterns (sk-, AIza-)
    expect(serialised).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(serialised).not.toMatch(/AIza[A-Za-z0-9_-]/);
  });
});

// ─── LLM types: LOCAL_ONLY_INTENTS ───────────────────────────────────────────
import { LOCAL_ONLY_INTENTS } from "../src/lib/rextora/agent/llmTypes";

describe("llmTypes", () => {
  it("unknown and market_status are local-only", () => {
    expect(LOCAL_ONLY_INTENTS).toContain("unknown");
    expect(LOCAL_ONLY_INTENTS).toContain("market_status");
  });

  it("backtest_summary and risk_summary go through LLM", () => {
    expect(LOCAL_ONLY_INTENTS).not.toContain("backtest_summary");
    expect(LOCAL_ONLY_INTENTS).not.toContain("risk_summary");
  });
});

// ─── Prompt builder: no secrets in prompt ────────────────────────────────────
import { buildInterpretationPrompt } from "../src/lib/rextora/agent/providers/promptBuilder";

describe("promptBuilder", () => {
  const evidence = {
    intentType: "backtest_summary" as const,
    query: "최근 백테스트 결과 보여줘",
    facts: [
      { labelKo: "총 수익률", value: "22.28%", source: "backtest_store" as const, fetchedAt: "2026-01-01T00:00:00Z" },
      { labelKo: "최대 낙폭(MDD)", value: "17.00%", source: "backtest_store" as const, fetchedAt: "2026-01-01T00:00:00Z" },
    ],
    history: [],
  };

  it("includes facts in the prompt", () => {
    const msgs = buildInterpretationPrompt(evidence);
    const combined = msgs.map((m) => m.content).join("\n");
    expect(combined).toContain("22.28%");
    expect(combined).toContain("17.00%");
  });

  it("does not include secret key patterns", () => {
    const msgs = buildInterpretationPrompt(evidence);
    const combined = msgs.map((m) => m.content).join("\n");
    expect(combined).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(combined).not.toMatch(/AIza[A-Za-z0-9_-]/);
  });

  it("instructs Korean output", () => {
    const msgs = buildInterpretationPrompt(evidence);
    const system = msgs.find((m) => m.role === "system")?.content ?? "";
    expect(system).toMatch(/Korean/i);
  });

  it("bounds history to prevent token explosion", () => {
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      role: "user" as const,
      content: `question ${i}`,
      timestamp: "2026-01-01T00:00:00Z",
    }));
    const msgs = buildInterpretationPrompt({ ...evidence, history: longHistory });
    // system + bounded history + user = should not be > 10 messages
    expect(msgs.length).toBeLessThanOrEqual(10);
  });
});

// ─── agentLLM: callLLM falls back to local on adapter null ───────────────────
import { callLLM } from "../src/lib/rextora/agent/agentLLM";

describe("agentLLM: callLLM", () => {
  it("returns local fallback for LOCAL_ONLY_INTENTS", async () => {
    const result = await callLLM(
      {
        intentType: "unknown",
        query: "hello",
        facts: [],
        history: [],
      },
      "local fallback text",
    );
    expect(result.source).toBe("local");
    expect(result.interpretationKo).toBe("local fallback text");
  });

  it("returns local fallback for market_status", async () => {
    const result = await callLLM(
      {
        intentType: "market_status",
        query: "시장 어때",
        facts: [],
        history: [],
      },
      "시장 데이터 없음",
    );
    expect(result.source).toBe("local");
  });
});

// ─── Response builder: facts and interpretation always separate ───────────────
import { buildAgentResponse, buildLocalInterpretation } from "../src/lib/rextora/agent/agentResponseBuilder";
import { parseIntent as pi } from "../src/lib/rextora/agent/intentParser";

describe("agentResponseBuilder", () => {
  const facts = [
    { labelKo: "전체 탐색 작업", value: "5개", source: "strategy_search_jobs" as const, fetchedAt: "2026-01-01T00:00:00Z" },
    { labelKo: "실행 중", value: "1개", source: "strategy_search_jobs" as const, fetchedAt: "2026-01-01T00:00:00Z" },
    { labelKo: "완료됨", value: "4개", source: "strategy_search_jobs" as const, fetchedAt: "2026-01-01T00:00:00Z" },
  ];

  it("local interpretation is non-empty for search_status with facts", () => {
    const intent = pi("탐색 상태 알려줘");
    const text = buildLocalInterpretation(intent, facts);
    expect(text.length).toBeGreaterThan(10);
    expect(text).toContain("5");
  });

  it("response includes interpretationSource", () => {
    const intent = pi("탐색 상태 알려줘");
    const resp = buildAgentResponse(intent, facts);
    expect(resp.interpretationSource).toBe("local");
    expect(resp.facts).toHaveLength(3);
    expect(resp.interpretationKo).toBeTruthy();
  });

  it("LLM metadata is preserved while conversational decision prose leads", () => {
    const intent = pi("탐색 상태 알려줘");
    const resp = buildAgentResponse(intent, facts, {
      interpretationKo: "LLM generated text",
      source: "llm",
      providerMeta: { provider: "openai", model: "gpt-4o-mini", latencyMs: 400 },
    });
    expect(resp.interpretationSource).toBe("llm");
    expect(resp.conclusionKo.length).toBeGreaterThan(5);
    expect(resp.explanationKo.length).toBeGreaterThan(5);
    expect(resp.interpretationKo).toContain(resp.conclusionKo);
    expect(resp.providerMeta?.provider).toBe("openai");
    // Facts must still be present and separate (collapsed evidence)
    expect(resp.facts).toHaveLength(3);
  });

  it("actions are filtered — live-trading hrefs removed and recommend_next is single", () => {
    const intent = pi("다음에 뭐 해야 해");
    const resp = buildAgentResponse(intent, [
      ...facts,
      {
        labelKo: "권장 다음 작업",
        value: "탐색 결과 검토",
        source: "system_status",
        fetchedAt: "2026-01-01T00:00:00Z",
      },
      {
        labelKo: "권장 이동 경로",
        value: "/results",
        source: "system_status",
        fetchedAt: "2026-01-01T00:00:00Z",
      },
      {
        labelKo: "권장 작업 키",
        value: "view_recommendation",
        source: "system_status",
        fetchedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(resp.actions).toHaveLength(1);
    for (const action of resp.actions) {
      expect(action.href).not.toContain("/live-trading");
    }
    expect(resp.recommendedActionKo).toBeTruthy();
  });

  it("paper_start_request deep-links to paper with approval and never executes", () => {
    const intent = pi("Paper 시작해줘");
    expect(intent.type).toBe("paper_start_request");
    const resp = buildAgentResponse(intent, [
      {
        labelKo: "에이전트 Paper 실행",
        value: "차단 — 인간 승인 후 Paper 화면에서만 시작",
        source: "system_status",
        fetchedAt: "2026-01-01T00:00:00Z",
      },
      {
        labelKo: "후보 전략 ID",
        value: "custom_demo",
        source: "strategy_store",
        fetchedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(resp.actions).toHaveLength(1);
    expect(resp.actions[0]?.href).toContain("/paper-trading");
    expect(resp.actions[0]?.requiresApproval).toBe(true);
    expect(resp.interpretationKo + resp.conclusionKo + resp.explanationKo).toMatch(
      /승인|화면만/,
    );
  });

  it("compare_strategies refuses when verified data is missing", () => {
    const intent = pi("BTC와 ETH 전략을 비교해줘");
    const resp = buildAgentResponse(intent, [
      {
        labelKo: "비교 가능",
        value: "아니오 — ETH 검증 데이터 없음",
        source: "backtest_store",
        fetchedAt: "2026-01-01T00:00:00Z",
      },
      {
        labelKo: "비교 심볼 A",
        value: "BTC",
        source: "backtest_store",
        fetchedAt: "2026-01-01T00:00:00Z",
      },
      {
        labelKo: "비교 심볼 B",
        value: "ETH",
        source: "backtest_store",
        fetchedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(resp.conclusionKo + resp.explanationKo).toMatch(/비교할 수 없/);
    expect(resp.conclusionKo + resp.explanationKo).toMatch(/만들지 않습니다|추정/);
    expect(resp.conclusionKo).not.toMatch(/\d+(\.\d+)?%/);
    expect(resp.actions[0]?.type).toBe("open_backtest");
  });
});

// ─── No NEXT_PUBLIC_ secret in any agent client file ─────────────────────────
import fs from "node:fs";

describe("secret leakage prevention", () => {
  const clientFiles = [
    "components/rextora/agent/AgentPanel.tsx",
    "components/rextora/agent/AgentMessage.tsx",
    "components/rextora/agent/AgentInput.tsx",
    "components/rextora/agent/AgentSuggestions.tsx",
    "components/rextora/agent/ActionCard.tsx",
    "components/rextora/agent/useAgentSession.ts",
    "components/rextora/agent/agentAnalytics.ts",
  ];

  for (const file of clientFiles) {
    it(`${file} contains no NEXT_PUBLIC_ secrets`, () => {
      const src = fs.readFileSync(file, "utf8");
      expect(src).not.toMatch(/NEXT_PUBLIC_OPENAI|NEXT_PUBLIC_GEMINI|NEXT_PUBLIC_.*KEY/);
    });

    it(`${file} contains no process.env.OPENAI or process.env.GEMINI`, () => {
      const src = fs.readFileSync(file, "utf8");
      expect(src).not.toMatch(/process\.env\.(OPENAI|GEMINI)/);
    });
  }

  it("providerConfig.ts is not imported by any client component", () => {
    for (const file of clientFiles) {
      const src = fs.readFileSync(file, "utf8");
      expect(src).not.toContain("providerConfig");
    }
  });
});
