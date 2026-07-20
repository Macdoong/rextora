import { getRextoraSettings } from "./settings/settingsService";
import { getAccountState } from "./accountStateStore";
import { getOpenPositions } from "./positionManager";
import type {
  ExecutionCandidate,
  ExecutionQueueResult,
  ExecutionQueueSummary,
  QueueItem,
  QueueItemStatus,
  CandidateQueueDisplay
} from "./executionCandidateTypes";
import type { AiCandidate, EngineResult, TradingMode } from "./types";

let lastQueueResult: ExecutionQueueResult | null = null;
const recentExecutionTimestamps: number[] = [];

export function getLastExecutionQueueResult(): ExecutionQueueResult | null {
  return lastQueueResult;
}

export function summarizeExecutionQueue(result?: ExecutionQueueResult | null): ExecutionQueueSummary {
  const source = result ?? lastQueueResult;
  if (!source) {
    return {
      received: 0,
      queued: 0,
      executing: 0,
      executed: 0,
      skipped: 0,
      failed: 0,
      summaryMessage: "아직 실행 큐 결과가 없습니다.",
      processedAt: null,
      recentItems: []
    };
  }
  return {
    received: source.received,
    queued: source.queued,
    executing: source.items.filter((item) => item.status === "실행 중").length,
    executed: source.executed,
    skipped: source.skipped,
    failed: source.failed,
    summaryMessage: source.summaryMessage,
    processedAt: source.processedAt,
    recentItems: source.items.slice(0, 5).map((item) => ({
      symbol: item.symbol,
      sideLabel: item.sideLabel,
      status: item.status,
      reason: item.reason,
      leverage: item.candidate.leverage,
      riskLevel: item.candidate.riskLevel
    }))
  };
}

function openPositionSymbols(mode: TradingMode): Set<string> {
  if (mode === "LIVE") {
    return new Set(
      getAccountState()
        .positions.filter((p) => p.side !== "FLAT" && p.quantity > 0)
        .map((p) => p.symbol)
    );
  }
  return new Set(getOpenPositions().map((p) => p.symbol));
}

function openPositionCount(mode: TradingMode): number {
  if (mode === "LIVE") {
    return getAccountState().positions.filter((p) => p.side !== "FLAT" && p.quantity > 0).length;
  }
  return getOpenPositions().filter((p) => p.quantity > 0 && p.side !== "Flat").length;
}

function pruneMinuteWindow(now: number, windowMs = 60_000): void {
  while (recentExecutionTimestamps.length > 0 && now - recentExecutionTimestamps[0] > windowMs) {
    recentExecutionTimestamps.shift();
  }
}

function evaluateCandidateQueueItem(
  candidate: ExecutionCandidate,
  context: {
    maxEntriesPerScan: number;
    maxConcurrent: number;
    preventDuplicate: boolean;
    openSymbols: Set<string>;
    currentCount: number;
    queued: number;
    plannedSymbols: Set<string>;
  }
): { queueItemStatus: QueueItemStatus; reason?: string; display: CandidateQueueDisplay; incrementsQueued: boolean } {
  if (!candidate.costPass || candidate.status === "제외") {
    return {
      queueItemStatus: "제외",
      reason: candidate.rejectReason ?? candidate.costReason ?? "진입 조건 미통과",
      display: {
        queueStatus: "제외",
        runtimeStatusLabel: "제외",
        queueReason: candidate.rejectReason ?? candidate.costReason ?? "진입 조건 미통과"
      },
      incrementsQueued: false
    };
  }

  if (candidate.status === "대기") {
    return {
      queueItemStatus: "제외",
      reason: candidate.rejectReason ?? "시장 조건 대기",
      display: {
        queueStatus: "제외",
        runtimeStatusLabel: "대기",
        queueReason: candidate.rejectReason ?? "시장 조건 대기"
      },
      incrementsQueued: false
    };
  }

  if (candidate.status !== "진입 가능") {
    return {
      queueItemStatus: "제외",
      reason: candidate.rejectReason ?? "진입 조건 미통과",
      display: {
        queueStatus: "제외",
        runtimeStatusLabel: "제외",
        queueReason: candidate.rejectReason ?? "진입 조건 미통과"
      },
      incrementsQueued: false
    };
  }

  if (context.queued >= context.maxEntriesPerScan) {
    const reason = `스캔당 최대 ${context.maxEntriesPerScan}개 제한`;
    return {
      queueItemStatus: "제외",
      reason,
      display: { queueStatus: "보류", runtimeStatusLabel: "보류", queueReason: reason },
      incrementsQueued: false
    };
  }

  if (context.preventDuplicate && (context.openSymbols.has(candidate.symbol) || context.plannedSymbols.has(candidate.symbol))) {
    const reason = "중복 심볼 포지션 방지";
    return {
      queueItemStatus: "제외",
      reason,
      display: { queueStatus: "보류", runtimeStatusLabel: "보류", queueReason: reason },
      incrementsQueued: false
    };
  }

  if (context.currentCount + context.queued >= context.maxConcurrent) {
    const reason = `최대 동시 포지션 ${context.maxConcurrent}개 초과`;
    return {
      queueItemStatus: "제외",
      reason,
      display: { queueStatus: "보류", runtimeStatusLabel: "보류", queueReason: reason },
      incrementsQueued: false
    };
  }

  return {
    queueItemStatus: "대기",
    reason: undefined,
    display: { queueStatus: "큐 가능", runtimeStatusLabel: "진입 가능" },
    incrementsQueued: true
  };
}

export function computeCandidateQueueDisplays(
  candidates: ExecutionCandidate[],
  mode: TradingMode = "PAPER"
): Map<string, CandidateQueueDisplay> {
  const settings = getRextoraSettings();
  const maxEntriesPerScan = settings.execution.maxEntriesPerScan ?? 3;
  const maxConcurrent = settings.execution.maxConcurrentPositions ?? settings.risk.maxPositions;
  const preventDuplicate = settings.execution.preventDuplicateSymbolPosition;
  const openSymbols = openPositionSymbols(mode);
  const currentCount = openPositionCount(mode);
  const sorted = [...candidates].sort((a, b) => b.finalScore - a.finalScore);
  const displays = new Map<string, CandidateQueueDisplay>();
  let queued = 0;
  const plannedSymbols = new Set<string>();

  for (const candidate of sorted) {
    const evaluation = evaluateCandidateQueueItem(candidate, {
      maxEntriesPerScan,
      maxConcurrent,
      preventDuplicate,
      openSymbols,
      currentCount,
      queued,
      plannedSymbols
    });
    displays.set(`${candidate.symbol}:${candidate.side}`, evaluation.display);
    if (evaluation.incrementsQueued) {
      queued += 1;
      plannedSymbols.add(candidate.symbol);
    }
  }

  return displays;
}

export function listTradableCandidateSymbols(candidates: ExecutionCandidate[]): string[] {
  return candidates
    .filter((candidate) => candidate.status === "진입 가능" && candidate.costPass)
    .map((candidate) => candidate.symbol);
}

export function buildExecutionQueue(
  candidates: ExecutionCandidate[],
  mode: TradingMode = "PAPER"
): ExecutionQueueResult {
  const settings = getRextoraSettings();
  const maxEntriesPerScan = settings.execution.maxEntriesPerScan ?? 3;
  const maxConcurrent = settings.execution.maxConcurrentPositions ?? settings.risk.maxPositions;
  const preventDuplicate = settings.execution.preventDuplicateSymbolPosition;
  const openSymbols = openPositionSymbols(mode);
  const currentCount = openPositionCount(mode);

  const sorted = [...candidates].sort((a, b) => b.finalScore - a.finalScore);
  const items: QueueItem[] = [];
  let queued = 0;
  let skipped = 0;
  const plannedSymbols = new Set<string>();

  for (const candidate of sorted) {
    const evaluation = evaluateCandidateQueueItem(candidate, {
      maxEntriesPerScan,
      maxConcurrent,
      preventDuplicate,
      openSymbols,
      currentCount,
      queued,
      plannedSymbols
    });

    const status = evaluation.queueItemStatus;
    const reason = evaluation.reason;

    if (status === "제외") skipped += 1;
    if (evaluation.incrementsQueued) {
      queued += 1;
      plannedSymbols.add(candidate.symbol);
    }

    items.push({
      id: `queue-${candidate.id}`,
      symbol: candidate.symbol,
      side: candidate.side,
      sideLabel: candidate.sideLabel,
      finalScore: candidate.finalScore,
      status,
      reason,
      candidate
    });
  }

  const result: ExecutionQueueResult = {
    mode: mode === "LIVE" ? "LIVE" : "PAPER",
    received: candidates.length,
    queued,
    executed: 0,
    skipped,
    failed: 0,
    items,
    summaryMessage: `수신 ${candidates.length} · 대기 ${queued} · 제외 ${skipped}`,
    processedAt: new Date().toISOString()
  };

  lastQueueResult = result;
  return result;
}

export interface ProcessExecutionQueueOptions {
  mode: TradingMode;
  executePaper?: (candidate: ExecutionCandidate) => Promise<EngineResult>;
  executeLive?: (candidate: AiCandidate) => Promise<EngineResult>;
  toAiCandidate?: (candidate: ExecutionCandidate, rank: number) => AiCandidate;
  queueDelayMs?: number;
  maxEntriesPerMinute?: number;
}

export async function processExecutionQueue(
  queue: ExecutionQueueResult,
  options: ProcessExecutionQueueOptions
): Promise<ExecutionQueueResult> {
  const settings = getRextoraSettings();
  const delayMs = options.queueDelayMs ?? settings.execution.queueDelayMs ?? 1000;
  const maxPerMinute = options.maxEntriesPerMinute ?? settings.execution.maxEntriesPerMinute ?? 3;
  pruneMinuteWindow(Date.now());

  let executed = 0;
  let failed = 0;
  let skipped = queue.skipped;

  for (const item of queue.items) {
    if (item.status !== "대기") continue;

    if (recentExecutionTimestamps.length >= maxPerMinute) {
      item.status = "제외";
      item.reason = `분당 최대 ${maxPerMinute}개 제한`;
      skipped += 1;
      queue.queued -= 1;
      continue;
    }

    item.status = "실행 중";

    try {
      let result: EngineResult;
      if (options.mode === "LIVE") {
        if (!options.executeLive || !options.toAiCandidate) {
          item.status = "실패";
          item.reason = "실전 실행 핸들러 없음";
          failed += 1;
          continue;
        }
        result = await options.executeLive(options.toAiCandidate(item.candidate, item.finalScore));
      } else {
        if (!options.executePaper) {
          item.status = "실패";
          item.reason = "모의 실행 핸들러 없음";
          failed += 1;
          continue;
        }
        result = await options.executePaper(item.candidate);
      }

      if (result.ok) {
        item.status = "완료";
        item.reason = result.message;
        executed += 1;
        recentExecutionTimestamps.push(Date.now());
      } else {
        item.status = "실패";
        item.reason = result.message;
        failed += 1;
      }
    } catch (error) {
      item.status = "실패";
      item.reason = error instanceof Error ? error.message : "실행 오류";
      failed += 1;
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const updated: ExecutionQueueResult = {
    ...queue,
    executed,
    skipped,
    failed,
    summaryMessage: `수신 ${queue.received} · 실행 ${executed} · 제외 ${skipped} · 실패 ${failed}`,
    processedAt: new Date().toISOString()
  };

  lastQueueResult = updated;
  return updated;
}

export function resetExecutionQueueStateForTests(): void {
  lastQueueResult = null;
  recentExecutionTimestamps.length = 0;
}
