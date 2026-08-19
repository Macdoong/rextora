/**
 * Live / real-order execution safety and Search canonical hash tests.
 */
import { describe, expect, it } from "vitest";
import { detectGoal } from "../src/lib/rextora/agent/goalDetector";
import { parseIntent } from "../src/lib/rextora/agent/intentParser";
import {
  classifyExecutionRequest,
  isDirectExecutionRequest,
} from "../src/lib/rextora/agent/executionRequestClassifier";
import { buildSearchPlanDraft } from "../src/lib/rextora/agent/searchPlanDraft";
import { searchPlanToAgentPlan } from "../src/lib/rextora/agent/planDrafts";
import { hashEngineParameters } from "../src/lib/rextora/agent/canonicalCommandPayload";
import {
  createTypedCommand,
  requiresReapproval,
} from "../src/lib/rextora/agent/typedCommand";

const BLOCKED_DIRECT = [
  "지금 Live 시작해",
  "실전 매매 시작해",
  "라이브로 돌려",
  "바로 실전 진입해",
  "이 전략 실전으로 시작해",
  "BTC 매수해",
  "BTC 매도해",
  "실전 주문 넣어줘",
  "place a real BTC order",
  "start live trading",
];

const EXPLANATORY = [
  "Live 승인을 받으면 어떻게 돼?",
  "실전 매매 위험을 설명해줘.",
  "Live 조건을 보여줘.",
  "왜 실전 매매가 차단돼 있어?",
];

describe("execution request classifier", () => {
  for (const query of BLOCKED_DIRECT) {
    it(`blocks direct execution: ${query}`, () => {
      const c = classifyExecutionRequest(query);
      expect(c.kind).toBe("blocked");
      if (c.kind === "blocked") {
        expect(["start_live", "execute_trade"]).toContain(c.intentType);
      }
      expect(isDirectExecutionRequest(query)).toBe(true);
    });
  }

  for (const query of EXPLANATORY) {
    it(`allows explanatory query: ${query}`, () => {
      const c = classifyExecutionRequest(query);
      expect(c.kind).not.toBe("blocked");
      expect(isDirectExecutionRequest(query)).toBe(false);
    });
  }
});

describe("detectGoal Live safety", () => {
  for (const query of BLOCKED_DIRECT) {
    it(`detectGoal blocks: ${query}`, () => {
      const { intent, goal } = detectGoal({ query });
      expect(["start_live", "execute_trade"]).toContain(intent.type);
      expect(["blocked_live", "blocked_execute"]).toContain(goal);
    });
  }

  it('"이 전략 실전으로 시작해" never becomes prepare_search_plan', () => {
    const { intent } = detectGoal({ query: "이 전략 실전으로 시작해" });
    expect(intent.type).not.toBe("prepare_search_plan");
    expect(intent.type).toBe("start_live");
  });

  for (const query of EXPLANATORY) {
    it(`explanatory remains non-blocked intent: ${query}`, () => {
      const { intent } = detectGoal({ query });
      expect(intent.type).not.toBe("start_live");
      expect(intent.type).not.toBe("execute_trade");
    });
  }
});

describe("parseIntent Live safety patterns", () => {
  it("maps known Live phrases to blocked intents", () => {
    expect(parseIntent("지금 Live 시작해").type).toBe("start_live");
    expect(parseIntent("라이브로 돌려").type).toBe("start_live");
    expect(parseIntent("실전 주문 넣어줘").type).toBe("execute_trade");
    expect(parseIntent("BTC 매수해").type).toBe("execute_trade");
  });
});

describe("Search canonical hash", () => {
  it("same logical plan → same hash", () => {
    const a = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
    });
    const b = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
    });
    const ha = searchPlanToAgentPlan(a).typedCommand?.requestHash;
    const hb = searchPlanToAgentPlan(b).typedCommand?.requestHash;
    expect(ha).toBeTruthy();
    expect(ha).toBe(hb);
  });

  it("timeframe 15m vs 1h → different hash and createBody", () => {
    const a = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
    });
    const b = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "1h",
    });
    expect((a.createBody as { timeframe?: string }).timeframe).toBe("15m");
    expect((b.createBody as { timeframe?: string }).timeframe).toBe("1h");
    const ha = searchPlanToAgentPlan(a).typedCommand?.requestHash;
    const hb = searchPlanToAgentPlan(b).typedCommand?.requestHash;
    expect(ha).not.toBe(hb);
  });

  it("symbol change → different hash", () => {
    const a = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
    });
    const b = buildSearchPlanDraft({
      requestedSymbol: "ETHUSDT",
      requestedTimeframe: "15m",
    });
    expect(searchPlanToAgentPlan(a).typedCommand?.requestHash).not.toBe(
      searchPlanToAgentPlan(b).typedCommand?.requestHash,
    );
  });

  it("pattern set change → different hash", () => {
    const a = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
      patternSpaceIds: ["order_block"],
    });
    const b = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
      patternSpaceIds: ["order_block", "fvg"],
    });
    expect(searchPlanToAgentPlan(a).typedCommand?.requestHash).not.toBe(
      searchPlanToAgentPlan(b).typedCommand?.requestHash,
    );
  });

  it("depth profile change → different hash", () => {
    const a = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
      depthProfile: "standard",
    });
    const b = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
      depthProfile: "deep",
    });
    expect(searchPlanToAgentPlan(a).typedCommand?.requestHash).not.toBe(
      searchPlanToAgentPlan(b).typedCommand?.requestHash,
    );
  });

  it("requiresReapproval when meaningful parameter changes", () => {
    const draft = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
    });
    const cmd = searchPlanToAgentPlan(draft).typedCommand!;
    const other = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "1h",
    });
    const otherCmd = searchPlanToAgentPlan(other).typedCommand!;
    expect(requiresReapproval(cmd, otherCmd.parameters)).toBe(true);
  });

  it("canonical payload strips operator searchName only", () => {
    const draft = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
    });
    const body = structuredClone(draft.createBody) as Record<string, unknown>;
    const op = body.operatorPlan as Record<string, unknown>;
    op.searchName = "display_only_name_change";
    const h1 = hashEngineParameters(
      { createBody: body },
      "create_strategy_search_job",
    );
    const h2 = hashEngineParameters(
      { createBody: draft.createBody },
      "create_strategy_search_job",
    );
    expect(h1).toBe(h2);
  });
});

describe("backtest hash sensitivity", () => {
  it("symbol in parameters changes hash", () => {
    const base = createTypedCommand({
      commandType: "run_backtest",
      parameters: {
        strategyId: "custom_test",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
      },
      strategyId: "custom_test",
    });
    const other = createTypedCommand({
      commandType: "run_backtest",
      parameters: {
        strategyId: "custom_test",
        symbols: ["ETHUSDT"],
        timeframe: "15m",
      },
      strategyId: "custom_test",
    });
    expect(base.requestHash).not.toBe(other.requestHash);
  });
});
