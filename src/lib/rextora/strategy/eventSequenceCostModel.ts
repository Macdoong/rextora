/**
 * Versioned Event-Sequence cost accounting (P3-A8.2).
 *
 * Does not change Pattern signal/trigger/trade-selection logic.
 * Direct callers that omit costModel resolve to ledger_v0 (legacy).
 */

import {
  applyAdverseSlippage,
  toSlippageSide,
} from "../backtest/executionSlippage";

export const EVENT_SEQUENCE_COST_MODEL_LEDGER_V0 =
  "event_sequence_ledger_v0" as const;
export const EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1 =
  "event_sequence_execution_price_v1" as const;

export type EventSequenceCostModel =
  | typeof EVENT_SEQUENCE_COST_MODEL_LEDGER_V0
  | typeof EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1;

export function resolveEventSequenceCostModel(
  value?: string | null,
): EventSequenceCostModel {
  return value === EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1
    ? EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1
    : EVENT_SEQUENCE_COST_MODEL_LEDGER_V0;
}

export function isEventSequenceExecutionPriceV1(
  value?: string | null,
): boolean {
  return (
    resolveEventSequenceCostModel(value) ===
    EVENT_SEQUENCE_COST_MODEL_EXECUTION_PRICE_V1
  );
}

function signedPriceReturn(
  side: "LONG" | "SHORT",
  entry: number,
  exit: number,
): number {
  return side === "LONG" ? (exit - entry) / entry : (entry - exit) / entry;
}

export interface EventSequenceCloseSettlement {
  costModel: EventSequenceCostModel;
  rawEntryPrice: number;
  rawExitPrice: number;
  executionEntryPrice: number;
  executionExitPrice: number;
  fillEntryPrice: number;
  fillExitPrice: number;
  unslippedReturn: number;
  executionReturn: number;
  grossReturn: number;
  feePct: number;
  slipLedgerPct: number;
  fundingPct: number;
  spreadPct: number;
  pnlUnit: number;
  pnlPct: number;
  marginUsdt: number;
  quantity: number;
  feeCostUsdt: number;
  slippageCostUsdt: number;
  slippageAttributionUsdt: number;
  slippagePct: number;
  spreadCostUsdt: number;
  fundingCostUsdt: number;
  grossPnlUsdt: number;
  netPnlUsdt: number;
}

export function settleEventSequenceClose(input: {
  side: "LONG" | "SHORT";
  rawEntryPrice: number;
  rawExitPrice: number;
  feeRate: number;
  slippageRate: number;
  leverage: number;
  equityBefore: number;
  baseBalancePct: number;
  costModel?: string | null;
  applyFunding?: boolean;
  fundingRate?: number;
  applySpread?: boolean;
  spreadRate?: number;
}): EventSequenceCloseSettlement {
  const costModel = resolveEventSequenceCostModel(input.costModel);
  const canonical = isEventSequenceExecutionPriceV1(costModel);
  const rawEntryPrice = input.rawEntryPrice;
  const rawExitPrice = input.rawExitPrice;
  const executionEntryPrice = applyAdverseSlippage({
    side: toSlippageSide(input.side),
    action: "entry",
    rawPrice: rawEntryPrice,
    slippageRate: input.slippageRate,
  });
  const executionExitPrice = applyAdverseSlippage({
    side: toSlippageSide(input.side),
    action: "exit",
    rawPrice: rawExitPrice,
    slippageRate: input.slippageRate,
  });
  const unslippedReturn = signedPriceReturn(
    input.side,
    rawEntryPrice,
    rawExitPrice,
  );
  const executionReturn = signedPriceReturn(
    input.side,
    executionEntryPrice,
    executionExitPrice,
  );
  const feePct = input.feeRate * 2;
  const slipLedgerPct = canonical ? 0 : input.slippageRate * 2;
  const fundingPct =
    canonical && input.applyFunding ? (input.fundingRate ?? 0) : 0;
  const spreadPct =
    canonical && input.applySpread ? (input.spreadRate ?? 0) : 0;
  const grossReturn = canonical ? executionReturn : unslippedReturn;
  const pnlUnit = grossReturn - feePct - slipLedgerPct - fundingPct - spreadPct;
  const pnlPct = pnlUnit * input.leverage;
  const fillEntryPrice = canonical ? executionEntryPrice : rawEntryPrice;
  const fillExitPrice = canonical ? executionExitPrice : rawExitPrice;
  const margin = Math.max(0, input.equityBefore * input.baseBalancePct);
  const quantity =
    margin > 0 && fillEntryPrice > 0
      ? (margin * input.leverage) / fillEntryPrice
      : 0;
  const feeCostUsdt = margin * feePct * input.leverage;
  const fundingCostUsdt = margin * fundingPct * input.leverage;
  const spreadCostUsdt = margin * spreadPct * input.leverage;
  const unslippedGrossUsdt = margin * unslippedReturn * input.leverage;
  const executionGrossUsdt = margin * executionReturn * input.leverage;
  const slippageAttributionUsdt = unslippedGrossUsdt - executionGrossUsdt;
  const slippageCostUsdt = canonical
    ? slippageAttributionUsdt
    : margin * slipLedgerPct * input.leverage;
  const grossPnlUsdt = margin * grossReturn * input.leverage;
  const netPnlUsdt = margin * pnlPct;
  const notional = margin * input.leverage;
  const slippagePct = canonical
    ? notional > 0
      ? slippageAttributionUsdt / notional
      : 0
    : slipLedgerPct;
  return {
    costModel,
    rawEntryPrice,
    rawExitPrice,
    executionEntryPrice,
    executionExitPrice,
    fillEntryPrice,
    fillExitPrice,
    unslippedReturn,
    executionReturn,
    grossReturn,
    feePct,
    slipLedgerPct,
    fundingPct,
    spreadPct,
    pnlUnit,
    pnlPct,
    marginUsdt: Number(margin.toFixed(6)),
    quantity: Number(quantity.toFixed(8)),
    feeCostUsdt: Number(feeCostUsdt.toFixed(6)),
    slippageCostUsdt: Number(slippageCostUsdt.toFixed(6)),
    slippageAttributionUsdt: Number(slippageAttributionUsdt.toFixed(6)),
    slippagePct: canonical ? Number(slippagePct.toFixed(8)) : slipLedgerPct,
    spreadCostUsdt: Number(spreadCostUsdt.toFixed(6)),
    fundingCostUsdt: Number(fundingCostUsdt.toFixed(6)),
    grossPnlUsdt: Number(grossPnlUsdt.toFixed(6)),
    netPnlUsdt: Number(netPnlUsdt.toFixed(6)),
  };
}
