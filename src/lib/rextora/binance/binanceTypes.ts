/** Shared Binance USDT-M Futures API type shapes used across the read-only and trade clients. */

export interface BinanceTicker24hr {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
  openPrice: string;
  weightedAvgPrice: string;
}

export type BinanceKline = [
  number, // open time
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time
  string, // quote asset volume
  number, // number of trades
  string, // taker buy base volume
  string, // taker buy quote volume
  string // ignore
];

export interface BinanceBookTicker {
  symbol: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
}

export interface BinancePremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  interestRate: string;
}

export interface BinanceExchangeSymbol {
  symbol: string;
  status: string;
  quoteAsset: string;
  contractType: string;
  pricePrecision: number;
  quantityPrecision: number;
  filters: Array<{ filterType: string; [key: string]: unknown }>;
}

export interface BinanceExchangeInfo {
  symbols: BinanceExchangeSymbol[];
}

export interface BinanceFuturesBalance {
  accountAlias: string;
  asset: string;
  balance: string;
  availableBalance: string;
  crossWalletBalance: string;
}

export interface BinanceFuturesAccountInfo {
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  totalMarginBalance: string;
  availableBalance: string;
  positions: Array<{
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    unrealizedProfit: string;
    leverage: string;
    positionSide: string;
  }>;
  canTrade: boolean;
}

export interface BinancePositionRisk {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  leverage: string;
  positionSide: string;
}

export interface BinanceOrderResponse {
  orderId: number;
  symbol: string;
  status: string;
  side: "BUY" | "SELL";
  type: string;
  origQty: string;
  price: string;
  stopPrice?: string;
  reduceOnly?: boolean;
  closePosition?: boolean;
}

export interface BinanceListenKeyResponse {
  listenKey: string;
}

export interface BinanceApiError {
  code: number;
  msg: string;
}

export type BinanceOrderSide = "BUY" | "SELL";
export type BinanceOrderType = "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
export type BinancePositionSide = "LONG" | "SHORT" | "BOTH";
