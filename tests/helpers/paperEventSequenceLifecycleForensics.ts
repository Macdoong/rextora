/**
 * P3-A8.3.2 read-only Paper Event-Sequence closed-trade forensics.
 * Isolated temp stores only. Does not start production Paper/Live.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import { applyAdverseSlippage, toSlippageSide } from "../../src/lib/rextora/backtest/executionSlippage";
import { productionReadonlyHashes } from "../../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import type { OhlcvCandle } from "../../src/lib/rextora/data/ohlcvTypes";
import { computeIndicators } from "../../src/lib/rextora/indicator/indicatorEngine";
import * as marketDataStore from "../../src/lib/rextora/marketDataStore";
import { BINANCE_FUTURES_TAKER_FEE, DEFAULT_SLIPPAGE_RATE, DEFAULT_SPREAD_RATE } from "../../src/lib/rextora/metrics/unifiedCost";
import { loadUnifiedTradeResults, resetUnifiedTradeResultsForTests } from "../../src/lib/rextora/metrics/tradeResultStore";
import { managePaperPositions } from "../../src/lib/rextora/paperExecutionEngine";
import { getOpenPositions } from "../../src/lib/rextora/positionManager";
import { calculateSafeV44Risk } from "../../src/lib/rextora/risk/safeV44RiskEngine";
import { invalidateJsonStoreCache } from "../../src/lib/rextora/storage/jsonStore";
import { savePaperOrders, savePaperPositions } from "../../src/lib/rextora/storage/tradeStore";
import {
  evaluateEventSequencePaperSignal,
  runEventSequenceBacktest,
} from "../../src/lib/rextora/strategy/eventSequenceBacktest";
import {
  EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
  settleEventSequenceClose,
} from "../../src/lib/rextora/strategy/eventSequenceCostModel";
import { mergeSafeParams } from "../../src/lib/rextora/strategy/safeV44Params";
import { recordPaperEntryFromSafe } from "../../src/lib/rextora/tradeLifecycle";
import type { MarketCoin, Position } from "../../src/lib/rextora/types";
import { buildPatternSearchDefinition } from "../../src/lib/rextora/strategySearch/patternEventSequence";
import { ORDER_BLOCK_BASE_PARAMS } from "../../src/lib/rextora/strategySearch/patternSearchSpaces";
import { getAccountState } from "../../src/lib/rextora/accountStateStore";

export const P3A832_ARTIFACT_TS = "2026-09-04T08-25-00-000Z";
export const FEE = 0.0004;
export const SLIP = 0.0002;
export const FUNDING = 0.0001;
export const SPREAD = 0.0001;
const INTERVAL = 15 * 60 * 1000;
const START = Date.UTC(2024, 0, 1);

export function source(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

export function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function patternDefinition(overrides?: Record<string, unknown>) {
  return buildPatternSearchDefinition({
    candidateId: "pending",
    strategyName: "A8.3.2 pattern",
    timeframe: "15m",
    params: { ...ORDER_BLOCK_BASE_PARAMS, minImpulseAtrMult: 1.7, ...overrides },
    family: "order_block",
  })!;
}

export function candle(i: number, o: number, h: number, l: number, c: number): OhlcvCandle {
  return {
    openTime: START + i * INTERVAL,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: 1000,
    closeTime: START + (i + 1) * INTERVAL - 1,
  };
}

export function buildObLongCandles(): OhlcvCandle[] {
  const out: OhlcvCandle[] = [];
  for (let i = 0; i < 24; i += 1) {
    const px = 100 + (i % 3) * 0.05;
    out.push(candle(i, px, px + 0.2, px - 0.2, px + 0.05));
  }
  out.push(candle(24, 100, 100.2, 97.8, 98));
  out.push(candle(25, 98.1, 104.5, 97.9, 104));
  out.push(candle(26, 104, 106.5, 103.5, 106));
  out.push(candle(27, 106, 107.2, 105.5, 107));
  out.push(candle(28, 99.2, 100.3, 98.1, 100.05));
  out.push(candle(29, 100.05, 101.5, 99.8, 101.2));
  out.push(candle(30, 101.2, 112, 100.5, 110));
  return out;
}

function mockCoin(symbol: string, price: number): MarketCoin {
  return {
    symbol,
    price,
    change24hPct: 0,
    volumeChangePct: 0,
    volatility: 0,
    spread: 0,
    fundingFee: 0,
    quoteVolume: 0,
    state: "정상",
    aiScore: 0,
    serviceState: "mock",
  };
}

export function isolatePaperRuntime(): { root: string; cleanup: () => void } {
  const prev = process.env.REXTORA_DATA_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-a832-paper-"));
  process.env.REXTORA_DATA_DIR = root;
  invalidateJsonStoreCache();
  savePaperPositions([]);
  savePaperOrders([]);
  resetUnifiedTradeResultsForTests([]);
  return {
    root,
    cleanup: () => {
      invalidateJsonStoreCache();
      if (prev === undefined) delete process.env.REXTORA_DATA_DIR;
      else process.env.REXTORA_DATA_DIR = prev;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function paperShellParams() {
  const def = patternDefinition();
  return mergeSafeParams({
    sl_atr_mult: def.risk.stopLossAtrMult,
    tp_atr_mult: def.risk.takeProfitAtrMult,
    max_hold_bars: def.risk.maxHoldBars,
  });
}

export function sourceFacts() {
  const loop = source("src/lib/rextora/execution/safePaperLoop.ts");
  const exec = source("src/lib/rextora/execution/safePaperExecution.ts");
  const engine = source("src/lib/rextora/paperExecutionEngine.ts");
  const life = source("src/lib/rextora/tradeLifecycle.ts");
  const result = source("src/lib/rextora/metrics/tradeResult.ts");
  const es = source("src/lib/rextora/strategy/eventSequenceBacktest.ts");
  const live = source("src/lib/rextora/botRuntime.ts");
  const session = source("src/lib/rextora/paper/paperSessionStore.ts");
  const promo = source("src/lib/rextora/strategySearch/promoteFromSearch.ts");
  return {
    loop,
    exec,
    engine,
    life,
    result,
    es,
    live,
    session,
    promo,
    usesEsSignal: loop.includes("evaluateEventSequencePaperSignal"),
    usesSafeRiskAfterEs: loop.includes("calculateSafeV44Risk"),
    usesPatternFillOnly: /patternFillPrice = es\.entryPrice/.test(loop),
    ignoresEsStop: !loop.includes("es.stopPrice"),
    ignoresEsTarget: !loop.includes("es.targetPrice"),
    skipsCostGuardForEs: /executionKind === "event_sequence"[\s\S]*evaluateCostGuard/.test(loop),
    entryOwner: "recordPaperEntryFromSafe",
    positionOwner: "positionManager + paperExecutionEngine.managePaperPositions",
    exitOwner: "managePaperPositions -> recordPaperExit -> buildUnifiedTradeResult",
    liveUsesEsPaper: live.includes("evaluateEventSequencePaperSignal"),
    sessionRealizedWrite: /realizedPnl:\s*0/.test(session) && !/realizedPnl:\s*[^0]/.test(
      session.replace(/realizedPnl:\s*0/g, ""),
    ),
    promotionMergesSafeShell: promo.includes("mergeSafeParams"),
  };
}

type ReplayKind = "tp" | "sl" | "max_hold";

export async function replayPaperClosedTrade(kind: ReplayKind) {
  const iso = isolatePaperRuntime();
  try {
    const def = patternDefinition();
    const entryCandles = buildObLongCandles().slice(0, 29);
    const paper = evaluateEventSequencePaperSignal({
      def,
      symbol: "BTCUSDT",
      candles: entryCandles,
      costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
      feeRate: FEE,
      slippageRate: SLIP,
      applyFunding: true,
      fundingRate: FUNDING,
      applySpread: true,
      spreadRate: SPREAD,
    });
    const params = paperShellParams();
    const series = computeIndicators(entryCandles, params);
    const ind = series.snapshots[entryCandles.length - 1];
    const balance = getAccountState().availableBalanceUsdt || 10_000;
    const risk = calculateSafeV44Risk({
      entryPrice: paper.entryPrice ?? ind.close,
      atr: ind.atr,
      atrPct: ind.atrPct,
      side: paper.side === "SHORT" ? "SHORT" : "LONG",
      signalType: "trend_long",
      balance,
      params,
    });
    const entryOpen = entryCandles[entryCandles.length - 1]?.openTime ?? Date.UTC(2026, 0, 1);
    const intervalMs = 15 * 60_000;
    recordPaperEntryFromSafe({
      symbol: "BTCUSDT",
      side: paper.side === "SHORT" ? "SHORT" : "LONG",
      signalType: "trend_long",
      entryReason: paper.reason,
      score: 1,
      entryPrice: risk.entryPrice,
      stopLoss: risk.stopLossPrice,
      takeProfit: risk.takeProfitPrice,
      leverage: risk.leverage,
      quantity: Math.max(risk.quantity, 0.001),
      margin: risk.marginAmount,
      strategyName: "A8.3.2 pattern",
      paramsHash: "diag_a832",
      trailingDistance: risk.trailingStopDistance,
      maxHoldBars: kind === "max_hold" ? 2 : risk.maxHoldBars,
      entrySignalCandleOpenTime: kind === "max_hold" ? entryOpen : undefined,
      entrySignalIntervalMs: kind === "max_hold" ? intervalMs : undefined,
    });
    const opened = getOpenPositions().find((p) => p.symbol === "BTCUSDT") as Position;
    let spyPrice = risk.entryPrice;
    if (kind === "tp") spyPrice = risk.takeProfitPrice;
    if (kind === "sl") spyPrice = risk.stopLossPrice;
    const spy = vi.spyOn(marketDataStore, "getStoredMarketCoins").mockReturnValue([
      mockCoin("BTCUSDT", spyPrice),
    ]);
    try {
      let lastManage = { checked: 0, closed: 0 };
      const loops = kind === "max_hold" ? 2 : 1;
      for (let i = 0; i < loops; i += 1) {
        lastManage = await managePaperPositions(
          kind === "max_hold"
            ? {
                latestFinalizedBySymbol: {
                  BTCUSDT: {
                    openTime: entryOpen + (i + 1) * intervalMs,
                    intervalMs,
                  },
                },
              }
            : undefined,
        );
      }
      const remaining = getOpenPositions().filter((p) => p.symbol === "BTCUSDT" && p.side !== "Flat");
      const trades = loadUnifiedTradeResults();
      const closed = trades.find((t) => t.symbol === "BTCUSDT") ?? null;
      return {
        paperSignal: paper,
        risk,
        opened: {
          entryPrice: opened?.entryPrice ?? null,
          stopLoss: opened?.stopLoss ?? null,
          takeProfit: opened?.takeProfit ?? null,
          quantity: opened?.quantity ?? null,
          leverage: opened?.leverage ?? null,
          margin: opened?.margin ?? null,
          maxHoldBars: opened?.maxHoldBars ?? null,
          trailingDistance: opened?.trailingDistance ?? null,
        },
        manage: lastManage,
        remainingOpen: remaining.length,
        closed,
        spyPrice,
        esStop: paper.stopPrice,
        esTarget: paper.targetPrice,
        accountBalanceAfter: getAccountState().availableBalanceUsdt,
        accountBalanceUsdt: getAccountState().balanceUsdt,
      };
    } finally {
      spy.mockRestore();
    }
  } finally {
    iso.cleanup();
  }
}

export function replayEventSequenceWindow(kind: ReplayKind) {
  const holdOverride = kind === "max_hold" ? { maxHoldBars: 2 } : {};
  const def = patternDefinition(holdOverride);
  const entryCandles = buildObLongCandles().slice(0, 29);
  const last = entryCandles[entryCandles.length - 1];
  const paper = evaluateEventSequencePaperSignal({
    def,
    symbol: "BTCUSDT",
    candles: entryCandles,
    costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    feeRate: FEE,
    slippageRate: SLIP,
    applyFunding: true,
    fundingRate: FUNDING,
    applySpread: true,
    spreadRate: SPREAD,
  });
  const nextI = entryCandles.length;
  let extra: OhlcvCandle;
  if (kind === "tp") {
    const tp = paper.targetPrice ?? last.close * 1.2;
    extra = candle(nextI, last.close, Math.max(tp + 1, last.close + 5), last.close - 0.1, tp + 0.5);
  } else if (kind === "sl") {
    const sl = paper.stopPrice ?? last.close * 0.8;
    extra = candle(nextI, last.close, last.close + 0.1, Math.min(sl - 1, last.close - 5), sl - 0.5);
  } else {
    extra = candle(nextI, last.close, last.close + 0.05, last.close - 0.05, last.close);
  }
  const candles =
    kind === "max_hold"
      ? [...entryCandles, extra, candle(nextI + 1, extra.close, extra.close + 0.05, extra.close - 0.05, extra.close)]
      : [...entryCandles, extra];
  const backtest = runEventSequenceBacktest({
    def,
    symbol: "BTCUSDT",
    candles,
    balance: 10_000,
    feeRate: FEE,
    slippageRate: SLIP,
    costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
    applyFunding: true,
    fundingRate: FUNDING,
    applySpread: true,
    spreadRate: SPREAD,
  });
  const lastBar = entryCandles.length - 1;
  const trade = backtest.trades.find((t) => t.entryBar === lastBar) ?? backtest.trades[0] ?? null;
  const settlement =
    trade && paper.rawEntryPrice != null
      ? settleEventSequenceClose({
          side: paper.side === "SHORT" ? "SHORT" : "LONG",
          rawEntryPrice: paper.rawEntryPrice,
          rawExitPrice: trade.rawExitPrice ?? trade.exitPrice,
          feeRate: FEE,
          slippageRate: SLIP,
          leverage: trade.leverage,
          equityBefore: 10_000,
          baseBalancePct: def.positionSizing.baseBalancePct,
          costModel: EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1,
          applyFunding: true,
          fundingRate: FUNDING,
          applySpread: true,
          spreadRate: SPREAD,
        })
      : null;
  return {
    paperAtEntry: paper,
    trade,
    endingBalance: backtest.endingBalance,
    tradeCount: backtest.trades.length,
    settlement,
  };
}

export function expectedPaperUnifiedCosts(entryPrice: number, quantity: number) {
  const notional = Math.abs(entryPrice * quantity);
  return {
    fee: Number((notional * BINANCE_FUTURES_TAKER_FEE * 2).toFixed(6)),
    slippage: Number((notional * DEFAULT_SLIPPAGE_RATE * 2).toFixed(6)),
    spread: Number((notional * DEFAULT_SPREAD_RATE).toFixed(6)),
    funding: 0,
    formula:
      "netPnl = (exit-entry)*qty - notional*(feeRate*2 + slippageRate*2 + spreadRate + |fundingRate|); fundingRate defaults to 0; rates from getDefaultCostRates not ES assumptions",
  };
}

export function productionSafetySnapshot() {
  const hashes = productionReadonlyHashes();
  const paperDir = path.join(process.cwd(), "data/rextora/paper-sessions");
  const paperFiles = fs.existsSync(paperDir)
    ? fs.readdirSync(paperDir).filter((f) => f.endsWith(".json"))
    : [];
  return {
    ...hashes,
    strategyIndexSha256: sha256File(
      path.join(process.cwd(), "data/rextora/strategies/index.json"),
    ),
    positionsSha256: sha256File(path.join(process.cwd(), "data/rextora/positions.json")),
    ordersSha256: sha256File(path.join(process.cwd(), "data/rextora/orders.json")),
    unifiedTradesSha256: sha256File(
      path.join(process.cwd(), "data/rextora/unified-trade-results.json"),
    ),
    paperSessionFiles: Object.fromEntries(
      paperFiles.map((f) => [f, sha256File(path.join(paperDir, f))]),
    ),
  };
}

export function expectedExecutionEntry(raw: number, side: "LONG" | "SHORT") {
  return applyAdverseSlippage({
    side: toSlippageSide(side),
    action: "entry",
    rawPrice: raw,
    slippageRate: SLIP,
  });
}

export function expectedExecutionExit(raw: number, side: "LONG" | "SHORT") {
  return applyAdverseSlippage({
    side: toSlippageSide(side),
    action: "exit",
    rawPrice: raw,
    slippageRate: SLIP,
  });
}
