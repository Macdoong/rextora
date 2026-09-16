/**
 * SAFE Backtest execution-price slippage (MODEL A / execution_price_v1).
 * Trigger logic does not belong here — fills only.
 */

export type SlippageSide = "long" | "short";
export type SlippageAction = "entry" | "exit";

export const SLIPPAGE_MODEL_EXECUTION_PRICE_V1 = "execution_price_v1" as const;
export const SLIPPAGE_MODEL_LEGACY_V0 = "legacy_v0" as const;

export type SlippageModelVersion =
  | typeof SLIPPAGE_MODEL_EXECUTION_PRICE_V1
  | typeof SLIPPAGE_MODEL_LEGACY_V0;

export function resolveSlippageModelVersion(
  value?: string | null,
): SlippageModelVersion {
  return value === SLIPPAGE_MODEL_EXECUTION_PRICE_V1
    ? SLIPPAGE_MODEL_EXECUTION_PRICE_V1
    : SLIPPAGE_MODEL_LEGACY_V0;
}

export function isExecutionPriceSlippageV1(
  value?: string | null,
): boolean {
  return resolveSlippageModelVersion(value) === SLIPPAGE_MODEL_EXECUTION_PRICE_V1;
}

export function applyAdverseSlippage(input: {
  side: SlippageSide;
  action: SlippageAction;
  rawPrice: number;
  slippageRate: number;
}): number {
  const { rawPrice, slippageRate, side, action } = input;
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
    throw new Error("applyAdverseSlippage: rawPrice must be finite and > 0");
  }
  if (!Number.isFinite(slippageRate) || slippageRate < 0) {
    throw new Error("applyAdverseSlippage: slippageRate must be finite and >= 0");
  }
  const long = side === "long";
  if (action === "entry") {
    return long ? rawPrice * (1 + slippageRate) : rawPrice * (1 - slippageRate);
  }
  return long ? rawPrice * (1 - slippageRate) : rawPrice * (1 + slippageRate);
}

export function toSlippageSide(side: "LONG" | "SHORT"): SlippageSide {
  return side === "LONG" ? "long" : "short";
}

export function tradeCostSplit(
  t: {
    feeCostUsdt?: number;
    spreadCostUsdt?: number;
    fundingCostUsdt?: number;
    slippageCostUsdt?: number;
  },
  slippageModelVersion?: string | null,
): {
  deductedUsdt: number;
  attributionUsdt: number;
  economicFrictionUsdt: number;
} {
  const fee = t.feeCostUsdt ?? 0;
  const spread = t.spreadCostUsdt ?? 0;
  const funding = t.fundingCostUsdt ?? 0;
  const attributionUsdt = t.slippageCostUsdt ?? 0;
  const economicFrictionUsdt = fee + attributionUsdt + spread + funding;
  const deductedUsdt = isExecutionPriceSlippageV1(slippageModelVersion)
    ? fee + spread + funding
    : economicFrictionUsdt;
  return { deductedUsdt, attributionUsdt, economicFrictionUsdt };
}
