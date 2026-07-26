/**
 * Strategy library deletion safety — reference-aware classifications.
 * Never deletes SAFE. Never sends exchange orders.
 */

import fs from "node:fs";
import path from "node:path";
import {
  deleteStrategy,
  getStrategyById,
  listStrategies,
  saveStrategy,
} from "../strategy/strategyStore";
import type { StoredStrategyV1 } from "../strategy/definition/bridge";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
} from "../strategy/strategyTypes";
import { listSavedBacktests } from "../backtest/backtestStore";
import { listPaperSessions } from "../paper/paperSessionStore";
import {
  RESEARCH_PROVENANCE_DETACH_MARKER as DETACH_MARKER,
  RESEARCH_PROVENANCE_SNAPSHOT_PREFIX as SNAPSHOT_PREFIX,
  isProvenanceDetached,
} from "./researchProvenance";
import {
  parseSourceResearchJobId,
  parseSourceTrialIteration,
} from "./researchResultsSummary";
import { writeDeletionAudit } from "./deletionSafety";

export type StrategyDeletionClass =
  | "deletable"
  | "detach_then_delete"
  | "archive_only"
  | "absolute_protect";

export interface StrategyDeletionImpact {
  strategyId: string;
  classification: StrategyDeletionClass;
  reasonsKo: string[];
  nextActionKo: string;
  backtestRefs: string[];
  paperRefs: string[];
  liveRefs: string[];
  sourceResearchJobId: string | null;
  provenanceDetached: boolean;
  protectedItems: string[];
}

export function classificationLabelKo(c: StrategyDeletionClass): string {
  switch (c) {
    case "deletable":
      return "바로 삭제 가능";
    case "detach_then_delete":
      return "연결 해제 후 삭제 가능";
    case "archive_only":
      return "보관만 가능";
    case "absolute_protect":
      return "절대 보호";
  }
}

export { isProvenanceDetached };

function liveRefsForStrategy(strategyId: string): string[] {
  try {
    const liveSession = path.join(
      process.cwd(),
      "data",
      "rextora",
      "live-dry-run",
      "session.json",
    );
    if (!fs.existsSync(liveSession)) return [];
    const raw = JSON.parse(fs.readFileSync(liveSession, "utf8")) as {
      strategyId?: string;
    };
    return raw.strategyId === strategyId ? [strategyId] : [];
  } catch {
    return [];
  }
}

export function previewStrategyDeletion(
  strategyId: string,
): StrategyDeletionImpact {
  const strategy = getStrategyById(strategyId);
  if (!strategy) {
    return {
      strategyId,
      classification: "absolute_protect",
      reasonsKo: ["전략을 찾을 수 없습니다."],
      nextActionKo: "전략 ID를 확인하세요.",
      backtestRefs: [],
      paperRefs: [],
      liveRefs: [],
      sourceResearchJobId: null,
      provenanceDetached: false,
      protectedItems: ["missing"],
    };
  }

  if (
    strategy.id === SAFE_STRATEGY_ID ||
    strategy.paramsHash === EXPECTED_SAFE_PARAMS_HASH ||
    strategy.locked
  ) {
    return {
      strategyId,
      classification: "absolute_protect",
      reasonsKo: ["SAFE·잠금 전략은 삭제할 수 없습니다."],
      nextActionKo: "다른 사용자 전략만 삭제할 수 있습니다.",
      backtestRefs: [],
      paperRefs: [],
      liveRefs: [],
      sourceResearchJobId: parseSourceResearchJobId(strategy.description),
      provenanceDetached: isProvenanceDetached(strategy.description),
      protectedItems: ["SAFE"],
    };
  }

  let backtestRefs: string[] = [];
  try {
    backtestRefs = listSavedBacktests(500)
      .filter((b) => b.strategyId === strategyId)
      .map((b) => b.id);
  } catch {
    backtestRefs = [];
  }

  let paperRefs: string[] = [];
  try {
    paperRefs = listPaperSessions()
      .filter((s) => s.strategyId === strategyId)
      .map((s) => s.id);
  } catch {
    paperRefs = [];
  }

  const liveRefs = liveRefsForStrategy(strategyId);
  const sourceResearchJobId = parseSourceResearchJobId(strategy.description);
  const provenanceDetached = isProvenanceDetached(strategy.description);

  if (strategy.liveActive) {
    return {
      strategyId,
      classification: "absolute_protect",
      reasonsKo: ["실전 활성 전략은 먼저 비활성화해야 합니다."],
      nextActionKo: "실전 연결을 해제한 뒤 다시 시도하세요.",
      backtestRefs,
      paperRefs,
      liveRefs,
      sourceResearchJobId,
      provenanceDetached,
      protectedItems: ["live_active"],
    };
  }

  if (strategy.paperActive) {
    return {
      strategyId,
      classification: "detach_then_delete",
      reasonsKo: ["모의매매에 연결되어 있습니다."],
      nextActionKo: "모의매매 연결 해제 후 삭제하거나, 관련 기록 포함 삭제를 선택하세요.",
      backtestRefs,
      paperRefs,
      liveRefs,
      sourceResearchJobId,
      provenanceDetached,
      protectedItems: paperRefs.map((id) => `paper:${id}`),
    };
  }

  if (backtestRefs.length > 0 || liveRefs.length > 0) {
    return {
      strategyId,
      classification: "detach_then_delete",
      reasonsKo: [
        "Backtest 또는 Live dry-run 참조가 있습니다. 기록은 자체 완결이므로 연결 해제 후 전략만 삭제할 수 있습니다.",
      ],
      nextActionKo:
        "연결 영향 확인 → 연결 해제 후 삭제(이력 유지) 또는 관련 기록 포함 삭제.",
      backtestRefs,
      paperRefs,
      liveRefs,
      sourceResearchJobId,
      provenanceDetached,
      protectedItems: [
        ...backtestRefs.map((id) => `backtest:${id}`),
        ...liveRefs.map((id) => `live:${id}`),
      ],
    };
  }

  return {
    strategyId,
    classification: "deletable",
    reasonsKo: ["참조가 없어 바로 삭제할 수 있습니다."],
    nextActionKo: "삭제 확인 후 실행하세요.",
    backtestRefs,
    paperRefs,
    liveRefs,
    sourceResearchJobId,
    provenanceDetached,
    protectedItems: [],
  };
}

/**
 * Snapshot provenance into description and mark detached so Research Job
 * hard-delete is no longer blocked by this strategy reference.
 * Strategy remains fully executable (params stay on disk).
 */
export function detachResearchProvenance(strategyId: string): StoredStrategyV1 {
  const strategy = getStrategyById(strategyId);
  if (!strategy) throw new Error(`strategy not found: ${strategyId}`);
  if (strategy.id === SAFE_STRATEGY_ID || strategy.locked) {
    throw new Error("SAFE 전략의 출처를 해제할 수 없습니다.");
  }
  const jobId = parseSourceResearchJobId(strategy.description);
  const iteration = parseSourceTrialIteration(strategy.description);
  if (!jobId) {
    throw new Error("연구 출처가 없는 전략입니다.");
  }
  if (isProvenanceDetached(strategy.description)) {
    return strategy;
  }
  const snapshot = {
    sourceResearchJobId: jobId,
    sourceTrialIteration: iteration,
    paramsHash: strategy.paramsHash,
    symbol: strategy.symbols?.[0] ?? "BTCUSDT",
    timeframe: strategy.timeframe,
    detachedAt: new Date().toISOString(),
  };
  // Strip live deletion-graph binding; keep immutable snapshot for display.
  let desc = strategy.description ?? "";
  desc = desc.replace(/sourceResearchJobId=[^\s·]+/g, "");
  desc = `${desc} · ${DETACH_MARKER} · ${SNAPSHOT_PREFIX}${JSON.stringify(snapshot)}`
    .replace(/\s·\s·/g, " · ")
    .trim();
  const updated = saveStrategy(strategyId, { description: desc });
  writeDeletionAudit({
    action: "detach_research_provenance",
    strategyId,
    sourceResearchJobId: jobId,
    snapshot,
  });
  return updated;
}

export function deleteStrategyWithSafety(
  strategyId: string,
  options?: {
    /** When true, allow delete even with backtest/paper refs (records kept). */
    detachRefsFirst?: boolean;
    includeRelatedRecords?: boolean;
  },
): { deleted: true; strategyId: string } {
  const preview = previewStrategyDeletion(strategyId);
  if (preview.classification === "absolute_protect") {
    throw new Error(preview.reasonsKo[0] ?? "삭제할 수 없습니다.");
  }
  if (preview.classification === "detach_then_delete") {
    if (options?.includeRelatedRecords) {
      // Related Backtest/Paper records are independently stored; we delete the
      // strategy only after optional paper deactivation. Cascade file deletes
      // for backtests/paper are intentionally NOT implemented here to avoid
      // destroying operator history unless a dedicated cascade store API exists.
      if (preview.paperRefs.length > 0) {
        throw new Error(
          "모의매매 세션이 있습니다. 모의매매를 먼저 종료한 뒤 전략을 삭제하세요.",
        );
      }
    } else if (options?.detachRefsFirst) {
      // Backtest history remains; strategy file removed — backtests keep strategyId string.
      if (preview.paperRefs.length > 0) {
        throw new Error(
          "모의매매 연결을 먼저 해제하세요.",
        );
      }
    } else {
      throw new Error(
        `${preview.reasonsKo[0]} 다음: ${preview.nextActionKo}`,
      );
    }
  }
  if (preview.sourceResearchJobId && !preview.provenanceDetached) {
    try {
      detachResearchProvenance(strategyId);
    } catch {
      /* may already lack provenance */
    }
  }
  deleteStrategy(strategyId);
  writeDeletionAudit({
    action: "delete_strategy",
    strategyId,
    classification: preview.classification,
    backtestRefs: preview.backtestRefs,
    paperRefs: preview.paperRefs,
    liveRefs: preview.liveRefs,
  });
  return { deleted: true, strategyId };
}

/** Strategies that still block Research Job deletion via live sourceResearchJobId. */
export function strategiesBlockingResearchJob(jobId: string): string[] {
  return listStrategies()
    .filter((s) => {
      if (s.id === SAFE_STRATEGY_ID || s.paramsHash === EXPECTED_SAFE_PARAMS_HASH) {
        return false;
      }
      if (isProvenanceDetached(s.description)) return false;
      return parseSourceResearchJobId(s.description) === jobId;
    })
    .map((s) => s.id);
}
