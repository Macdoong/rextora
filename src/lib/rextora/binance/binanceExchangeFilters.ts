import type { BinanceExchangeInfo, BinanceExchangeSymbol } from "./binanceTypes";

export interface SymbolFilters {
  quantityPrecision: number;
  pricePrecision: number;
  stepSize: number;
  tickSize: number;
  minQty: number;
  minNotional: number;
}

export function getSymbolInfo(symbol: string, exchangeInfo: BinanceExchangeInfo): BinanceExchangeSymbol | undefined {
  return exchangeInfo.symbols.find((s) => s.symbol === symbol.toUpperCase() && s.status === "TRADING");
}

export function extractSymbolFilters(symbolInfo: BinanceExchangeSymbol): SymbolFilters {
  const lot = symbolInfo.filters.find((f) => f.filterType === "LOT_SIZE" || f.filterType === "MARKET_LOT_SIZE");
  const price = symbolInfo.filters.find((f) => f.filterType === "PRICE_FILTER");
  const minNotional = symbolInfo.filters.find((f) => f.filterType === "MIN_NOTIONAL");
  return {
    quantityPrecision: symbolInfo.quantityPrecision,
    pricePrecision: symbolInfo.pricePrecision,
    stepSize: Number((lot as { stepSize?: string })?.stepSize ?? "0.001"),
    tickSize: Number((price as { tickSize?: string })?.tickSize ?? "0.01"),
    minQty: Number((lot as { minQty?: string })?.minQty ?? "0.001"),
    minNotional: Number((minNotional as { notional?: string })?.notional ?? "5")
  };
}

function floorToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const precision = Math.max(0, (step.toString().split(".")[1] ?? "").length);
  const normalized = Math.floor(value / step) * step;
  return Number(normalized.toFixed(precision));
}

export function normalizeQuantity(quantity: number, filters: SymbolFilters): number {
  const normalized = floorToStep(Math.max(filters.minQty, quantity), filters.stepSize);
  return Number(normalized.toFixed(filters.quantityPrecision));
}

export function normalizePrice(price: number, filters: SymbolFilters): number {
  const normalized = floorToStep(price, filters.tickSize);
  return Number(normalized.toFixed(filters.pricePrecision));
}

export function validateOrderNotional(quantity: number, price: number, filters: SymbolFilters): boolean {
  return quantity * price >= filters.minNotional;
}
