import type { BacktestTrade } from "./backtestEngine";

export interface MonthlyReturnRow {
  month: string;
  returnPct: number;
  trades: number;
  mdd: number;
  fees: number;
}

export interface BacktestReport {
  strategyName: string;
  strategyHash: string;
  strategyId: string;
  sourceStatus: string;
  symbol: string;
  symbols: string[];
  timeframe: string;
  fromDate: string | null;
  toDate: string | null;
  candleCount: number;
  totalReturn: number;
  mdd: number;
  tradeCount: number;
  winRate: number;
  averageTrade: number;
  profitFactor: number;
  maxConsecutiveLosses: number;
  feeImpact: number;
  feeTotal: number;
  slippageTotal: number;
  monthlyReturns: MonthlyReturnRow[];
  negativeMonths: number;
  startingBalance: number;
  endingBalance: number;
  costStress?: Array<{
    multiplier: number;
    totalReturn: number;
    mdd: number;
    tradeCount: number;
    negativeMonths: number;
  }>;
  validation: {
    paramsHashVerified: boolean;
    feesApplied: boolean;
    slippageApplied: boolean;
    fundingApplied: boolean;
    noRealOrders: true;
  };
}

export interface BacktestConfig {
  strategyId: string;
  symbols: string[];
  timeframe: string;
  fromOpenTime?: number;
  toOpenTime?: number;
  balance: number;
  feeRate: number;
  slippageRate: number;
  fundingRate: number;
  applyFunding: boolean;
  applySpread: boolean;
  spreadRate: number;
  costStressMultipliers: number[];
  costGuardK: number;
  baseBalPct?: number;
  maxConcurrent?: number;
}

export interface SavedBacktestResult {
  id: string;
  createdAt: string;
  config: BacktestConfig;
  report: BacktestReport;
  trades: BacktestTrade[];
}
