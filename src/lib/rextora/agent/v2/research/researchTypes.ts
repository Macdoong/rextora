export type ResearchEvidenceKind =
  | "search_job"
  | "search_trial"
  | "top_result"
  | "strategy"
  | "backtest";

export interface VerifiedResearchMetrics {
  totalReturn: number | null;
  mdd: number | null;
  tradeCount: number | null;
  profitFactor: number | null;
  totalCost: number | null;
}

export interface ResearchConfiguration {
  symbol: string;
  timeframe: string;
  patternIds: string[];
  parametersHash: string | null;
}

export interface ResearchEvidence {
  evidenceId: string;
  kind: ResearchEvidenceKind;
  sourceId: string;
  verified: true;
  configuration: ResearchConfiguration | null;
  metrics: VerifiedResearchMetrics | null;
  status: string;
  rejectionReasons: string[];
  recordedAt: string;
}

export interface ResearchGap {
  code: "missing_completed_search" | "missing_metrics" | "missing_cost" | "missing_backtest" | "untried_configuration";
  summaryKo: string;
  evidenceRefs: string[];
}

export interface ResearchPlanDraftV2 {
  symbol: string;
  timeframe: string;
  patternIds: string[];
  reasonKo: string;
  evidenceRefs: string[];
  duplicateOf: string | null;
  retestJustification: string | null;
  executionStarted: false;
}

export interface ResearchRecommendation {
  kind: "search" | "backtest" | "insufficient_evidence";
  summaryKo: string;
  evidenceRefs: string[];
  targetEvidenceId: string | null;
  expectedReturn: null;
}

