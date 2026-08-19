import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/rextora/telegramService", () => ({
  getTelegramStatus: vi.fn(() => ({ configured: false, serviceState: "mock", message: "mock" })),
  sendTestMessage: vi.fn(),
  sendTelegramMessage: vi.fn(async () => ({ ok: true, serviceState: "mock", message: "sent" }))
}));

import {
  applyPaperRiskDefaults,
  loadRiskState,
  PAPER_MAX_CONSECUTIVE_LOSSES,
  resetPaperRiskStateForNewSession,
  saveRiskState
} from "../src/lib/rextora/riskStateStore";
import { getRiskBreachKeys, isRiskLimitBreached } from "../src/lib/rextora/riskRules";
import { invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";
import {
  markRiskAlertStateNormal,
  sendRiskAlertIfNeeded
} from "../src/lib/rextora/telegramAssistant";
import { sendTelegramMessage } from "../src/lib/rextora/telegramService";

let runtimeRoot = "";

beforeEach(() => {
  runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-risk-"));
  process.env.REXTORA_DATA_DIR = runtimeRoot;
  invalidateJsonStoreCache();
  vi.clearAllMocks();
});

afterEach(() => {
  invalidateJsonStoreCache();
  delete process.env.REXTORA_DATA_DIR;
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
});

describe("Paper tester risk policy", () => {
  it("adds finite Paper headroom without mutating the LIVE-configured threshold", () => {
    const liveState = loadRiskState();
    const liveLimit = liveState.settings.consecutiveLossLimit;
    const paperState = applyPaperRiskDefaults({ ...liveState, consecutiveLosses: 4 });

    expect(liveLimit).toBe(3);
    expect(PAPER_MAX_CONSECUTIVE_LOSSES).toBe(6);
    expect(paperState.settings.consecutiveLossLimit).toBe(6);
    expect(liveState.settings.consecutiveLossLimit).toBe(3);
    expect(isRiskLimitBreached(paperState)).toBe(false);
    expect(isRiskLimitBreached({ ...paperState, consecutiveLosses: 6 })).toBe(true);
  });

  it("starts a deliberately new Paper session from deterministic clean counters", () => {
    const stale = applyPaperRiskDefaults({
      ...loadRiskState(),
      dailyLossPct: -0.82,
      totalLossPct: -0.82,
      consecutiveLosses: 4,
      dailyTrades: 4,
      openPositions: 2,
      riskState: "자동 중단"
    });
    saveRiskState(stale);

    const clean = resetPaperRiskStateForNewSession();
    expect(clean).toMatchObject({
      dailyLossPct: 0,
      totalLossPct: 0,
      consecutiveLosses: 0,
      dailyTrades: 0,
      openPositions: 0,
      riskState: "정상"
    });
    expect(clean.settings.consecutiveLossLimit).toBe(6);
    expect(loadRiskState().settings.consecutiveLossLimit).toBe(3);
  });

  it("identifies the exact breached limiter for deterministic alert deduplication", () => {
    const state = applyPaperRiskDefaults({ ...loadRiskState(), consecutiveLosses: 6 });
    expect(getRiskBreachKeys(state)).toEqual(["consecutive_losses"]);
  });
});

describe("Telegram risk transition alerts", () => {
  it("alerts once while blocked, then allows the same risk after recovery", async () => {
    await sendRiskAlertIfNeeded("리스크 한도 위반으로 자동 중단", "consecutive_losses");
    await sendRiskAlertIfNeeded("리스크 한도 위반으로 자동 중단", "consecutive_losses");
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);

    markRiskAlertStateNormal();
    await sendRiskAlertIfNeeded("리스크 한도 위반으로 자동 중단", "consecutive_losses");
    expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
  });

  it("does not suppress a distinct risk event in an already blocked state", async () => {
    await sendRiskAlertIfNeeded("리스크 한도 위반으로 자동 중단", "consecutive_losses");
    await sendRiskAlertIfNeeded("리스크 한도 위반으로 자동 중단", "daily_loss");
    expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
  });
});
