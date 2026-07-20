import type { TradeDirection } from "./types";

export type ExecutionSide = "LONG" | "SHORT";
export type ExecutionSideLabel = "롱" | "숏";
export type ExecutionCandidateStatus = "진입 가능" | "대기" | "제외";

export interface ExecutionCandidate {
  id: string;
  symbol: string;
  side: ExecutionSide;
  sideLabel: ExecutionSideLabel;
  aiScore: number;
  finalScore: number;
  confidence: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  costPass: boolean;
  costReason: string;
  leverage: number;
  leverageLabel: string;
  positionSizePct: number;
  learningScoreDelta: number;
  learningReason: string;
  learningConfidence: number;
  leverageReason: string;
  riskLevel: "낮음" | "보통" | "높음";
  status: ExecutionCandidateStatus;
  rejectReason?: string;
  source: {
    signal: string;
    ai: string;
    cost: string;
  };
}

export type QueueItemStatus = "대기" | "실행 중" | "완료" | "제외" | "실패";

export type CandidateQueueStatus = "큐 가능" | "보류" | "제외";

export type CandidateRuntimeStatusLabel = "진입 가능" | "보류" | "대기" | "제외";

export interface CandidateQueueDisplay {
  queueStatus: CandidateQueueStatus;
  runtimeStatusLabel: CandidateRuntimeStatusLabel;
  queueReason?: string;
}

export interface QueueItem {
  id: string;
  symbol: string;
  side: ExecutionSide;
  sideLabel: ExecutionSideLabel;
  finalScore: number;
  status: QueueItemStatus;
  reason?: string;
  candidate: ExecutionCandidate;
}

export interface ExecutionQueueResult {
  mode: "PAPER" | "LIVE";
  received: number;
  queued: number;
  executed: number;
  skipped: number;
  failed: number;
  items: QueueItem[];
  summaryMessage: string;
  processedAt: string;
}

export interface ExecutionQueueSummary {
  received: number;
  queued: number;
  executing?: number;
  executed: number;
  skipped: number;
  failed: number;
  summaryMessage: string;
  processedAt: string | null;
  recentItems: Array<{
    symbol: string;
    sideLabel: ExecutionSideLabel;
    status: QueueItemStatus;
    reason?: string;
    leverage?: number;
    riskLevel?: string;
  }>;
}
