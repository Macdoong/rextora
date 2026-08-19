/**
 * Typed approval command contract: schema, expiry, re-approval,
 * idempotency, blocked Live/SAFE, Paper prepare-only.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createTypedCommand,
  validateCommandSchema,
  isCommandExpired,
  requiresReapproval,
  hashRequest,
  TYPED_COMMAND_TYPES,
} from "../src/lib/rextora/agent/typedCommand";
import { parseIntent } from "../src/lib/rextora/agent/intentParser";

describe("typed command schema", () => {
  it("creates only allowed command types with required fields", () => {
    const cmd = createTypedCommand({
      commandType: "create_strategy_search_job",
      parameters: { symbol: "BTCUSDT", timeframe: "15m" },
      symbol: "BTCUSDT",
      timeframe: "15m",
    });
    expect(TYPED_COMMAND_TYPES).toContain(cmd.commandType);
    expect(cmd.commandId).toMatch(/^cmd_/);
    expect(cmd.approvalStatus).toBe("pending_approval");
    expect(cmd.executionStatus).toBe("not_started");
    expect(cmd.requestHash).toBe(
      hashRequest(
        { symbol: "BTCUSDT", timeframe: "15m" },
        "create_strategy_search_job",
      ),
    );
    expect(cmd.idempotencyKey).toBe(
      `create_strategy_search_job:${cmd.requestHash}`,
    );
    expect(validateCommandSchema(cmd).ok).toBe(true);
  });

  it("rejects blocked Live / trade / SAFE command types", () => {
    for (const bad of ["start_live", "execute_trade", "modify_safe", "live_order"]) {
      expect(() =>
        createTypedCommand({
          commandType: bad as "run_backtest",
          parameters: {},
        }),
      ).toThrow(/차단|지원하지/);
    }
  });

  it("requires strategyId for backtest and paper", () => {
    const bt = createTypedCommand({
      commandType: "run_backtest",
      parameters: { fromOpenTime: 1 },
    });
    expect(validateCommandSchema(bt).ok).toBe(false);
    expect(validateCommandSchema(bt).issues.join(" ")).toMatch(/strategyId/);

    const paper = createTypedCommand({
      commandType: "prepare_paper_session",
      parameters: {},
    });
    expect(validateCommandSchema(paper).ok).toBe(false);
  });

  it("detects expiry", () => {
    const cmd = createTypedCommand({
      commandType: "run_backtest",
      parameters: { strategyId: "s1" },
      strategyId: "s1",
      ttlMs: 1,
    });
    expect(isCommandExpired(cmd, Date.parse(cmd.createdAt) + 1000)).toBe(true);
    expect(isCommandExpired(cmd, Date.parse(cmd.createdAt) - 1)).toBe(false);
  });

  it("requires re-approval when parameters change", () => {
    const cmd = createTypedCommand({
      commandType: "run_backtest",
      parameters: { strategyId: "s1", feeRate: 0.0004 },
      strategyId: "s1",
    });
    expect(requiresReapproval(cmd, { strategyId: "s1", feeRate: 0.0004 })).toBe(
      false,
    );
    expect(requiresReapproval(cmd, { strategyId: "s1", feeRate: 0.001 })).toBe(
      true,
    );
  });
});

describe("NL intents produce plan intents for typed execution", () => {
  it("maps Korean execution phrases to prepare_* intents", () => {
    expect(parseIntent("이 설정으로 탐색 시작해").type).toMatch(
      /prepare_search|search/,
    );
    expect(parseIntent("백테스트 실행해").type).toBe("prepare_backtest_plan");
    expect(parseIntent("이 전략 Paper로 준비해").type).toMatch(
      /prepare_paper|paper/,
    );
    expect(parseIntent("진행해").type).toBe("approve_pending");
  });
});

describe("command store idempotency", () => {
  const tmpRoot = path.join(os.tmpdir(), `rextora-cmd-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    process.env.REXTORA_AGENT_COMMANDS_DIR = tmpRoot;
  });

  afterEach(() => {
    delete process.env.REXTORA_AGENT_COMMANDS_DIR;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("findByIdempotencyKey returns succeeded command", async () => {
    const { saveCommand, findByIdempotencyKey } = await import(
      "../src/lib/rextora/agent/commandStore"
    );
    const cmd = createTypedCommand({
      commandType: "create_strategy_search_job",
      parameters: { symbol: "ETHUSDT", depth: "fast" },
      symbol: "ETHUSDT",
    });
    saveCommand({
      ...cmd,
      executionStatus: "succeeded",
      jobId: "job_test_1",
      resultReference: "job:job_test_1",
      approvalStatus: "approved",
      approvedAt: new Date().toISOString(),
    });
    const found = findByIdempotencyKey(cmd.idempotencyKey);
    expect(found?.jobId).toBe("job_test_1");
    expect(found?.executionStatus).toBe("succeeded");
  });
});

describe("UI wiring source contracts", () => {
  it("ApprovalCenter exposes approve CTA and Agent FAB uses shared offset", () => {
    const approval = fs.readFileSync(
      path.join(__dirname, "../components/rextora/agent/ApprovalCenter.tsx"),
      "utf8",
    );
    expect(approval).toContain("agent-approval-approve");
    expect(approval).toContain("onApprove");
    expect(approval).not.toContain(
      "Search · Backtest · Paper · Live는\n            자동 실행되지 않습니다",
    );

    const fab = fs.readFileSync(
      path.join(__dirname, "../components/rextora/agent/GlobalAgentAssistant.tsx"),
      "utf8",
    );
    expect(fab).toContain("REXTORA_FAB_OFFSET_VAR");
    expect(fab).toContain("/strategy-search");
    expect(fab).toContain("/backtest");
    expect(fab).toContain("data-fab-mode");

    const css = fs.readFileSync(
      path.join(__dirname, "../app/globals.css"),
      "utf8",
    );
    expect(css).toContain("--rextora-fab-offset");
    expect(css).toContain("--rextora-fab-end-gutter");
    expect(css).toContain("rextora-sticky-actions");

    const manage = fs.readFileSync(
      path.join(
        __dirname,
        "../components/rextora/backtest/BacktestStrategyManageDrawer.tsx",
      ),
      "utf8",
    );
    expect(manage).toContain("SAFE");
    expect(manage).toContain("archive");
    expect(manage).toContain("delete");

    const workbench = fs.readFileSync(
      path.join(
        __dirname,
        "../components/rextora/backtest/BacktestReviewWorkbench.tsx",
      ),
      "utf8",
    );
    expect(workbench).toContain("backtest-strategy-manage-open");
    expect(workbench).toContain("BacktestStrategyManageDrawer");
  });

  it("Agent drawer collapses workspace/timeline by default", () => {
    const panel = fs.readFileSync(
      path.join(__dirname, "../components/rextora/agent/AgentPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("agent-details-toggle");
    expect(panel).toContain("turns.slice(-1)");
    expect(panel).toContain('sendQuery("진행해")');
  });
});

describe("executeApprovedCommand safety", () => {
  it("source never references Live order or SAFE mutation APIs", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/lib/rextora/agent/commandExecutor.ts"),
      "utf8",
    );
    expect(src).toContain("createStrategySearchJobApi");
    expect(src).toContain("runAndSaveBacktest");
    expect(src).toContain("preparePaperFromResults");
    expect(src).toContain("exchangeCalled: false");
    expect(src).not.toMatch(/binance.*order|placeOrder|startLive/i);
    expect(src).not.toContain("SAFE_v44");
  });
});

// silence unused vi in case of future mocks
void vi;
