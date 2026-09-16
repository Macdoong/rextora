/**
 * P3-A8.3.4 read-only Paper runtime-continuity + Pattern warmup forensics.
 * Isolated temp stores only. Does not start production Paper/Live or change lifecycle.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getAccountState,
  resetAccountStateForTests,
} from "../../src/lib/rextora/accountStateStore";
import {
  manageEventSequencePaperPositions,
  openEventSequencePaperPosition,
} from "../../src/lib/rextora/paper/paperEventSequenceLifecycle";
import {
  activatePaperSession,
  getPaperSession,
  preparePaperSession,
  type PaperSession,
} from "../../src/lib/rextora/paper/paperSessionStore";
import { getOpenPositions } from "../../src/lib/rextora/positionManager";
import { invalidateJsonStoreCache } from "../../src/lib/rextora/storage/jsonStore";
import { savePaperOrders, savePaperPositions } from "../../src/lib/rextora/storage/tradeStore";
import { resetUnifiedTradeResultsForTests } from "../../src/lib/rextora/metrics/tradeResultStore";
import {
  evaluateEventSequencePaperSignal,
  runEventSequenceBacktest,
} from "../../src/lib/rextora/strategy/eventSequenceBacktest";
import {
  EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
  EVENT_SEQUENCE_COST_MODEL_LEDGER_V0,
  type EventSequenceCostModel,
} from "../../src/lib/rextora/strategy/eventSequenceCostModel";
import { CONTEXT_FALLBACK_PARAMS } from "../../src/lib/rextora/strategy/safeV44Params";
import {
  createStrategy,
  ensureStrategyStore,
} from "../../src/lib/rextora/strategy/strategyStore";
import type { Position } from "../../src/lib/rextora/types";
import { installIsolatedStrategyStore } from "./isolatedStrategyStore";
import {
  buildObLongCandles,
  candle,
  FEE,
  FUNDING,
  patternDefinition,
  SLIP,
  source,
  SPREAD,
} from "./paperEventSequenceLifecycleForensics";

export const P3A834_ARTIFACT_TS = "2026-09-07T01-30-00-000Z";
export const ISOLATED_START_BALANCE = 10_000;
export const PROCESS_START_BALANCE_USDT = 10_254.32;
export const PROCESS_START_AVAILABLE_USDT = 10_012.1;
export const ES_WALKER_WARMUP_BARS = 20;
export const ES_PAPER_SIGNAL_MIN_CANDLES = 25;
export const PATTERN_BASE_BALANCE_PCT = 0.1;

const ASSUMPTIONS = {
  feeRate: FEE,
  slippageRate: SLIP,
  fundingRate: FUNDING,
  applyFunding: true,
  applySpread: true,
  spreadRate: SPREAD,
};

export function sha256File(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function productionRecordHashes(cwd = process.cwd()) {
  const paperDir = path.join(cwd, "data/rextora/paper-sessions");
  const accountGlob = fs
    .readdirSync(path.join(cwd, "data/rextora"), { withFileTypes: true })
    .filter((e) => /account|balance/i.test(e.name))
    .map((e) => e.name);
  return {
    safeSha256: sha256File(path.join(cwd, "data/strategies/SAFE_v44_i4060.json")),
    researchIndexSha256: sha256File(
      path.join(cwd, "data/rextora/strategy-search/index.json"),
    ),
    backtestIndexSha256: sha256File(
      path.join(cwd, "data/rextora/backtests/index.json"),
    ),
    strategyIndexSha256: sha256File(
      path.join(cwd, "data/rextora/strategies/index.json"),
    ),
    positionsSha256: sha256File(path.join(cwd, "data/rextora/positions.json")),
    paperSessionsIndexSha256: sha256File(path.join(paperDir, "index.json")),
    paperSessionBf028Sha256: sha256File(
      path.join(paperDir, "paper_bf028ba7-b04f-4f25-84ed-5a45eec5d2a8.json"),
    ),
    paperSessionE1dabSha256: sha256File(
      path.join(paperDir, "paper_e1dab933-f951-4e07-acbe-c09c2d993b09.json"),
    ),
    accountPersistenceFiles: accountGlob,
    accountPersistenceFileExists: accountGlob.length > 0,
  };
}

export function parseAccountModuleInitializer() {
  const src = source("src/lib/rextora/accountStateStore.ts");
  const balance = src.match(/balanceUsdt:\s*10_254\.32/);
  const available = src.match(/availableBalanceUsdt:\s*10_012\.1/);
  const writeStore = /writeJsonStore|writeFileSync|persist/.test(
    src.replace(/resetAccountStateForTests[\s\S]*?^}/m, ""),
  );
  return {
    file: "src/lib/rextora/accountStateStore.ts",
    processStartBalanceUsdt: PROCESS_START_BALANCE_USDT,
    processStartAvailableUsdt: PROCESS_START_AVAILABLE_USDT,
    initializerPresent: Boolean(balance && available),
    applyPaperRealizedPnlMutatesMemory: src.includes("accountState.balanceUsdt + deltaUsdt"),
    noAccountFileWrite:
      !src.includes("writeJsonStore") &&
      !src.includes("positions.json") &&
      !/fs\.writeFileSync/.test(src),
    writeStoreMentionedOutsideTests: writeStore,
  };
}

export function paperProductionWarmupRequiredBars(emaSlow: number): number {
  return Math.max(50, Number(emaSlow ?? 50) + 5);
}

export function paperProductionGateBlocks(candleCount: number, emaSlow: number): boolean {
  return candleCount < paperProductionWarmupRequiredBars(emaSlow);
}

export function promotedPatternPaperRequiredBars(): number {
  return paperProductionWarmupRequiredBars(CONTEXT_FALLBACK_PARAMS.ema_slow);
}

export function isolateA834(): {
  paper: string;
  data: string;
  cleanup: () => void;
} {
  const iso = installIsolatedStrategyStore();
  ensureStrategyStore();
  const paper = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a834-paper-"));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a834-data-"));
  process.env.REXTORA_PAPER_SESSIONS_DIR = paper;
  process.env.REXTORA_DATA_DIR = data;
  invalidateJsonStoreCache();
  savePaperPositions([]);
  savePaperOrders([]);
  resetUnifiedTradeResultsForTests([]);
  resetAccountStateForTests({
    balanceUsdt: ISOLATED_START_BALANCE,
    availableBalanceUsdt: ISOLATED_START_BALANCE,
  });
  return {
    paper,
    data,
    cleanup: () => {
      iso.cleanup();
      delete process.env.REXTORA_PAPER_SESSIONS_DIR;
      delete process.env.REXTORA_DATA_DIR;
      invalidateJsonStoreCache();
      fs.rmSync(paper, { recursive: true, force: true });
      fs.rmSync(data, { recursive: true, force: true });
    },
  };
}

/**
 * Closest production restart boundary without injecting the post-trade balance:
 * re-apply the accountStateStore module initializer, then drop jsonStore cache
 * so the next load goes through production readers.
 */
export function simulateProcessRestartBoundary(): void {
  resetAccountStateForTests({
    mode: "PAPER",
    balanceUsdt: PROCESS_START_BALANCE_USDT,
    availableBalanceUsdt: PROCESS_START_AVAILABLE_USDT,
    positions: [],
    openOrders: [],
    lastSyncAt: null,
    source: "mock",
    userStreamConnected: false,
    userStreamLastEventAt: null,
    initialSeedUsdt: null,
  });
  invalidateJsonStoreCache();
}

export function entryWindow() {
  return buildObLongCandles().slice(0, 29);
}

export function lastOpen(candles: ReturnType<typeof entryWindow>): number {
  return candles[candles.length - 1].openTime;
}

export function nowAfter(
  candles: Array<{ closeTime?: number; openTime: number }>,
  extra = 0,
): number {
  const last = candles[candles.length - 1];
  return (last.closeTime ?? last.openTime + 900_000) + 1 + extra;
}

export function openCanonical(overrides?: {
  costModel?: EventSequenceCostModel;
  applyFunding?: boolean;
  applySpread?: boolean;
  strategyId?: string;
}): {
  def: ReturnType<typeof patternDefinition>;
  candles: ReturnType<typeof entryWindow>;
  es: ReturnType<typeof evaluateEventSequencePaperSignal>;
  position: Position;
} {
  const def = patternDefinition();
  const candles = entryWindow();
  const costModel =
    overrides?.costModel ?? EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1;
  const es = evaluateEventSequencePaperSignal({
    def,
    symbol: "BTCUSDT",
    candles,
    costModel,
    feeRate: FEE,
    slippageRate: SLIP,
    applyFunding: overrides?.applyFunding ?? true,
    fundingRate: FUNDING,
    applySpread: overrides?.applySpread ?? true,
    spreadRate: SPREAD,
  });
  const position = openEventSequencePaperPosition({
    symbol: "BTCUSDT",
    strategyId: overrides?.strategyId ?? "custom_a834",
    paperSessionId: "paper_test_a834",
    paperStrategyId: overrides?.strategyId ?? "custom_a834",
    strategyName: "A8.3.4",
    paramsHash: "diag_a834",
    def,
    side: es.side === "SHORT" ? "SHORT" : "LONG",
    rawEntryPrice: es.rawEntryPrice!,
    executionEntryPrice: es.entryPrice!,
    stopPrice: es.stopPrice!,
    targetPrice: es.targetPrice!,
    entryCandleOpenTime: es.entryCandleOpenTime ?? lastOpen(candles),
    maxHoldBars: es.maxHoldBars ?? def.risk.maxHoldBars,
    invalidateRule: es.invalidateRule ?? "close_beyond_zone",
    geo: {
      patternType: es.patternType ?? "order_block",
      zoneHigh: es.zoneHigh ?? es.entryPrice!,
      zoneLow: es.zoneLow ?? es.entryPrice!,
      creationBar: es.creationBar ?? es.entryBar ?? candles.length - 1,
    },
    costModel,
    costAssumptions: {
      ...ASSUMPTIONS,
      applyFunding: overrides?.applyFunding ?? true,
      applySpread: overrides?.applySpread ?? true,
    },
    timeframe: "15m",
    leverage: es.leverage ?? 1,
  });
  return { def, candles, es, position };
}

export function tpBar(
  candles: ReturnType<typeof entryWindow>,
  targetPrice: number,
) {
  const last = candles[candles.length - 1];
  return candle(
    candles.length,
    last.close,
    targetPrice + 1,
    last.close - 0.05,
    targetPrice + 0.2,
  );
}

export function mildNextBar(
  candles: Array<{ close: number }>,
  index: number,
) {
  const last = candles[candles.length - 1] as { close: number };
  return candle(
    index,
    last.close,
    last.close + 0.08,
    last.close - 0.08,
    last.close + 0.03,
  );
}

export function snapshotEsContinuity(position: Position) {
  const st = position.eventSequencePaper;
  return {
    paperLifecycleModel: position.paperLifecycleModel,
    costModel: st?.costModel ?? null,
    feeRate: st?.feeRate ?? null,
    slippageRate: st?.slippageRate ?? null,
    fundingRate: st?.fundingRate ?? null,
    applyFunding: st?.applyFunding ?? null,
    applySpread: st?.applySpread ?? null,
    spreadRate: st?.spreadRate ?? null,
    strategyId: st?.strategyId ?? null,
    rawEntryPrice: st?.rawEntryPrice ?? null,
    executionEntryPrice: st?.executionEntryPrice ?? null,
    stopPrice: st?.stop ?? null,
    targetPrice: st?.tp ?? null,
    entryCandleOpenTime: st?.entryCandleOpenTime ?? null,
    lastProcessedCandleOpenTime: st?.lastProcessedCandleOpenTime ?? null,
    barsHeld: position.barsHeld ?? null,
    maxHoldBars: st?.maxHoldBars ?? null,
    leverage: position.leverage,
    margin: position.margin,
    quantity: position.quantity,
    invalidateRule: st?.invalidateRule ?? null,
    geo: st?.geo ?? null,
    settlementId: st?.settlementId ?? null,
  };
}

export function prepareIsolatedActiveSession(): PaperSession {
  const created = createStrategy({
    name: "A834 session",
    description: "engineCostModel=event_sequence_execution_price_v1",
    strategyType: "condition_builder",
    definition: patternDefinition(),
    sourceParamsHash: "a834",
  });
  const prepared = preparePaperSession({
    strategyId: created.id,
    requireApproval: false,
  });
  return activatePaperSession(prepared.id);
}

export async function closeOneCanonicalTrade() {
  const session = prepareIsolatedActiveSession();
  const opened = openCanonical();
  const closeCandle = tpBar(opened.candles, opened.es.targetPrice ?? 110);
  const window = [...opened.candles, closeCandle];
  await manageEventSequencePaperPositions({
    candlesBySymbol: { BTCUSDT: window },
    nowMs: nowAfter(window),
  });
  const engine = runEventSequenceBacktest({
    def: opened.def,
    symbol: "BTCUSDT",
    candles: window,
    balance: ISOLATED_START_BALANCE,
    feeRate: FEE,
    slippageRate: SLIP,
    costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    applyFunding: true,
    fundingRate: FUNDING,
    applySpread: true,
    spreadRate: SPREAD,
  });
  const esTrade = engine.trades.find((t) => t.entryBar === opened.candles.length - 1);
  return {
    session,
    opened,
    window,
    netPnl: esTrade?.netPnlUsdt ?? null,
    runtimeBalance: getAccountState().balanceUsdt,
    sessionRealizedPnl: getPaperSession(session.id)?.realizedPnl ?? null,
    virtualBalance: getPaperSession(session.id)?.virtualBalance ?? null,
  };
}

export function readSessionFromDisk(root: string, id: string): PaperSession {
  const fp = path.join(root, `${id}.json`);
  return JSON.parse(fs.readFileSync(fp, "utf8")) as PaperSession;
}

export function familyHistoryRequirements() {
  const walkerFloorCandles = ES_WALKER_WARMUP_BARS + 1;
  const paperSignalFloor = ES_PAPER_SIGNAL_MIN_CANDLES;
  const lookbackDefault = 40;
  const rows = [
    {
      PATTERN_FAMILY: "order_block",
      DETECTOR_MIN_BARS: 6,
      REASON: "detectOrderBlocks returns empty when bar < 5; first evaluable bar index 5",
      SOURCE: "src/lib/rextora/strategy/conditions/orderBlock.ts:155",
    },
    {
      PATTERN_FAMILY: "fvg",
      DETECTOR_MIN_BARS: 3,
      REASON: "detectFvg returns no-hit when bar < 2; 3-candle imbalance",
      SOURCE: "src/lib/rextora/strategy/conditions/fvg.ts:39",
    },
    {
      PATTERN_FAMILY: "trendline",
      DETECTOR_MIN_BARS: 11,
      REASON: "detectTrendLine returns no-hit when bar < 10; pivots use lookback 3",
      SOURCE: "src/lib/rextora/strategy/conditions/trendLine.ts:49",
    },
    {
      PATTERN_FAMILY: "support_resistance",
      DETECTOR_MIN_BARS: lookbackDefault + 3,
      REASON: `detectSupportResistance requires bar >= lookback + 2; ES lookback default ${lookbackDefault}`,
      SOURCE:
        "src/lib/rextora/strategy/conditions/supportResistance.ts:38 + eventSequenceBacktest.ts:582",
    },
    {
      PATTERN_FAMILY: "supply_demand",
      DETECTOR_MIN_BARS: 4,
      REASON: "detectSupplyDemand requires bar >= baseCandleCount + 1; default baseCandleCount=2",
      SOURCE: "src/lib/rextora/strategy/conditions/supplyDemand.ts:38 + eventSequenceBacktest.ts:877",
    },
  ] as const;
  return rows.map((row) => ({
    ...row,
    WALKER_FLOOR_CANDLES: walkerFloorCandles,
    PAPER_SIGNAL_FLOOR_CANDLES: paperSignalFloor,
    RESEARCH_MIN_CANDLES: Math.max(row.DETECTOR_MIN_BARS, walkerFloorCandles),
    PAPER_SIGNAL_MIN_CANDLES: Math.max(row.DETECTOR_MIN_BARS, paperSignalFloor),
  }));
}

export function warmupSourceFacts() {
  const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
  const resolver = source("src/lib/rextora/execution/paperStrategyResolver.ts");
  const es = source("src/lib/rextora/strategy/eventSequenceBacktest.ts");
  const life = source("src/lib/rextora/paper/paperEventSequenceLifecycle.ts");
  const account = source("src/lib/rextora/accountStateStore.ts");
  const warmupIdx = loop.indexOf("Math.max(50, Number(params.ema_slow ?? 50) + 5)");
  const entryWarmupIdx = loop.indexOf("const warmUp =");
  const manageEsIdx = loop.indexOf("manageEventSequencePaperPositions");
  const familyDispatchIdx = loop.indexOf('} else if (executionKind === "event_sequence" && strategy.definition)');
  const resolveIdx = loop.indexOf("resolved = resolvePaperExecutionStrategy()");
  return {
    loopFile: "src/lib/rextora/execution/safePaperLoop.ts",
    function: "runSafePaperScanLoop",
    condition: "candles.length < warmUp",
    warmUpExpression: "Math.max(50, Number(params.ema_slow ?? 50) + 5)",
    warmupBeforeFamilyDispatch:
      entryWarmupIdx >= 0 && familyDispatchIdx >= 0 && entryWarmupIdx < familyDispatchIdx,
    resolveBeforeWarmup: resolveIdx >= 0 && entryWarmupIdx > resolveIdx,
    manageEsBeforeWarmup: manageEsIdx >= 0 && manageEsIdx < entryWarmupIdx,
    paperSignalMin:
      es.includes("getEventSequenceMinimumHistoryBars") ||
      es.includes("if (input.candles.length < 25)"),
    walkerWarmup:
      es.includes("EVENT_SEQUENCE_WALKER_WARMUP_BARS") ||
      es.includes("const warmUp = 20"),
    resolverFile: "src/lib/rextora/execution/paperStrategyResolver.ts",
    resolverHasExecutionKind: resolver.includes('executionKind = "event_sequence"'),
    lifecycleHasWarmupGate: /ema_slow|warmUp/.test(life),
    accountHasPersist: account.includes("writeJsonStore"),
  };
}

export function signalCoverageFixture() {
  const candles = entryWindow();
  const def = patternDefinition();
  const research = runEventSequenceBacktest({
    def,
    symbol: "BTCUSDT",
    candles,
    balance: ISOLATED_START_BALANCE,
    feeRate: FEE,
    slippageRate: SLIP,
    costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    applyFunding: true,
    fundingRate: FUNDING,
    applySpread: true,
    spreadRate: SPREAD,
  });
  const paper = evaluateEventSequencePaperSignal({
    def,
    symbol: "BTCUSDT",
    candles,
    costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    feeRate: FEE,
    slippageRate: SLIP,
    applyFunding: true,
    fundingRate: FUNDING,
    applySpread: true,
    spreadRate: SPREAD,
  });
  const paperRequired = promotedPatternPaperRequiredBars();
  const esRequired = ES_PAPER_SIGNAL_MIN_CANDLES;
  return {
    candleCount: candles.length,
    lastBarEntry: research.trades.some((t) => t.entryBar === candles.length - 1),
    researchTradeCount: research.trades.length,
    paperSignalPassed: paper.passed && paper.side !== "NONE",
    paperProductionBlocked: paperProductionGateBlocks(candles.length, CONTEXT_FALLBACK_PARAMS.ema_slow),
    esRequiredBars: esRequired,
    walkerFirstEvaluableCandles: ES_WALKER_WARMUP_BARS + 1,
    currentPaperRequiredBars: paperRequired,
    excessWarmupBars: paperRequired - esRequired,
    blockedRange: `[${esRequired}, ${paperRequired})`,
    blockedCandleCount: paperRequired - esRequired,
  };
}

export const LEDGER_V0 = EVENT_SEQUENCE_COST_MODEL_LEDGER_V0;
export const EXECUTION_PRICE_V1 = EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1;
