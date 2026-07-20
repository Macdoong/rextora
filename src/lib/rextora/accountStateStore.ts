import type { BinanceExchangeSymbol, BinancePositionRisk } from "./binance/binanceTypes";

export interface AccountPosition {
  symbol: string;
  side: "LONG" | "SHORT" | "FLAT";
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  updatedAt: string;
}

export interface AccountOrder {
  orderId: number;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  status: string;
  quantity: number;
  price: number;
  stopPrice?: number;
  reduceOnly: boolean;
  updatedAt: string;
}

export interface AccountState {
  mode: "PAPER" | "LIVE";
  balanceUsdt: number;
  availableBalanceUsdt: number;
  positions: AccountPosition[];
  openOrders: AccountOrder[];
  lastSyncAt: string | null;
  source: "mock" | "binance" | "user_stream" | "polling";
  userStreamConnected: boolean;
  userStreamLastEventAt: string | null;
  initialSeedUsdt: number | null;
}

let accountState: AccountState = {
  mode: "PAPER",
  balanceUsdt: 10_254.32,
  availableBalanceUsdt: 10_012.1,
  positions: [],
  openOrders: [],
  lastSyncAt: null,
  source: "mock",
  userStreamConnected: false,
  userStreamLastEventAt: null,
  initialSeedUsdt: null
};

export function getAccountState(): AccountState {
  return accountState;
}

export function initializeSeed(seed: number): void {
  accountState = { ...accountState, initialSeedUsdt: seed };
}

export function setAccountMode(mode: "PAPER" | "LIVE"): void {
  accountState = { ...accountState, mode };
}

export function updateAccountFromBinance(input: {
  balanceUsdt: number;
  availableBalanceUsdt: number;
  positions: BinancePositionRisk[];
  source: AccountState["source"];
}): AccountState {
  accountState = {
    ...accountState,
    balanceUsdt: input.balanceUsdt,
    availableBalanceUsdt: input.availableBalanceUsdt,
    positions: input.positions
      .filter((p) => Math.abs(Number(p.positionAmt)) > 0)
      .map((p) => ({
        symbol: p.symbol,
        side: Number(p.positionAmt) > 0 ? "LONG" : "SHORT",
        quantity: Math.abs(Number(p.positionAmt)),
        entryPrice: Number(p.entryPrice),
        markPrice: Number(p.markPrice),
        unrealizedPnl: Number(p.unRealizedProfit),
        leverage: Number(p.leverage),
        updatedAt: new Date().toISOString()
      })),
    lastSyncAt: new Date().toISOString(),
    source: input.source
  };
  return accountState;
}

export function updateOpenOrders(orders: AccountOrder[]): AccountState {
  accountState = { ...accountState, openOrders: orders, lastSyncAt: new Date().toISOString() };
  return accountState;
}

export function setUserStreamStatus(connected: boolean): void {
  accountState = {
    ...accountState,
    userStreamConnected: connected,
    userStreamLastEventAt: connected ? new Date().toISOString() : accountState.userStreamLastEventAt
  };
}

export function touchUserStreamEvent(): void {
  accountState = { ...accountState, userStreamLastEventAt: new Date().toISOString() };
}

export function getSymbolFilter(symbol: string, exchangeInfo?: { symbols: BinanceExchangeSymbol[] }) {
  const info = exchangeInfo?.symbols.find((s) => s.symbol === symbol);
  if (!info) return null;
  const lot = info.filters.find((f) => f.filterType === "LOT_SIZE" || f.filterType === "MARKET_LOT_SIZE");
  const price = info.filters.find((f) => f.filterType === "PRICE_FILTER");
  const minNotional = info.filters.find((f) => f.filterType === "MIN_NOTIONAL");
  return {
    quantityPrecision: info.quantityPrecision,
    pricePrecision: info.pricePrecision,
    stepSize: Number((lot as { stepSize?: string })?.stepSize ?? "0.001"),
    tickSize: Number((price as { tickSize?: string })?.tickSize ?? "0.01"),
    minQty: Number((lot as { minQty?: string })?.minQty ?? "0.001"),
    minNotional: Number((minNotional as { notional?: string })?.notional ?? "5")
  };
}
