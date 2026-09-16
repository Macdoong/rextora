import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateCandidateRisk } from "../src/lib/rextora/riskEngine";
import { getRiskStatus } from "../src/lib/rextora/riskManager";
import { getUnifiedRiskView } from "../src/lib/rextora/metrics/riskService";
import { getRiskBreachKeys, isRiskLimitBreached } from "../src/lib/rextora/riskRules";
import {
  getEffectiveRiskState,
  loadRiskState,
  PAPER_MAX_CONSECUTIVE_LOSSES,
  saveRiskState,
} from "../src/lib/rextora/riskStateStore";
import { getRuntimeState, setRuntimeState } from "../src/lib/rextora/runtimeState";
import { invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";
import type { MarketCoin } from "../src/lib/rextora/types";

const coin: MarketCoin = {
  symbol: "BTCUSDT",
  price: 100_000,
  change24hPct: 0.4,
  volumeChangePct: 1,
  volatility: 1.2,
  spread: 0.01,
  fundingFee: 0.01,
  quoteVolume: 1_000_000,
  state: "정상",
  aiScore: 70,
  serviceState: "simulated",
};

let runtimeRoot = "";
let previousMode: ReturnType<typeof getRuntimeState>["mode"];

beforeEach(() => {
  runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-risk-auth-"));
  process.env.REXTORA_DATA_DIR = runtimeRoot;
  invalidateJsonStoreCache();
  previousMode = getRuntimeState().mode;
  const persisted = loadRiskState();
  saveRiskState({
    ...persisted,
    consecutiveLosses: 0,
    settings: { ...persisted.settings, consecutiveLossLimit: 3 },
  });
});

afterEach(() => {
  setRuntimeState({ mode: previousMode });
  invalidateJsonStoreCache();
  delete process.env.REXTORA_DATA_DIR;
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
});

function persistStreak(consecutiveLosses: number): void {
  const persisted = loadRiskState();
  saveRiskState({
    ...persisted,
    consecutiveLosses,
    settings: { ...persisted.settings, consecutiveLossLimit: 3 },
  });
}

describe("effective consecutive-loss authority", () => {
  it("uses Paper overlay 6 without writing 6 to disk", () => {
    persistStreak(0);
    setRuntimeState({ mode: "PAPER" });
    expect(loadRiskState().settings.consecutiveLossLimit).toBe(3);
    expect(getEffectiveRiskState("PAPER").settings.consecutiveLossLimit).toBe(6);
    expect(PAPER_MAX_CONSECUTIVE_LOSSES).toBe(6);
    expect(getRiskStatus().settings.consecutiveLossLimit).toBe(3);
    const disk = JSON.parse(
      fs.readFileSync(path.join(runtimeRoot, "risk-state.json"), "utf8"),
    ) as { settings: { consecutiveLossLimit: number } };
    expect(disk.settings.consecutiveLossLimit).toBe(3);
  });

  it("uses persisted 3 for shared/LIVE and BACKTEST", () => {
    persistStreak(0);
    expect(getEffectiveRiskState("LIVE").settings.consecutiveLossLimit).toBe(3);
    expect(getEffectiveRiskState("BACKTEST").settings.consecutiveLossLimit).toBe(3);
    expect(loadRiskState().settings.consecutiveLossLimit).toBe(3);
  });

  it("evaluates Paper candidates against limit 6", () => {
    persistStreak(5);
    setRuntimeState({ mode: "PAPER" });
    const paper = evaluateCandidateRisk(coin, 0.8);
    expect(getEffectiveRiskState("PAPER").settings.consecutiveLossLimit).toBe(6);
    expect(paper.passed).toBe(true);
    persistStreak(6);
    expect(evaluateCandidateRisk(coin, 0.8).passed).toBe(false);
    expect(evaluateCandidateRisk(coin, 0.8).reason).toContain("리스크 한도");
  });

  it("breaches Paper consecutive-loss halt at 6, not 5", () => {
    persistStreak(5);
    const atFive = getEffectiveRiskState("PAPER");
    expect(atFive.settings.consecutiveLossLimit).toBe(6);
    expect(getRiskBreachKeys(atFive)).not.toContain("consecutive_losses");
    expect(isRiskLimitBreached(atFive)).toBe(false);
    persistStreak(6);
    const atSix = getEffectiveRiskState("PAPER");
    expect(getRiskBreachKeys(atSix)).toEqual(["consecutive_losses"]);
    expect(isRiskLimitBreached(atSix)).toBe(true);
  });

  it("reports 6 from unified /risk view while mode is PAPER", () => {
    persistStreak(0);
    setRuntimeState({ mode: "PAPER" });
    expect(getUnifiedRiskView().consecutiveLossLimit).toBe(6);
    setRuntimeState({ mode: "LIVE" });
    expect(getUnifiedRiskView().consecutiveLossLimit).toBe(3);
  });

  it("keeps Settings/persisted source at 3 and ignores legacy schema", () => {
    persistStreak(0);
    expect(getRiskStatus().settings.consecutiveLossLimit).toBe(3);
    expect(loadRiskState().settings.consecutiveLossLimit).toBe(3);
    const resolverSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/riskStateStore.ts"),
      "utf8",
    );
    const engineSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/riskEngine.ts"),
      "utf8",
    );
    expect(resolverSrc).toContain("getEffectiveRiskState");
    expect(resolverSrc).not.toContain("maxConsecutiveLosses");
    expect(engineSrc).not.toContain("maxConsecutiveLosses");
    expect(engineSrc).toContain("getEffectiveRiskState(getRuntimeState().mode)");
  });
});
