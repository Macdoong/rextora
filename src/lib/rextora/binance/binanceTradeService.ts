import type { LiveExecutionContext } from "../serverTpSlManager";

import { evaluateLiveSafetyGate } from "../liveSafetyGate";

import { signedRequest } from "./binanceHttpClient";

import { toDecimalString } from "./binanceSigner";

import type { BinanceOrderResponse, BinanceOrderSide, BinanceOrderType } from "./binanceTypes";



const ORDER_PATH = ["/fapi", "/v1", "/order"].join("");

const ALGO_ORDER_PATH = ["/fapi", "/v1", "/algoOrder"].join("");

const LEVERAGE_PATH = ["/fapi", "/v1", "/leverage"].join("");

const MARGIN_TYPE_PATH = ["/fapi", "/v1", "/marginType"].join("");



export class LiveTradeBlockedError extends Error {

  constructor(message: string, public readonly blockedReasons: string[]) {

    super(message);

    this.name = "LiveTradeBlockedError";

  }

}



function assertLiveContext(context: LiveExecutionContext | undefined): LiveExecutionContext {

  if (!context) {

    throw new LiveTradeBlockedError("LiveExecutionContext가 필요합니다.", ["LiveExecutionContext missing"]);

  }

  if (context.mode !== "LIVE") {

    throw new LiveTradeBlockedError("PAPER 모드에서는 Binance trade endpoint를 호출할 수 없습니다.", ["PAPER must NEVER call Binance trade endpoints"]);

  }

  if (!context.emergency) {

    const gate = evaluateLiveSafetyGate({
      mode: "LIVE",
      operatorLiveStartRequested: true,
      executionInProgress: true
    });

    if (!gate.passed) {

      throw new LiveTradeBlockedError("LIVE 안전 게이트 미통과", gate.blockedReasons);

    }

    if (!context.liveApproved || !context.preflightPassed || !context.riskPassed) {

      throw new LiveTradeBlockedError("LIVE 실행 컨텍스트 검증 실패", ["live context validation failed"]);

    }

    if (!context.serverTpSlSatisfied) {

      throw new LiveTradeBlockedError("서버 TP/SL 요구사항 미충족", ["server TP/SL required"]);

    }

  }

  return context;

}



export interface PlaceOrderInput {

  symbol: string;

  side: BinanceOrderSide;

  type: BinanceOrderType;

  quantity: number;

  price?: number;

  stopPrice?: number;

  reduceOnly?: boolean;

  closePosition?: boolean;

  quantityPrecision?: number;

  pricePrecision?: number;

}



export async function placeFuturesOrder(input: PlaceOrderInput, context?: LiveExecutionContext): Promise<BinanceOrderResponse> {

  assertLiveContext(context);

  const params: Record<string, string | number | boolean> = {

    symbol: input.symbol,

    side: input.side,

    type: input.type

  };

  if (!input.closePosition) {
    params.quantity = toDecimalString(input.quantity, input.quantityPrecision ?? 3);
  }

  if (input.price !== undefined) params.price = toDecimalString(input.price, input.pricePrecision ?? 2);

  if (input.stopPrice !== undefined) params.stopPrice = toDecimalString(input.stopPrice, input.pricePrecision ?? 2);

  if (input.reduceOnly) params.reduceOnly = true;

  if (input.closePosition) params.closePosition = true;



  return signedRequest<BinanceOrderResponse>("POST", ORDER_PATH, params);

}



export async function placeMarketOrder(input: Omit<PlaceOrderInput, "type" | "price">, context?: LiveExecutionContext): Promise<BinanceOrderResponse> {

  return placeFuturesOrder({ ...input, type: "MARKET" }, context);

}



export async function placeLimitOrder(input: PlaceOrderInput, context?: LiveExecutionContext): Promise<BinanceOrderResponse> {

  return placeFuturesOrder({ ...input, type: "LIMIT" }, context);

}



export async function cancelFuturesOrder(symbol: string, orderId: number, context?: LiveExecutionContext): Promise<BinanceOrderResponse> {

  assertLiveContext(context);

  return signedRequest<BinanceOrderResponse>("DELETE", ORDER_PATH, { symbol, orderId });

}



export async function cancelAllFuturesOrders(symbol: string, context?: LiveExecutionContext): Promise<unknown> {

  assertLiveContext(context);

  return signedRequest("DELETE", ["/fapi", "/v1", "/allOpenOrders"].join(""), { symbol });

}



export async function changeLeverage(symbol: string, leverage: number, context?: LiveExecutionContext): Promise<unknown> {

  assertLiveContext(context);

  return signedRequest("POST", LEVERAGE_PATH, { symbol, leverage: Math.floor(leverage) });

}



export async function changeMarginType(symbol: string, marginType: "ISOLATED" | "CROSSED", context?: LiveExecutionContext): Promise<unknown> {

  assertLiveContext(context);

  return signedRequest("POST", MARGIN_TYPE_PATH, { symbol, marginType });

}



export async function queryOrder(symbol: string, orderId: number, context?: LiveExecutionContext): Promise<BinanceOrderResponse> {
  assertLiveContext(context);
  const { signedGet } = await import("./binanceHttpClient");
  return signedGet<BinanceOrderResponse>(ORDER_PATH, { symbol, orderId });
}



export interface TpSlOrderInput {

  symbol: string;

  side: BinanceOrderSide;

  stopPrice: number;

  closePosition?: boolean;

  quantity?: number;

  pricePrecision?: number;

}



export async function placeStopLossOrder(input: TpSlOrderInput, context?: LiveExecutionContext): Promise<BinanceOrderResponse> {

  assertLiveContext(context);

  return signedRequest<BinanceOrderResponse>("POST", ALGO_ORDER_PATH, {

    symbol: input.symbol,

    side: input.side,

    type: "STOP_MARKET",

    stopPrice: toDecimalString(input.stopPrice, input.pricePrecision ?? 2),

    closePosition: input.closePosition ?? true,

    workingType: "MARK_PRICE"

  });

}



export async function placeTakeProfitOrder(input: TpSlOrderInput, context?: LiveExecutionContext): Promise<BinanceOrderResponse> {

  assertLiveContext(context);

  return signedRequest<BinanceOrderResponse>("POST", ALGO_ORDER_PATH, {

    symbol: input.symbol,

    side: input.side,

    type: "TAKE_PROFIT_MARKET",

    stopPrice: toDecimalString(input.stopPrice, input.pricePrecision ?? 2),

    closePosition: input.closePosition ?? true,

    workingType: "MARK_PRICE"

  });

}



export async function placeStopMarket(input: TpSlOrderInput, context?: LiveExecutionContext): Promise<BinanceOrderResponse> {

  return placeStopLossOrder(input, context);

}



export async function placeTakeProfitMarket(input: TpSlOrderInput, context?: LiveExecutionContext): Promise<BinanceOrderResponse> {

  return placeTakeProfitOrder(input, context);

}


