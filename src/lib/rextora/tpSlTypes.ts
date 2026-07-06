export type LiveExecutionStatus = "LIVE_READY" | "LIVE_BLOCKED" | "LIVE_EXECUTING" | "LIVE_ERROR" | "LIVE_EMERGENCY_STOPPED";

export interface TpSlOrderIds {
  tpOrderId?: number;
  slOrderId?: number;
}

export interface TpSlPrices {
  takeProfitPrice: number;
  stopLossPrice: number;
  source: "percentage" | "atr";
}

export interface TpSlPlacementResult {
  ok: boolean;
  symbol: string;
  tpOrderId?: number;
  slOrderId?: number;
  verified: boolean;
  message: string;
  failedCount: number;
}

export interface TpSlManagerStatus {
  active: boolean;
  ready: boolean;
  openTpSlCount: number;
  failedTpSlCount: number;
  lastPlacement?: TpSlPlacementResult;
  message: string;
}
