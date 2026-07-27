/**
 * Trade event trace for chart explanation — derived from verified backtest fields.
 * Does not invent intrabar events beyond what the engine stored.
 */

import type { BacktestTrade } from "../backtest/backtestEngine";
import type {
  EvidenceScalar,
  PatternBlockEvidence,
  PatternLineAnchor,
} from "../strategy/eventSequenceBacktest";

export const TRADE_EVENT_TRACE_VERSION = 1 as const;

/** Zone-width ratio from measurePenetration → operator-facing Korean label. */
export function formatPenetrationKo(penetrationPct: number): string {
  if (!Number.isFinite(penetrationPct)) return "침투 데이터 없음";
  if (penetrationPct <= 1.0001) {
    return `침투 ${(penetrationPct * 100).toFixed(0)}%`;
  }
  return `존 대비 ${penetrationPct.toFixed(2)}배`;
}

export type TradeEventKind =
  | "entry"
  | "exit"
  | "stop"
  | "target"
  | "max_hold"
  | "signal"
  | "rejected";

export interface TradeEventTraceItem {
  kind: TradeEventKind;
  at: string | null;
  price: number | null;
  labelKo: string;
  detailKo: string | null;
}

export interface TradeEventTrace {
  version: typeof TRADE_EVENT_TRACE_VERSION;
  tradeId: string;
  symbol: string;
  timeframe: string | null;
  direction: "LONG" | "SHORT" | string;
  entry: TradeEventTraceItem;
  exit: TradeEventTraceItem;
  stopPrice: number | null;
  targetPrice: number | null;
  exitReason: string | null;
  grossPnl: number | null;
  fee: number | null;
  slippage: number | null;
  netPnl: number | null;
  holdingDurationMs: number | null;
  assumptionsKo: string[];
  events: TradeEventTraceItem[];
  whyEnteredKo: string;
  whyExitedKo: string;
  feeSlippageImpactKo: string;
  /** Optional pattern geometry — only when present on the trade record. */
  patternType?: string | null;
  zoneHigh?: number | null;
  zoneLow?: number | null;
  lineAnchors?: PatternLineAnchor[] | null;
  creationCandleTime?: string | null;
  revisitCandleTime?: string | null;
  confirmationCandleTime?: string | null;
  breakCandleTime?: string | null;
  invalidationCandleTime?: string | null;
  creationBar?: number | null;
  revisitBar?: number | null;
  confirmationBar?: number | null;
  breakBar?: number | null;
  invalidationBar?: number | null;
  penetrationPct?: number | null;
  rejectedReasonCode?: string | null;
  /** Multi-pattern combination evidence (additive). */
  patternBlocks?: PatternBlockEvidence[] | null;
  combinationOperator?: string | null;
  combinationResult?: boolean | null;
  combinationScore?: number | null;
  combinationPriority?: number | null;
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function asLineAnchors(
  v: unknown,
): PatternLineAnchor[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: PatternLineAnchor[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const bar = asNum((item as { bar?: unknown }).bar);
    const price = asNum((item as { price?: unknown }).price);
    const time = asStr((item as { time?: unknown }).time);
    if (bar != null && price != null) out.push({ bar, price, time });
  }
  return out.length ? out : null;
}

function asScalarRecord(v: unknown): Record<string, EvidenceScalar> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, EvidenceScalar> = {};
  for (const [key, value] of Object.entries(v)) {
    if (
      value == null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      out[key] = value as EvidenceScalar;
    }
  }
  return out;
}

function asPatternBlock(v: unknown): PatternBlockEvidence | null {
  if (!v || typeof v !== "object") return null;
  const row = v as Record<string, unknown>;
  const family = asStr(row.family);
  if (!family) return null;
  return {
    blockId: String(row.blockId ?? ""),
    family,
    role: String(row.role ?? ""),
    order: asNum(row.order) ?? 0,
    status:
      row.status === "detected" ||
      row.status === "missing" ||
      row.status === "failed" ||
      row.status === "optional_skipped"
        ? row.status
        : "missing",
    patternType: String(row.patternType ?? family),
    zoneHigh: asNum(row.zoneHigh),
    zoneLow: asNum(row.zoneLow),
    creationBar: asNum(row.creationBar),
    creationTime: asStr(row.creationTime),
    revisitBar: asNum(row.revisitBar),
    revisitTime: asStr(row.revisitTime),
    breakBar: asNum(row.breakBar),
    breakTime: asStr(row.breakTime),
    confirmationBar: asNum(row.confirmationBar),
    confirmationTime: asStr(row.confirmationTime),
    invalidationBar: asNum(row.invalidationBar),
    invalidationTime: asStr(row.invalidationTime),
    entryBar: asNum(row.entryBar),
    entryTime: asStr(row.entryTime),
    measured: asNum(row.measured),
    threshold: asNum(row.threshold) ?? asNum(row.required),
    detectorParams: asScalarRecord(row.detectorParams),
    measuredValues: asScalarRecord(row.measuredValues),
    thresholds: asScalarRecord(row.thresholds),
    required:
      typeof row.required === "boolean"
        ? row.required
        : row.required == null
          ? true
          : Boolean(row.required),
    weight: asNum(row.weight) ?? asNum(row.scoreContribution) ?? 1,
    priority: asNum(row.priority) ?? asNum(row.priorityRank) ?? 0,
    operatorPassed:
      typeof row.operatorPassed === "boolean" ? row.operatorPassed : undefined,
    scoreContribution: asNum(row.scoreContribution) ?? undefined,
    scoreTotal: asNum(row.scoreTotal) ?? undefined,
    scoreThreshold: asNum(row.scoreThreshold),
    selectedPriority: asNum(row.selectedPriority),
    operator: asStr(row.operator) ?? undefined,
    stage: asStr(row.stage) ?? asStr(row.evaluationStage) ?? undefined,
    reasonCode: asStr(row.reasonCode),
    touchCount: asNum(row.touchCount),
    lineAnchors: asLineAnchors(row.lineAnchors),
    stopPrice: asNum(row.stopPrice),
    targetPrice: asNum(row.targetPrice),
    exitPrice: asNum(row.exitPrice),
    exitBar: asNum(row.exitBar),
    exitTime: asStr(row.exitTime),
    exitReason: asStr(row.exitReason),
  };
}

/** Build an auditable event trace from a BacktestTrade (no fabricated fields). */
export function buildTradeEventTrace(
  trade: BacktestTrade & Record<string, unknown>,
  opts?: { symbol?: string; timeframe?: string | null },
): TradeEventTrace {
  const entryTime = asStr(trade.entryTime) ?? asStr(trade.openedAt);
  const exitTime = asStr(trade.exitTime) ?? asStr(trade.closedAt);
  const entryPrice = asNum(trade.entryPrice);
  const exitPrice = asNum(trade.exitPrice);
  const fee = asNum(trade.feeUsdt) ?? asNum(trade.fee);
  const slippage = asNum(trade.slippageUsdt) ?? asNum(trade.slippage);
  const net = asNum(trade.netPnlUsdt) ?? asNum(trade.pnl);
  const gross =
    net != null && fee != null && slippage != null
      ? net + fee + slippage
      : asNum(trade.grossPnlUsdt);
  const exitReason = asStr(trade.exitReason);
  const side = String(trade.side ?? trade.direction ?? "LONG");
  const stopPrice =
    asNum(trade.stopPrice) ?? asNum(trade.slPrice) ?? asNum(trade.stopLoss);
  const targetPrice =
    asNum(trade.takeProfitPrice) ??
    asNum(trade.tpPrice) ??
    asNum(trade.takeProfit);

  let holdMs: number | null = null;
  if (entryTime && exitTime) {
    const a = Date.parse(entryTime);
    const b = Date.parse(exitTime);
    if (Number.isFinite(a) && Number.isFinite(b)) holdMs = Math.max(0, b - a);
  }

  const patternType = asStr(trade.patternType);
  const zoneHigh = asNum(trade.zoneHigh);
  const zoneLow = asNum(trade.zoneLow);
  const lineAnchors = asLineAnchors(trade.lineAnchors);
  const creationCandleTime = asStr(trade.creationCandleTime);
  const revisitCandleTime = asStr(trade.revisitCandleTime);
  const confirmationCandleTime = asStr(trade.confirmationCandleTime);
  const breakCandleTime = asStr(trade.breakCandleTime);
  const invalidationCandleTime = asStr(trade.invalidationCandleTime);
  const penetrationPct = asNum(trade.penetrationPct);
  const rejectedReasonCode = asStr(trade.rejectedReasonCode);
  const patternBlocksRaw = trade.patternBlocks;
  const patternBlocks = Array.isArray(patternBlocksRaw)
    ? patternBlocksRaw
        .filter((b) => b && typeof b === "object")
        .map(asPatternBlock)
        .filter((b): b is PatternBlockEvidence => b != null)
    : null;

  const entryReasonPersisted =
    asStr(trade.entryReason) ??
    asStr(trade.entryReasonKo) ??
    asStr(trade.signalReason);
  const entryWhyParts: string[] = [];
  if (entryReasonPersisted) entryWhyParts.push(entryReasonPersisted);
  if (patternType) entryWhyParts.push(`패턴 ${patternType}`);
  if (patternBlocks && patternBlocks.length > 0) {
    entryWhyParts.push(
      `조합 ${patternBlocks
        .map((b) => `${b.family}${b.role ? `(${b.role})` : ""}`)
        .join(" + ")}`,
    );
  }
  if (revisitCandleTime) entryWhyParts.push("리테스트 확인");
  if (confirmationCandleTime) entryWhyParts.push("확인 봉 통과");
  if (penetrationPct != null) {
    entryWhyParts.push(formatPenetrationKo(penetrationPct));
  }
  if (zoneHigh != null && zoneLow != null) {
    entryWhyParts.push(`존 ${zoneLow.toFixed(2)}–${zoneHigh.toFixed(2)}`);
  }
  const sideLabel = side === "SHORT" || side === "short" ? "숏 진입" : "롱 진입";
  const entryDetail =
    entryWhyParts.length > 0
      ? `${sideLabel} · ${entryWhyParts.join(" · ")}`
      : sideLabel;

  const entry: TradeEventTraceItem = {
    kind: "entry",
    at: entryTime,
    price: entryPrice,
    labelKo: "진입",
    detailKo: entryDetail,
  };

  const exitKind: TradeEventKind =
    exitReason?.includes("stop") || exitReason?.includes("SL")
      ? "stop"
      : exitReason?.includes("tp") ||
          exitReason?.includes("target") ||
          exitReason?.includes("TP") ||
          exitReason?.includes("take_profit")
        ? "target"
        : exitReason?.includes("hold") || exitReason?.includes("max")
          ? "max_hold"
          : "exit";

  const exit: TradeEventTraceItem = {
    kind: exitKind,
    at: exitTime,
    price: exitPrice,
    labelKo:
      exitKind === "stop"
        ? "손절"
        : exitKind === "target"
          ? "익절"
          : exitKind === "max_hold"
            ? "최대 보유 청산"
            : "청산",
    detailKo: exitReason,
  };

  const events: TradeEventTraceItem[] = [];
  if (creationCandleTime) {
    events.push({
      kind: "signal",
      at: creationCandleTime,
      price: zoneHigh ?? zoneLow,
      labelKo: "패턴 감지",
      detailKo: patternType,
    });
  }
  if (revisitCandleTime) {
    events.push({
      kind: "signal",
      at: revisitCandleTime,
      price: null,
      labelKo: "리테스트",
      detailKo: penetrationPct != null ? formatPenetrationKo(penetrationPct) : null,
    });
  }
  if (confirmationCandleTime) {
    events.push({
      kind: "signal",
      at: confirmationCandleTime,
      price: null,
      labelKo: "확인",
      detailKo: "확인 봉 통과",
    });
  }
  events.push(entry);
  if (stopPrice != null) {
    events.push({
      kind: "stop",
      at: null,
      price: stopPrice,
      labelKo: "손절 예정가",
      detailKo: null,
    });
  }
  if (targetPrice != null) {
    events.push({
      kind: "target",
      at: null,
      price: targetPrice,
      labelKo: "익절 예정가",
      detailKo: null,
    });
  }
  events.push(exit);

  const feeSlip =
    fee != null || slippage != null
      ? `수수료 ${fee ?? "불가"} · 슬리피지 ${slippage ?? "불가"} (가용 값만 표시)`
      : "수수료·슬리피지 세부 값이 거래 기록에 없습니다.";

  return {
    version: TRADE_EVENT_TRACE_VERSION,
    tradeId: String(trade.id ?? `${entryTime ?? "t"}-${side}`),
    symbol: opts?.symbol ?? String(trade.symbol ?? "UNKNOWN"),
    timeframe: opts?.timeframe ?? null,
    direction: side,
    entry,
    exit,
    stopPrice,
    targetPrice,
    exitReason,
    grossPnl: gross,
    fee,
    slippage,
    netPnl: net,
    holdingDurationMs: holdMs,
    assumptionsKo: [
      "완료 봉(OHLC) 기준으로 체결된 백테스트 가정입니다.",
      "봉 내부 순서가 기록되지 않은 경우 추정하지 않습니다.",
    ],
    events,
    whyEnteredKo: `${entry.detailKo ?? "진입"} @ ${entryPrice ?? "가격 미기록"}`,
    whyExitedKo: exit.detailKo
      ? `${exit.labelKo} (${exit.detailKo})`
      : exit.labelKo,
    feeSlippageImpactKo: feeSlip,
    patternType,
    zoneHigh,
    zoneLow,
    lineAnchors,
    creationCandleTime,
    revisitCandleTime,
    confirmationCandleTime,
    breakCandleTime,
    invalidationCandleTime,
    creationBar: asNum(trade.creationBar),
    revisitBar: asNum(trade.revisitBar),
    confirmationBar: asNum(trade.confirmationBar),
    breakBar: asNum(trade.breakBar),
    invalidationBar: asNum(trade.invalidationBar),
    penetrationPct,
    rejectedReasonCode,
    patternBlocks,
    combinationOperator: asStr(trade.combinationOperator),
    combinationResult:
      typeof trade.combinationResult === "boolean"
        ? trade.combinationResult
        : null,
    combinationScore: asNum(trade.combinationScore),
    combinationPriority: asNum(trade.combinationPriority),
  };
}

export function buildTradeEventTraces(
  trades: Array<BacktestTrade & Record<string, unknown>>,
  opts?: { symbol?: string; timeframe?: string | null },
): TradeEventTrace[] {
  return trades.map((t, index) => {
    const withId =
      t.id != null && String(t.id).trim()
        ? t
        : {
            ...t,
            id: `T${String(index + 1).padStart(4, "0")}`,
          };
    return buildTradeEventTrace(withId, opts);
  });
}
