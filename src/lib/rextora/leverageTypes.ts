export type LeverageRiskLevel = "낮음" | "보통" | "높음";

export interface LeverageDecision {
  leverage: number;
  leverageLabel: string;
  riskLevel: LeverageRiskLevel;
  reason: string;
  cappedBy: string[];
}

export interface LeverageDecisionInput {
  aiScore: number;
  finalScore: number;
  symbol: string;
  volatility?: number;
  spread?: number;
  fundingFee?: number;
  learningLeverageMultiplier?: number;
  consecutiveLosses?: number;
  recentWinRate?: number;
  costPass?: boolean;
}
